import {
  ArrowLeft, BookOpenText, ChevronDown, ChevronUp, Copy, Crop, FileText, FileUp, Highlighter, ImagePlus, LayoutGrid, ListTree, LoaderCircle,
  Maximize, Minus, MoreHorizontal, NotebookPen, PanelLeft, Plus, Search, Sparkles, TextQuote, Trash2, Type, X,
} from 'lucide-react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { createNote, db } from '../lib/db'
import { putImage } from '../lib/blobs'
import {
  canReopen, cleanTitle, forgetRecord, getRecord, HL_COLORS, openPdf, pageToParagraphs, pdfjs, pickPdf, recentRecords, reopen, saveRecord,
  type Highlight, type HighlightColor, type PdfRecord,
} from '../lib/margins'
import { usePhone } from '../lib/mobile'
import { toast } from '../lib/toast'
import { NoteEditor, type EditorApi } from './NoteEditor'
import { IconButton, MenuItem, Popover } from './ui'

type Size = { w: number; h: number }
type Tint = 'paper' | 'warm' | 'night'
type Side = 'contents' | 'pages' | 'marks' | 'search'
interface Sel { page: number; text: string; rects: [number, number, number, number][]; x: number; y: number }
interface OutlineRow { title: string; page: number | null; depth: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any

const TINTS: { key: Tint; label: string }[] = [{ key: 'paper', label: 'Original' }, { key: 'warm', label: 'Warm' }, { key: 'night', label: 'Night' }]
const pref = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('folio.margins.' + k); return v ? (JSON.parse(v) as T) : d } catch { return d } }
const setPref = (k: string, v: unknown) => { try { localStorage.setItem('folio.margins.' + k, JSON.stringify(v)) } catch { /* private mode */ } }
const isTyping = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName)) }
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`)
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
const txt = (text: string, styles: Record<string, boolean> = {}) => ({ type: 'text', text, styles })
const pageLink = (n: number, label = `p. ${n}`) => ({ type: 'link', href: `#page=${n}`, content: [txt(label)] })

/** Margins: read a PDF beside a Folio note. One PDF at a time, read straight from your file. */
export default function Margins({ incoming, onIncomingDone, onOpenNote, chrome, onReading }: {
  incoming: { file: File; handle?: FileSystemFileHandle } | null; onIncomingDone: () => void; onOpenNote: (id: string) => void
  /** The app's phone header and bottom tabs, shown around the home screen (not while reading). */
  chrome?: { top: React.ReactNode; bottom: React.ReactNode }
  /** Tells the app a PDF is open, so it can tuck its own sidebar away and give the page room. */
  onReading?: (on: boolean) => void
}) {
  const phone = usePhone()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [rec, setRec] = useState<PdfRecord | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [recents, setRecents] = useState<PdfRecord[]>([])
  const docRef = useRef<PDFDocumentProxy | null>(null)

  const refreshRecents = useCallback(() => { recentRecords().then(setRecents) }, [])
  useEffect(refreshRecents, [refreshRecents])

  const load = useCallback(async (file: File, handle?: FileSystemFileHandle) => {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast('That isn’t a PDF.'); return }
    setLoading(file.name)
    try {
      const d = await openPdf(await file.arrayBuffer())
      const fp = d.fingerprints[0] ?? `${file.name}:${file.size}`
      const meta = await d.getMetadata().catch(() => null)
      const metaTitle = String((meta?.info as { Title?: string } | undefined)?.Title ?? '').trim()
      const old = await getRecord(fp)
      const next: PdfRecord = {
        fp, name: file.name, title: old?.title ? cleanTitle(old.title, file.name) : cleanTitle(metaTitle, file.name),
        size: file.size, pages: d.numPages, page: Math.min(old?.page ?? 1, d.numPages), zoom: old?.zoom ?? 'fit', noteId: old?.noteId ?? null,
        highlights: old?.highlights ?? [], openedAt: Date.now(), thumb: old?.thumb, handle: handle ?? old?.handle,
      }
      if (!next.thumb) next.thumb = await thumbOf(d).catch(() => undefined)
      await saveRecord(next)
      await docRef.current?.loadingTask.destroy().catch(() => undefined)
      docRef.current = d
      setRec(next); setDoc(d)
      if (old && old.page > 1) toast(`Back to page ${next.page}`)
    } catch (e) {
      console.warn('[margins] open', e)
      toast((e as Error).name === 'PasswordException' ? 'This PDF is password-protected.' : 'Couldn’t open that PDF.')
    } finally { setLoading(null) }
  }, [])

  useEffect(() => { if (incoming) { load(incoming.file, incoming.handle); onIncomingDone() } }, [incoming, load, onIncomingDone])
  useEffect(() => () => { void docRef.current?.loadingTask.destroy() }, [])
  useEffect(() => {
    onReading?.(!!doc)
    if (doc) document.documentElement.dataset.reading = '1'
    return () => { onReading?.(false); delete document.documentElement.dataset.reading }
  }, [doc, onReading])

  const open = async () => { const r = await pickPdf(); if (r) load(r.file, r.handle) }
  const resume = async (r: PdfRecord) => {
    const f = await reopen(r)
    if (f) return load(f, r.handle)
    toast(`Pick “${r.name}” to carry on where you left off`)
    const p = await pickPdf(); if (p) load(p.file, p.handle)
  }
  const close = async () => { await docRef.current?.loadingTask.destroy().catch(() => undefined); docRef.current = null; setDoc(null); setRec(null); refreshRecents() }

  if (doc && rec) return <Reader key={rec.fp} doc={doc} rec={rec} setRec={setRec} onClose={close} onOpen={open} onOpenNote={onOpenNote} phone={phone} />
  return (
    <>
      {chrome?.top}
      <Home recents={recents} loading={loading} onOpen={open} onResume={resume} onForget={async (r) => { await forgetRecord(r.fp); refreshRecents() }} onOpenNote={onOpenNote} />
      {chrome?.bottom}
    </>
  )
}

async function thumbOf(d: PDFDocumentProxy) {
  const p = await d.getPage(1)
  const v = p.getViewport({ scale: 1 })
  const vp = p.getViewport({ scale: 96 / v.width })
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
  await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
  return c.toDataURL('image/jpeg', 0.72)
}

// ================================================================ home (nothing open)
function Home({ recents, loading, onOpen, onResume, onForget, onOpenNote }: {
  recents: PdfRecord[]; loading: string | null; onOpen: () => void; onResume: (r: PdfRecord) => void; onForget: (r: PdfRecord) => void; onOpenNote: (id: string) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-8 md:pb-16">
      <div className="mx-auto max-w-[920px]">
        <div className="flex flex-wrap items-end gap-4 pb-6 pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[.16em] text-accent">Margins</div>
            <h1 className="font-title mt-1 text-[32px] leading-tight tracking-tight sm:text-[46px]">Read a PDF, write beside it</h1>
            <p className="mt-2 max-w-[560px] text-[15px] text-muted">Highlight, quote and snap pages straight into a note. Folio reads the file where it is and never copies it — it only remembers your page, highlights and notes.</p>
          </div>
          <button type="button" onClick={onOpen} disabled={!!loading} className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent shadow-lg shadow-black/25 transition-transform active:scale-95 disabled:opacity-60">
            {loading ? <LoaderCircle size={17} className="animate-spin" /> : <FileUp size={17} />} {loading ? 'Opening…' : 'Open a PDF'}
          </button>
        </div>

        {recents.length > 0 ? (
          <section aria-label="Recent PDFs" className="space-y-2.5">
            <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[.12em] text-muted">Pick up where you left off</h2>
            {recents.map((r) => (
              <div key={r.fp} className="group flex items-center gap-4 rounded-2xl border border-line bg-card/70 px-4 py-3 transition-colors hover:border-accent/40">
                <button type="button" onClick={() => onResume(r)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  {r.thumb ? <img src={r.thumb} alt="" className="h-[62px] w-[46px] shrink-0 rounded-[4px] object-cover shadow-md shadow-black/30" />
                    : <span className="flex h-[62px] w-[46px] shrink-0 items-center justify-center rounded-[4px] bg-wash text-muted"><FileText size={18} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="font-title block truncate text-[19px] leading-snug">{r.title}</span>
                    <span className="block truncate text-[12.5px] text-muted">{r.name} · {fmtSize(r.size)} · opened {ago(r.openedAt)}</span>
                  </span>
                  <span className="hidden w-48 shrink-0 sm:block">
                    <span className="block text-[12.5px] text-ink-2">Page {r.page} of {r.pages}{r.highlights.length ? ` · ${r.highlights.length} highlight${r.highlights.length === 1 ? '' : 's'}` : ''}</span>
                    <span className="mt-1.5 block h-1 rounded-full bg-wash"><span className="block h-1 rounded-full bg-accent" style={{ width: `${Math.round((r.page / Math.max(1, r.pages)) * 100)}%` }} /></span>
                  </span>
                  <span className="hidden shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-2 group-hover:border-accent/50 sm:inline">{r.handle && canReopen() ? 'Continue' : 'Find file'}</span>
                </button>
                {r.noteId && <IconButton size="sm" label="Open the notes" onClick={() => onOpenNote(r.noteId!)}><NotebookPen size={16} /></IconButton>}
                <IconButton size="sm" label="Forget this PDF" onClick={() => onForget(r)}><X size={16} /></IconButton>
              </div>
            ))}
          </section>
        ) : (
          <button type="button" onClick={onOpen} className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line px-6 py-16 text-center text-muted transition-colors hover:border-accent/50 hover:text-ink">
            <BookOpenText size={34} className="text-accent" />
            <span className="font-title text-[22px] text-ink">Drop a PDF here, or pick one</span>
            <span className="text-[13.5px]">Papers, reports, manuals, books — anything you read and want to think about.</span>
          </button>
        )}
        <ul className="mt-8 grid gap-3 text-[13.5px] text-ink-2 sm:grid-cols-3">
          <li className="rounded-2xl bg-wash px-4 py-3"><b className="mb-1 flex items-center gap-2 text-ink"><Highlighter size={15} className="text-accent" /> Highlight & quote</b>Select text to highlight it or quote it into your note, with a link back to the page.</li>
          <li className="rounded-2xl bg-wash px-4 py-3"><b className="mb-1 flex items-center gap-2 text-ink"><Crop size={15} className="text-accent" /> Snap pages</b>Drag over a chart, table or diagram and it lands in your note as a picture.</li>
          <li className="rounded-2xl bg-wash px-4 py-3"><b className="mb-1 flex items-center gap-2 text-ink"><Type size={15} className="text-accent" /> Text view</b>Small print on a phone? Reflow any page into comfortable, resizable text.</li>
        </ul>
      </div>
    </div>
  )
}

// ================================================================ reader
function Reader({ doc, rec, setRec, onClose, onOpen, onOpenNote, phone }: {
  doc: PDFDocumentProxy; rec: PdfRecord; setRec: (r: PdfRecord) => void; onClose: () => void; onOpen: () => void; onOpenNote: (id: string) => void; phone: boolean
}) {
  const [sizes, setSizes] = useState<Size[]>(() => Array.from({ length: doc.numPages }, () => ({ w: 612, h: 792 })))
  const [paneW, setPaneW] = useState(800)
  const [zoom, setZoom] = useState<number | 'fit'>(rec.zoom ?? 'fit')
  const [page, setPage] = useState(rec.page || 1)
  const [visible, setVisible] = useState<Set<number>>(new Set())
  const [side, setSide] = useState<Side | null>(() => (phone ? null : pref<Side | null>('side', 'contents')))
  const [notesOpen, setNotesOpen] = useState(() => !phone && !!rec.noteId && pref('notes', true))
  const [notesW, setNotesW] = useState(() => pref('notesW', 440))
  const [tint, setTint] = useState<Tint>(() => pref<Tint>('tint', 'warm'))
  const [mode, setMode] = useState<'page' | 'text'>('page')
  const [snapping, setSnapping] = useState(false)
  const [sel, setSel] = useState<Sel | null>(null)
  const [menu, setMenu] = useState<null | 'more'>(null)
  const [ai, setAi] = useState<null | { title: string; body?: string; error?: string; page: number; quote?: string }>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ q: string; results: { page: number; snippet: string }[]; busy: boolean } | null>(null)
  const [outline, setOutline] = useState<OutlineRow[] | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const apiRef = useRef<EditorApi | null>(null)
  const pending = useRef<Block[][]>([])
  const recRef = useRef(rec)
  recRef.current = rec
  const textCache = useRef(new Map<number, string>())

  // ---- page sizes (all pages; cheap) + outline
  useEffect(() => {
    let dead = false
    ;(async () => {
      const out: Size[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i); const v = p.getViewport({ scale: 1 })
        out.push({ w: v.width, h: v.height })
        if (i === 1 || i % 40 === 0 || i === doc.numPages) { if (dead) return; setSizes((s) => [...out, ...s.slice(out.length)]) }
      }
    })()
    ;(async () => {
      const o = await doc.getOutline().catch(() => null)
      if (!o?.length) { if (!dead) setOutline([]); return }
      const rows: OutlineRow[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = async (items: any[], depth: number) => {
        for (const it of items) {
          let pg: number | null = null
          try {
            const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
            if (Array.isArray(dest) && dest[0]) pg = (typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])) + 1
          } catch { /* unresolvable */ }
          rows.push({ title: String(it.title ?? '').trim() || 'Untitled', page: pg, depth })
          if (it.items?.length && depth < 2) await walk(it.items, depth + 1)
        }
      }
      await walk(o, 0)
      if (!dead) setOutline(rows)
    })()
    return () => { dead = true }
  }, [doc])
  useEffect(() => { if (outline && outline.length === 0 && side === 'contents') setSide('pages') }, [outline, side])

  // ---- layout
  useEffect(() => {
    const el = scroller.current; if (!el) return
    const ro = new ResizeObserver(() => setPaneW(el.clientWidth))
    ro.observe(el); setPaneW(el.clientWidth)
    return () => ro.disconnect()
  }, [mode])
  const maxPageW = useMemo(() => Math.max(...sizes.slice(0, 20).map((s) => s.w)), [sizes])
  const fitScale = Math.max(0.3, Math.min(3, Math.min(paneW - (phone ? 16 : 56), 980) / maxPageW))
  const scale = zoom === 'fit' ? fitScale : zoom
  const gap = phone ? 10 : 18

  // ---- which pages are near the screen (render only those)
  useEffect(() => {
    const root = scroller.current; if (!root) return
    const io = new IntersectionObserver((entries) => {
      setVisible((prev) => {
        const next = new Set(prev)
        for (const e of entries) { const n = Number((e.target as HTMLElement).dataset.page); if (e.isIntersecting) next.add(n); else next.delete(n) }
        return next
      })
    }, { root, rootMargin: '900px 0px' })
    pageEls.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [doc, mode, sizes.length])

  // ---- current page from scroll position
  const onScroll = () => {
    const root = scroller.current; if (!root) return
    const mid = root.scrollTop + root.clientHeight * 0.35
    let best = 1
    for (const [n, el] of pageEls.current) if (el.offsetTop <= mid && n > best) best = n
    if (best !== page) setPage(best)
  }
  const goTo = useCallback((n: number, smooth = true) => {
    const p = Math.max(1, Math.min(doc.numPages, n))
    if (mode === 'text') { setPage(p); return }
    const el = pageEls.current.get(p); const root = scroller.current
    if (el && root) root.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' })
    setPage(p)
  }, [doc.numPages, mode])
  // restore the remembered page once sizes are known
  const restored = useRef(false)
  useEffect(() => { if (!restored.current && sizes[0] && rec.page > 1) { restored.current = true; requestAnimationFrame(() => goTo(rec.page, false)) } }, [sizes, rec.page, goTo])
  // Zooming keeps the same spot on the page under your eyes (no jump back to the page top).
  const lastScale = useRef(scale)
  useLayoutEffect(() => {
    const prev = lastScale.current; if (Math.abs(prev - scale) < 0.001) return
    lastScale.current = scale
    const el = scroller.current; if (!el) return
    const r = scale / prev
    const cy = el.scrollTop + el.clientHeight / 2, cx = el.scrollLeft + el.clientWidth / 2
    el.scrollTop = cy * r - el.clientHeight / 2; el.scrollLeft = Math.max(0, cx * r - el.clientWidth / 2)
  }, [scale])
  // Pinch (touch) and ctrl/⌘ + scroll or trackpad pinch (laptops) zoom the pages.
  const scaleRef = useRef(scale); scaleRef.current = scale
  useEffect(() => {
    const el = scroller.current; if (!el || mode !== 'page') return
    const clamp = (z: number) => Math.round(Math.max(0.4, Math.min(4, z)) * 100) / 100
    let raf = 0, want = 0
    const apply = (z: number) => { want = z; if (!raf) raf = requestAnimationFrame(() => { raf = 0; setZoom(clamp(want)) }) }
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); apply((want && raf ? want : scaleRef.current) * Math.exp(-e.deltaY * 0.0022)) }
    let d0 = 0, z0 = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = scaleRef.current } }
    const onMove = (e: TouchEvent) => { if (e.touches.length === 2 && d0) { e.preventDefault(); apply(z0 * (dist(e.touches) / d0)) } }
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) d0 = 0 }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: false }); el.addEventListener('touchend', onEnd)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('wheel', onWheel); el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [mode])

  // ---- remember page/zoom
  useEffect(() => {
    const t = window.setTimeout(() => { const r = { ...recRef.current, page, zoom }; void saveRecord(r); setRec(r) }, 700)
    return () => window.clearTimeout(t)
  }, [page, zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPref('tint', tint), [tint])
  useEffect(() => { if (!phone) setPref('side', side) }, [side, phone])
  useEffect(() => { if (!phone) setPref('notes', notesOpen) }, [notesOpen, phone])

  // ---- the linked note
  const noteFor = useCallback(async (): Promise<string> => {
    const r = recRef.current
    if (r.noteId) { const n = await db.notes.get(r.noteId); if (n && n.trashedAt === null) return n.id }
    const n = await createNote({
      title: `${r.title} — notes`, icon: '📄',
      content: [{ type: 'paragraph', content: [txt(`Notes on ${r.name} · ${r.pages} pages`, { italic: true })] }, { type: 'paragraph' }],
    })
    const next = { ...recRef.current, noteId: n.id }
    await saveRecord(next); setRec(next)
    return n.id
  }, [setRec])
  const addToNote = useCallback(async (blocks: Block[]) => {
    await noteFor()
    if (apiRef.current && notesOpen) { apiRef.current.append(blocks); return }
    pending.current.push(blocks)
    setNotesOpen(true)
  }, [noteFor, notesOpen])
  const onReady = useCallback((api: EditorApi | null) => {
    apiRef.current = api
    if (api && pending.current.length) { const q = pending.current; pending.current = []; setTimeout(() => q.forEach((b) => api.append(b)), 60) }
  }, [])
  const toggleNotes = async () => { if (!notesOpen) await noteFor(); setNotesOpen(!notesOpen) }

  // ---- highlights
  const saveHighlights = async (list: Highlight[]) => { const r = { ...recRef.current, highlights: list }; await saveRecord(r); setRec(r) }
  const addHighlight = async (s: Sel, color: HighlightColor) => {
    await saveHighlights([...recRef.current.highlights, { id: nanoid(8), page: s.page, color, text: s.text, rects: s.rects, at: Date.now() }])
    window.getSelection()?.removeAllRanges(); setSel(null)
  }
  const quote = async (text: string, n: number) => {
    await addToNote([{ type: 'quote', content: [txt(`“${text.trim()}” `), pageLink(n)] }])
    toast(`Quoted p. ${n} into your notes`)
  }

  // ---- snapshots
  const snap = async (n: number, r?: { x: number; y: number; w: number; h: number }) => {
    setSnapping(false)
    try {
      const p = await doc.getPage(n)
      const base = p.getViewport({ scale: 1 })
      const box = r ?? { x: 0, y: 0, w: base.width, h: base.height }
      if (box.w < 8 || box.h < 8) return
      const s = Math.min(4, Math.max(1.5, 1500 / box.w))
      const vp = p.getViewport({ scale: s })
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
      await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      const out = document.createElement('canvas'); out.width = Math.round(box.w * s); out.height = Math.round(box.h * s)
      const ctx = out.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(c, box.x * s, box.y * s, box.w * s, box.h * s, 0, 0, out.width, out.height)
      const ref = await putImage(out.toDataURL('image/jpeg', 0.9))
      await addToNote([
        { type: 'image', props: { url: ref, name: `${recRef.current.title} p${n}.jpg`, caption: `${recRef.current.title} · page ${n}`, previewWidth: r ? Math.min(560, Math.max(220, Math.round(box.w * 1.3))) : 460 } },
        { type: 'paragraph', content: [pageLink(n, `↳ Open page ${n}`)] },
      ])
      toast(r ? `Snapped part of p. ${n} into your notes` : `Snapped page ${n} into your notes`)
    } catch (e) { console.warn('[margins] snap', e); toast('Couldn’t snap that page.') }
  }

  // ---- text of a page (search, AI, text view)
  const pageText = useCallback(async (n: number) => {
    const hit = textCache.current.get(n); if (hit !== undefined) return hit
    const p = await doc.getPage(n); const tc = await p.getTextContent()
    const paras = pageToParagraphs(tc.items as never[], p.getViewport({ scale: 1 }).height)
    const s = paras.map((x) => (x.kind === 'h' ? `## ${x.text}` : x.text)).join('\n\n')
    textCache.current.set(n, s); return s
  }, [doc])

  // ---- search
  const runSearch = async (q: string) => {
    const term = q.trim().toLowerCase(); if (!term) { setHits(null); return }
    setSide('search'); setHits({ q: term, results: [], busy: true })
    const results: { page: number; snippet: string }[] = []
    for (let i = 1; i <= doc.numPages && results.length < 300; i++) {
      const t = (await pageText(i)).replace(/^## /gm, '')
      const low = t.toLowerCase(); let at = low.indexOf(term)
      while (at >= 0 && results.length < 300) {
        results.push({ page: i, snippet: `${at > 40 ? '…' : ''}${t.slice(Math.max(0, at - 40), at + term.length + 60).replace(/\s+/g, ' ')}…` })
        at = low.indexOf(term, at + term.length + 80)
      }
      if (i % 25 === 0) setHits({ q: term, results: [...results], busy: true })
    }
    setHits({ q: term, results, busy: false })
    if (results[0]) goTo(results[0].page)
  }

  // ---- AI
  const askAbout = async (kind: 'explain' | 'summary', n: number, passage?: string) => {
    setAi({ title: kind === 'explain' ? 'Explain' : `Summary of page ${n}`, page: n, quote: passage })
    try {
      const { askAI } = await import('../lib/voice')
      const context = (await pageText(n)).slice(0, 9000)
      const body = kind === 'explain'
        ? await askAI('You help someone reading a document. Explain clearly and briefly in plain language, defining any jargon. Never invent facts that are not supported by the text. Markdown allowed, no preamble.',
          `Document: ${rec.title}, page ${n}.\n\nThe page says:\n${context}\n\nExplain this passage:\n"""${passage}"""`, 700)
        : await askAI('You summarise pages of documents for someone taking notes. Output 3–7 concise Markdown bullet points with the key points, figures and definitions, exactly as stated. No preamble, no invented facts.',
          `Document: ${rec.title}, page ${n}.\n\n${context || '(This page has no selectable text.)'}`, 700)
      setAi((a) => (a ? { ...a, body } : a))
    } catch (e) { setAi((a) => (a ? { ...a, error: (e as Error).message } : a)) }
  }
  const aiToNote = async () => {
    if (!ai?.body) return
    const { markdownToBlocks } = await import('../lib/voice')
    const head: Block[] = [{ type: 'heading', props: { level: 3 }, content: [txt(`${ai.title} `), pageLink(ai.page)] }]
    if (ai.quote) head.push({ type: 'quote', content: [txt(`“${ai.quote}”`)] })
    await addToNote([...head, ...(await markdownToBlocks(ai.body))])
    setAi(null); toast('Added to your notes')
  }

  // ---- text selection → toolbar
  useEffect(() => {
    const onUp = () => setTimeout(() => {
      const s = window.getSelection()
      if (!s || s.isCollapsed || !s.rangeCount) { setSel(null); return }
      const range = s.getRangeAt(0)
      const host = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('[data-page]') as HTMLElement | null
      if (!host || !scroller.current?.contains(host)) { setSel(null); return }
      const n = Number(host.dataset.page); const box = host.getBoundingClientRect()
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1)
        .map((r) => [(r.left - box.left) / scale, (r.top - box.top) / scale, r.width / scale, r.height / scale] as [number, number, number, number])
      const text = s.toString().replace(/\s+/g, ' ').trim()
      if (!text || !rects.length) { setSel(null); return }
      const b = range.getBoundingClientRect()
      setSel({ page: n, text, rects: mergeRects(rects), x: b.left + b.width / 2, y: b.top })
    }, 10)
    document.addEventListener('mouseup', onUp); document.addEventListener('touchend', onUp)
    return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('touchend', onUp) }
  }, [scale])
  useEffect(() => { const clear = () => setSel(null); const el = scroller.current; el?.addEventListener('scroll', clear, { passive: true }); return () => el?.removeEventListener('scroll', clear) }, [mode])

  // ---- links in the note ("p. 12") jump the PDF
  const notesHost = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = notesHost.current; if (!el) return
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href*="#page="]') as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault(); e.stopPropagation()
      const n = Number(a.getAttribute('href')!.split('#page=')[1]); if (n) { setMode('page'); setTimeout(() => goTo(n), 30) }
    }
    el.addEventListener('click', onClick, true)
    return () => el.removeEventListener('click', onClick, true)
  }, [goTo, notesOpen])

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSide('search'); setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Search in PDF"]')?.focus(), 30); return }
      if (isTyping()) return
      if (e.key === 'Escape') { if (snapping) setSnapping(false); else if (sel) setSel(null); else if (ai) setAi(null); return }
      if (e.ctrlKey || e.metaKey || e.altKey) { if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomBy(1.15) } if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.15) } if (e.key === '0') { e.preventDefault(); setZoom('fit') } return }
      if (e.key === 'ArrowRight' || e.key === 'j' || (mode === 'text' && e.key === 'PageDown')) { e.preventDefault(); goTo(page + 1) }
      if (e.key === 'ArrowLeft' || e.key === 'k' || (mode === 'text' && e.key === 'PageUp')) { e.preventDefault(); goTo(page - 1) }
      if (e.key === 's') { e.preventDefault(); setSnapping((v) => !v) }
      if (e.key === 't') { e.preventDefault(); setMode((m) => (m === 'page' ? 'text' : 'page')) }
      if (e.key === 'n') { e.preventDefault(); void toggleNotes() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const zoomBy = (f: number) => setZoom((z) => Math.round(Math.max(0.4, Math.min(4, (z === 'fit' ? fitScale : z) * f)) * 100) / 100)

  // ---- notes panel resize (desktop)
  const drag = (e: React.PointerEvent) => {
    const start = e.clientX, w0 = notesW
    const move = (ev: PointerEvent) => setNotesW(Math.max(320, Math.min(window.innerWidth * 0.6, w0 - (ev.clientX - start))))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setNotesW((w) => { setPref('notesW', w); return w }) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const hlByPage = useMemo(() => { const m = new Map<number, Highlight[]>(); for (const h of rec.highlights) m.set(h.page, [...(m.get(h.page) ?? []), h]); return m }, [rec.highlights])
  const pct = Math.round((page / doc.numPages) * 100)

  const sidePanel = side && (
    <aside aria-label="PDF sidebar" className={`${phone ? 'fixed inset-y-0 left-0 z-50 w-[min(86vw,340px)] shadow-2xl animate-drawer' : 'w-[264px] shrink-0'} flex flex-col border-r border-line/70 bg-side`}>
      <div className="flex items-center gap-1 p-2">
        <div role="tablist" aria-label="Sidebar" className="flex flex-1 rounded-lg bg-wash p-0.5 text-[12.5px]">
          {([['contents', 'Contents', <ListTree key="c" size={14} />], ['pages', 'Pages', <LayoutGrid key="p" size={14} />], ['marks', 'Marks', <Highlighter key="m" size={14} />], ['search', 'Find', <Search key="s" size={14} />]] as const).map(([k, l, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={side === k} title={l} onClick={() => setSide(k)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 ${side === k ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{icon}<span className="max-[1180px]:hidden">{l}</span></button>
          ))}
        </div>
        {phone && <IconButton size="sm" label="Close" onClick={() => setSide(null)}><X size={16} /></IconButton>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {side === 'contents' && (outline === null ? <p className="px-2 py-3 text-[13px] text-muted">Reading contents…</p>
          : outline.length === 0 ? <p className="px-2 py-3 text-[13px] text-muted">This PDF has no table of contents.</p>
          : outline.map((o, i) => {
            const active = o.page !== null && o.page <= page && !outline.slice(i + 1).some((x) => x.page !== null && x.page <= page && x.page > (o.page ?? 0))
            return (
              <button key={i} type="button" disabled={o.page === null} onClick={() => { if (o.page) { goTo(o.page); if (phone) setSide(null) } }}
                className={`flex w-full items-baseline gap-2 rounded-md py-1.5 pr-2 text-left text-[13.5px] leading-snug ${active ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'text-ink-2 hover:bg-wash'}`} style={{ paddingLeft: 8 + o.depth * 14 }}>
                <span className="min-w-0 flex-1">{o.title}</span>{o.page && <span className="shrink-0 text-[11.5px] text-faint">{o.page}</span>}
              </button>
            )
          }))}
        {side === 'pages' && <Thumbs doc={doc} sizes={sizes} page={page} tint={tint} onGo={(n) => { goTo(n); if (phone) setSide(null) }} marks={hlByPage} />}
        {side === 'marks' && (rec.highlights.length === 0 ? <p className="px-2 py-3 text-[13px] leading-relaxed text-muted">Select text on a page to highlight it. Your highlights show up here, ready to quote into your notes.</p>
          : [...rec.highlights].sort((a, b) => a.page - b.page || a.at - b.at).map((h) => (
            <div key={h.id} className="group mb-1.5 rounded-lg border border-line/70 bg-card/60 p-2.5 text-[13px]" style={{ boxShadow: `inset 3px 0 0 ${HL_COLORS[h.color]}` }}>
              <button type="button" onClick={() => goTo(h.page)} className="block w-full text-left leading-snug text-ink-2 hover:text-ink">“{h.text.length > 220 ? h.text.slice(0, 220) + '…' : h.text}”</button>
              <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-faint">
                <span className="flex-1">p. {h.page}</span>
                <button type="button" onClick={() => quote(h.text, h.page)} className="rounded px-1.5 py-0.5 hover:bg-wash hover:text-ink">Quote</button>
                <button type="button" aria-label="Remove highlight" onClick={() => saveHighlights(rec.highlights.filter((x) => x.id !== h.id))} className="rounded px-1 py-0.5 hover:bg-wash hover:text-ink"><Trash2 size={12} /></button>
              </div>
            </div>
          )))}
        {side === 'marks' && rec.highlights.length > 1 && (
          <button type="button" onClick={() => addToNote([{ type: 'heading', props: { level: 3 }, content: [txt('Highlights')] }, ...[...rec.highlights].sort((a, b) => a.page - b.page).map((h) => ({ type: 'quote', content: [txt(`“${h.text}” `), pageLink(h.page)] }))])}
            className="mt-2 w-full rounded-lg bg-wash py-2 text-[12.5px] text-ink-2 hover:bg-wash-2">Quote all {rec.highlights.length} into notes</button>
        )}
        {side === 'search' && (
          <div>
            <form onSubmit={(e) => { e.preventDefault(); runSearch(query) }} className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-canvas/50 px-2.5 focus-within:border-accent">
              <Search size={14} className="text-muted" />
              <input aria-label="Search in PDF" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in this PDF" className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
            </form>
            {hits && <p className="px-1 pb-1.5 text-[12px] text-muted">{hits.busy ? 'Searching…' : `${hits.results.length}${hits.results.length >= 300 ? '+' : ''} result${hits.results.length === 1 ? '' : 's'}`}</p>}
            {hits?.results.map((r, i) => (
              <button key={i} type="button" onClick={() => { goTo(r.page); if (phone) setSide(null) }} className="mb-1 block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug text-ink-2 hover:bg-wash">
                <span className="mb-0.5 block text-[11px] font-medium text-accent-ink">Page {r.page}</span>{r.snippet}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <header className="z-20 box-content flex h-13 shrink-0 items-center gap-1 border-b border-line/60 bg-canvas/80 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <IconButton label="Close PDF" onClick={onClose}><ArrowLeft size={19} /></IconButton>
        <IconButton label="Sidebar" active={!!side} onClick={() => setSide(side ? null : 'contents')}><PanelLeft size={18} /></IconButton>
        <div className="min-w-0 flex-1 px-1">
          <div className="font-title truncate text-[16px] leading-tight">{rec.title}</div>
          <div className="truncate text-[11.5px] text-faint max-sm:hidden">{rec.name} · read from your device, not copied</div>
        </div>
        <div role="group" aria-label="View" className="flex rounded-full bg-wash p-0.5 text-[12.5px] max-sm:hidden">
          <button type="button" onClick={() => setMode('page')} className={`rounded-full px-3 py-1 ${mode === 'page' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>Page</button>
          <button type="button" onClick={() => setMode('text')} title="Reflow this page as text (T)" className={`rounded-full px-3 py-1 ${mode === 'text' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>Text</button>
        </div>
        {mode === 'page' && (
          <div className="flex items-center max-md:hidden">
            <IconButton size="sm" label="Zoom out (Ctrl −)" onClick={() => zoomBy(1 / 1.15)}><Minus size={16} /></IconButton>
            <button type="button" onClick={() => setZoom('fit')} title="Fit width (Ctrl 0)" className="w-14 rounded-md py-1 text-center text-[12.5px] text-ink-2 hover:bg-wash">{zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}</button>
            <IconButton size="sm" label="Zoom in (Ctrl +)" onClick={() => zoomBy(1.15)}><Plus size={16} /></IconButton>
          </div>
        )}
        {mode === 'page' && <IconButton label="Snap part of a page into notes (S)" active={snapping} onClick={() => setSnapping(!snapping)}><Crop size={18} /></IconButton>}
        <IconButton label="Find (Ctrl F)" onClick={() => { setSide('search'); setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Search in PDF"]')?.focus(), 30) }} className="max-sm:hidden"><Search size={18} /></IconButton>
        <div className="relative">
          <IconButton label="More" active={menu === 'more'} onClick={() => setMenu(menu ? null : 'more')}><MoreHorizontal size={19} /></IconButton>
          <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="right-0 top-11 w-64">
            <div className="px-3 pb-1 pt-1 text-[11.5px] font-semibold uppercase tracking-[.08em] text-faint">Page colour</div>
            <div className="mb-1 grid grid-cols-3 gap-1 px-2">
              {TINTS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTint(t.key)} className={`flex flex-col items-center gap-1 rounded-lg border py-1.5 text-[11.5px] ${tint === t.key ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
                  <span className={`h-6 w-9 rounded border border-black/10 tint-swatch-${t.key}`} />{t.label}
                </button>
              ))}
            </div>
            <div className="my-1 h-px bg-line" />
            {phone && <MenuItem icon={<Type size={15} />} onClick={() => { setMenu(null); setMode(mode === 'page' ? 'text' : 'page') }}>{mode === 'page' ? 'Text view' : 'Page view'}</MenuItem>}
            {phone && <MenuItem icon={<Search size={15} />} onClick={() => { setMenu(null); setSide('search') }}>Find in PDF</MenuItem>}
            <MenuItem icon={<ImagePlus size={15} />} onClick={() => { setMenu(null); snap(page) }}>Snap page {page} into notes</MenuItem>
            <MenuItem icon={<Sparkles size={15} />} onClick={() => { setMenu(null); askAbout('summary', page) }}>Summarise page {page}</MenuItem>
            {rec.noteId && <MenuItem icon={<NotebookPen size={15} />} onClick={() => { setMenu(null); onOpenNote(rec.noteId!) }}>Open notes as a full page</MenuItem>}
            <MenuItem icon={<FileUp size={15} />} onClick={() => { setMenu(null); onOpen() }}>Open another PDF…</MenuItem>
          </Popover>
        </div>
        <button type="button" onClick={toggleNotes} aria-pressed={notesOpen} aria-label="Notes" title="Notes beside the PDF (N)"
          className={`ml-0.5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${notesOpen ? 'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] text-ink' : 'bg-accent text-on-accent'}`}>
          <NotebookPen size={15} /><span className="max-[420px]:hidden">Notes</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {phone && side && <div className="animate-fade fixed inset-0 z-40 bg-scrim" onClick={() => setSide(null)} />}
        {sidePanel}

        {/* pages */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {mode === 'page' ? (
            <div ref={scroller} onScroll={onScroll} className={`pdf-scroller min-h-0 flex-1 overflow-auto ${snapping ? 'snapping' : ''}`} data-tint={tint}>
              <div className="mx-auto flex w-max min-w-full flex-col items-center" style={{ gap, padding: `${gap}px ${phone ? 8 : 28}px 120px` }}>
                {sizes.map((sz, i) => (
                  <PageView key={i} n={i + 1} doc={doc} size={sz} scale={scale} near={visible.has(i + 1)} tint={tint} highlights={hlByPage.get(i + 1)} hitQuery={hits?.q}
                    register={(el) => { if (el) pageEls.current.set(i + 1, el); else pageEls.current.delete(i + 1) }}
                    snapping={snapping} onSnap={(r) => snap(i + 1, r)} />
                ))}
              </div>
            </div>
          ) : (
            <TextView doc={doc} n={page} total={doc.numPages} onGo={goTo} getText={pageText} title={rec.title}
              onAdd={(blocks) => addToNote(blocks)} />
          )}

          {/* page pill */}
          {mode === 'page' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-pop/90 px-2 py-1 text-[12.5px] text-ink-2 shadow-lg shadow-black/30 backdrop-blur">
                <IconButton size="sm" label="Previous page" onClick={() => goTo(page - 1)}><ChevronUp size={16} /></IconButton>
                <form onSubmit={(e) => { e.preventDefault(); const v = Number((e.currentTarget.elements.namedItem('pg') as HTMLInputElement).value); if (v) goTo(v) }} className="flex items-center gap-1">
                  <input key={page} name="pg" aria-label="Page number" defaultValue={page} inputMode="numeric" className="w-10 rounded-md bg-wash px-1 py-0.5 text-center text-[12.5px] text-ink outline-none focus:ring-1 focus:ring-accent" />
                  <span className="text-muted">of {doc.numPages}</span>
                </form>
                <span className="h-1 w-24 rounded-full bg-wash max-sm:hidden"><span className="block h-1 rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                <IconButton size="sm" label="Next page" onClick={() => goTo(page + 1)}><ChevronDown size={16} /></IconButton>
              </div>
            </div>
          )}
          {snapping && (
            <div className="animate-pop pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-on-accent shadow-xl">
                <Crop size={15} /> Drag over part of a page to snap it into your notes
                <button type="button" onClick={() => snap(page)} className="rounded-full bg-black/15 px-2.5 py-0.5 hover:bg-black/25">Whole page</button>
                <button type="button" aria-label="Cancel snapping" onClick={() => setSnapping(false)} className="rounded-full p-0.5 hover:bg-black/15"><X size={15} /></button>
              </div>
            </div>
          )}
        </div>

        {/* notes */}
        {notesOpen && rec.noteId && (
          <div ref={notesHost} className={phone ? 'animate-sheet fixed inset-0 z-50 flex flex-col bg-canvas' : 'relative flex shrink-0 border-l border-line/70 bg-canvas'} style={phone ? undefined : { width: notesW }}>
            {!phone && <div onPointerDown={drag} role="separator" aria-orientation="vertical" aria-label="Resize notes" className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/30" />}
            {phone && (
              <div className="flex items-center gap-2 border-b border-line px-3 pb-2 pt-[max(env(safe-area-inset-top),10px)]">
                <span className="font-title flex-1 truncate text-[16px]">Notes · p. {page}</span>
                <button type="button" onClick={() => setNotesOpen(false)} className="rounded-full bg-wash px-3 py-1.5 text-[13px] font-medium">Back to PDF</button>
              </div>
            )}
            <div className="min-h-0 min-w-0 flex-1">
              <NoteEditor id={rec.noteId} embedded onReady={onReady} onClose={() => setNotesOpen(false)} onNavigate={onOpenNote} focus={false} setFocus={() => undefined} />
            </div>
          </div>
        )}
      </div>

      {/* selection toolbar */}
      {sel && !snapping && (
        <div role="toolbar" aria-label="Selection" className="animate-pop fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-pop p-1 shadow-2xl shadow-black/40"
          style={{ left: Math.max(150, Math.min(window.innerWidth - 150, sel.x)), top: Math.max(8, sel.y - 52) }} onMouseDown={(e) => e.preventDefault()}>
          {(Object.keys(HL_COLORS) as HighlightColor[]).map((c) => (
            <button key={c} type="button" aria-label={`Highlight ${c}`} title={`Highlight (${c})`} onClick={() => addHighlight(sel, c)} className="h-7 w-7 rounded-full border-2 border-transparent hover:border-ink/60" style={{ background: HL_COLORS[c] }} />
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={() => { quote(sel.text, sel.page); window.getSelection()?.removeAllRanges(); setSel(null) }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-wash"><TextQuote size={15} /> Quote</button>
          <button type="button" onClick={() => { askAbout('explain', sel.page, sel.text); setSel(null) }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-wash"><Sparkles size={15} /> Explain</button>
          <IconButton size="sm" label="Copy" onClick={() => { navigator.clipboard?.writeText(sel.text); toast('Copied'); setSel(null) }}><Copy size={15} /></IconButton>
        </div>
      )}

      {/* AI answer */}
      {ai && (
        <div role="dialog" aria-label={ai.title} className="animate-pop fixed bottom-5 left-1/2 z-50 flex max-h-[60vh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 flex-col rounded-2xl border border-line bg-pop shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <Sparkles size={16} className="text-accent" /><span className="flex-1 text-[14px] font-medium">{ai.title}</span>
            <IconButton size="sm" label="Close" onClick={() => setAi(null)}><X size={16} /></IconButton>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 py-3 text-[14.5px] leading-relaxed text-ink-2">
            {ai.quote && <p className="mb-2 border-l-2 border-accent pl-3 text-[13px] italic text-muted">“{ai.quote.length > 260 ? ai.quote.slice(0, 260) + '…' : ai.quote}”</p>}
            {ai.error ? <p className="text-danger">{ai.error}</p> : ai.body ? <MiniMd md={ai.body} /> : <p className="flex items-center gap-2 text-muted"><LoaderCircle size={15} className="animate-spin" /> Thinking…</p>}
          </div>
          {ai.body && (
            <div className="flex justify-end gap-2 border-t border-line px-3 py-2.5">
              <button type="button" onClick={() => { navigator.clipboard?.writeText(ai.body!); toast('Copied') }} className="rounded-lg px-3 py-1.5 text-[13px] text-muted hover:bg-wash">Copy</button>
              <button type="button" onClick={aiToNote} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-on-accent">Add to notes</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function mergeRects(rs: [number, number, number, number][]) {
  const out: [number, number, number, number][] = []
  for (const r of rs.sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - r[1]) < 2 && Math.abs(last[3] - r[3]) < 3 && r[0] <= last[0] + last[2] + 3) {
      const right = Math.max(last[0] + last[2], r[0] + r[2]); last[0] = Math.min(last[0], r[0]); last[2] = right - last[0]
    } else out.push([...r])
  }
  return out
}

// ================================================================ one page
const PageView = memo(function PageView({ n, doc, size, scale, near, highlights, hitQuery, register, snapping, onSnap }: {
  n: number; doc: PDFDocumentProxy; size: Size; scale: number; near: boolean; tint: Tint; highlights?: Highlight[]; hitQuery?: string
  register: (el: HTMLDivElement | null) => void; snapping: boolean; onSnap: (r: { x: number; y: number; w: number; h: number }) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(0)
  const [box, setBox] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null)
  const w = Math.floor(size.w * scale), h = Math.floor(size.h * scale)

  const drawnAt = useRef(0)
  useEffect(() => {
    // Far from the screen: let the browser have the memory back (big PDFs stay light).
    if (!near) {
      if (!drawnAt.current) return
      const t = window.setTimeout(() => { const c = canvas.current; if (c) { c.width = 0; c.height = 0 } text.current?.replaceChildren(); drawnAt.current = 0 }, 1500)
      return () => window.clearTimeout(t)
    }
    let dead = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    // While zooming, wait for the pinch/ctrl-scroll to settle; the old picture stretches meanwhile.
    const t = window.setTimeout(async () => {
      try {
        const p: PDFPageProxy = await doc.getPage(n); if (dead) return
        // Sharp on high-DPI screens, but never more than ~8 megapixels per page (keeps phones fast).
        const base = p.getViewport({ scale })
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(8_000_000 / Math.max(1, base.width * base.height)))
        const vp = p.getViewport({ scale: scale * Math.max(1, dpr) })
        const c = canvas.current; if (!c) return
        const off = document.createElement('canvas'); off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height)
        task = p.render({ canvas: off, canvasContext: off.getContext('2d')!, viewport: vp })
        await task.promise; if (dead) return
        c.width = off.width; c.height = off.height; c.getContext('2d')!.drawImage(off, 0, 0); drawnAt.current = scale
        off.width = 0; off.height = 0
        // selectable text
        const layer = text.current
        if (layer) {
          layer.replaceChildren()
          layer.style.setProperty('--scale-factor', String(scale)); layer.style.setProperty('--total-scale-factor', String(scale))
          const { TextLayer } = await pdfjs()
          const tl = new TextLayer({ textContentSource: await p.getTextContent(), container: layer, viewport: p.getViewport({ scale }) })
          await tl.render(); if (dead) return
          setDrawn((d) => d + 1)
        }
      } catch (e) { if ((e as Error).name !== 'RenderingCancelledException') console.warn('[margins] page', n, e) }
    }, drawnAt.current ? 140 : 30)
    return () => { dead = true; window.clearTimeout(t); task?.cancel() }
  }, [near, scale, doc, n])

  // mark search hits in the text layer
  useEffect(() => {
    const layer = text.current; if (!layer) return
    layer.querySelectorAll('.pdf-hit').forEach((s) => s.classList.remove('pdf-hit'))
    if (!hitQuery) return
    layer.querySelectorAll('span').forEach((s) => { if ((s.textContent ?? '').toLowerCase().includes(hitQuery)) s.classList.add('pdf-hit') })
  }, [hitQuery, drawn])

  const pt = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: Math.max(0, Math.min(w, e.clientX - r.left)), y: Math.max(0, Math.min(h, e.clientY - r.top)) } }

  return (
    <div ref={register} data-page={n} className="pdf-page relative shrink-0 bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)]" style={{ width: w, height: h }}>
      <canvas ref={canvas} className="pdf-canvas absolute inset-0 h-full w-full" aria-label={`Page ${n}`} />
      {highlights?.map((hl) => hl.rects.map((r, i) => (
        <div key={hl.id + i} className="pdf-mark pointer-events-none absolute" style={{ left: r[0] * scale, top: r[1] * scale, width: r[2] * scale, height: r[3] * scale, background: HL_COLORS[hl.color] }} />
      )))}
      <div ref={text} className="textLayer" />
      {!near && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-black/30">{n}</div>}
      {snapping && (
        <div className="absolute inset-0 z-10 cursor-crosshair touch-none"
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = pt(e); setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }) }}
          onPointerMove={(e) => { if (box) { const p = pt(e); setBox({ ...box, x1: p.x, y1: p.y }) } }}
          onPointerUp={() => { if (!box) return; const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1); const bw = Math.abs(box.x1 - box.x0), bh = Math.abs(box.y1 - box.y0); setBox(null); if (bw > 12 && bh > 12) onSnap({ x: x / scale, y: y / scale, w: bw / scale, h: bh / scale }) }}>
          {box && <div className="absolute border-2 border-accent bg-accent/15" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
        </div>
      )}
      <span className="pointer-events-none absolute -bottom-[17px] right-0 text-[10.5px] text-faint">{n}</span>
    </div>
  )
})

// ================================================================ thumbnails
function Thumbs({ doc, sizes, page, tint, onGo, marks }: { doc: PDFDocumentProxy; sizes: Size[]; page: number; tint: Tint; onGo: (n: number) => void; marks: Map<number, Highlight[]> }) {
  const root = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]))
  useEffect(() => {
    const el = root.current; if (!el) return
    const io = new IntersectionObserver((es) => setSeen((s) => { const n = new Set(s); es.forEach((e) => { if (e.isIntersecting) n.add(Number((e.target as HTMLElement).dataset.n)) }); return n }), { rootMargin: '400px 0px' })
    el.querySelectorAll('[data-n]').forEach((x) => io.observe(x))
    return () => io.disconnect()
  }, [sizes.length])
  useEffect(() => { root.current?.querySelector(`[data-n="${page}"]`)?.scrollIntoView({ block: 'nearest' }) }, [page])
  return (
    <div ref={root} className="grid grid-cols-2 gap-3 px-1 pt-1" data-tint={tint === 'night' ? 'night' : undefined}>
      {sizes.map((s, i) => (
        <button key={i} data-n={i + 1} type="button" onClick={() => onGo(i + 1)} className="group flex flex-col items-center gap-1">
          <span className={`relative block w-full overflow-hidden rounded-[3px] bg-white ring-offset-2 ring-offset-side ${page === i + 1 ? 'ring-2 ring-accent' : 'ring-1 ring-line group-hover:ring-accent/50'}`} style={{ aspectRatio: `${s.w} / ${s.h}` }}>
            {seen.has(i + 1) && <Thumb doc={doc} n={i + 1} />}
            {marks.has(i + 1) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: HL_COLORS[marks.get(i + 1)![0].color] }} />}
          </span>
          <span className={`text-[11px] ${page === i + 1 ? 'text-accent-ink' : 'text-faint'}`}>{i + 1}</span>
        </button>
      ))}
    </div>
  )
}
const thumbCache = new WeakMap<PDFDocumentProxy, Map<number, string>>()
function Thumb({ doc, n }: { doc: PDFDocumentProxy; n: number }) {
  const [src, setSrc] = useState(() => thumbCache.get(doc)?.get(n) ?? '')
  useEffect(() => {
    if (src) return
    let dead = false
    ;(async () => {
      const p = await doc.getPage(n); const v = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: 220 / v.width })
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
      await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      const url = c.toDataURL('image/jpeg', 0.75)
      if (!thumbCache.has(doc)) thumbCache.set(doc, new Map())
      thumbCache.get(doc)!.set(n, url)
      if (!dead) setSrc(url)
    })().catch(() => undefined)
    return () => { dead = true }
  }, [doc, n, src])
  return src ? <img src={src} alt="" className="pdf-canvas h-full w-full" /> : null
}

// ================================================================ text view (reflow)
function TextView({ doc, n, total, onGo, getText, title, onAdd }: {
  doc: PDFDocumentProxy; n: number; total: number; onGo: (n: number) => void; getText: (n: number) => Promise<string>; title: string; onAdd: (b: Block[]) => void
}) {
  const [md, setMd] = useState<string | null>(null)
  const [tidy, setTidy] = useState<{ n: number; md?: string; busy?: boolean; error?: string } | null>(null)
  const [size, setSize] = useState(() => pref('textSize', 20))
  const [font, setFont] = useState<'serif' | 'sans'>(() => pref('textFont', 'serif'))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setMd(null); getText(n).then(setMd); box.current?.scrollTo({ top: 0 }) }, [n, getText])
  useEffect(() => { setPref('textSize', size); setPref('textFont', font) }, [size, font])
  const shown = tidy?.n === n && tidy.md ? tidy.md : md
  const runTidy = async () => {
    setTidy({ n, busy: true })
    try {
      const { askAI } = await import('../lib/voice')
      const out = await askAI('You repair text extracted from a PDF page so it reads cleanly. Fix broken lines, hyphenation, jumbled columns, stray headers/footers and table rows (as a Markdown table). Never change, add or remove the author\'s words or facts. Output Markdown only, no preamble.',
        `Page ${n} of "${title}":\n\n${md ?? ''}`, 2400)
      setTidy({ n, md: out })
    } catch (e) { setTidy({ n, error: (e as Error).message }) }
  }
  const addPage = async () => {
    const { markdownToBlocks } = await import('../lib/voice')
    onAdd([{ type: 'heading', props: { level: 3 }, content: [txt(`From page ${n} `), pageLink(n)] }, ...(await markdownToBlocks(shown ?? ''))])
    toast(`Added page ${n}’s text to your notes`)
  }
  void doc
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-5 pb-32 pt-8 sm:px-10">
        <article className={`mx-auto max-w-[680px] text-ink-2 ${font === 'serif' ? 'font-serif' : 'font-sans'}`} style={{ fontSize: size, lineHeight: 1.72 }}>
          <div className="mb-5 flex items-center gap-3 font-sans text-[11.5px] font-semibold uppercase tracking-[.14em] text-accent">Page {n} <span className="h-px flex-1 bg-line" /></div>
          {shown === null ? <p className="text-muted">Reading…</p>
            : !shown.trim() ? <p className="font-sans text-[15px] text-muted">This page has no selectable text — it may be a scan or a picture. Switch back to Page view, or snap it into your notes.</p>
            : <MiniMd md={shown} big />}
          {tidy?.n === n && tidy.error && <p className="mt-4 font-sans text-[14px] text-danger">{tidy.error}</p>}
        </article>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line/70 bg-canvas/80 px-3 py-2 backdrop-blur">
        <IconButton size="sm" label="Previous page" onClick={() => onGo(n - 1)}><ChevronUp size={16} /></IconButton>
        <span className="text-[12.5px] text-muted">Page {n} of {total}</span>
        <IconButton size="sm" label="Next page" onClick={() => onGo(n + 1)}><ChevronDown size={16} /></IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" onClick={() => setFont(font === 'serif' ? 'sans' : 'serif')} className="rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-wash">{font === 'serif' ? 'Serif' : 'Sans'}</button>
        <input type="range" aria-label="Text size" min={15} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" />
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" onClick={runTidy} disabled={!md?.trim() || tidy?.busy} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-wash disabled:opacity-50">
          {tidy?.busy && tidy.n === n ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} className="text-accent" />} Tidy with AI
        </button>
        <button type="button" onClick={addPage} disabled={!shown?.trim()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-wash disabled:opacity-50"><NotebookPen size={14} /> Add to notes</button>
        <IconButton size="sm" label="Back to page view" onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="View"] button')?.click()}><Maximize size={14} /></IconButton>
      </div>
    </div>
  )
}

/** Tiny Markdown renderer for AI answers and reflowed text (headings, bullets, tables, bold/italic). */
function MiniMd({ md, big }: { md: string; big?: boolean }) {
  const blocks = md.replace(/\r/g, '').split(/\n{2,}/)
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <b key={i} className="text-ink">{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i} className="rounded bg-wash px-1 font-mono text-[.88em]">{p.slice(1, -1)}</code> : p.startsWith('*') && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i> : p)
  return (
    <>
      {blocks.map((b, i) => {
        const t = b.trim(); if (!t) return null
        const hm = t.match(/^(#{1,4})\s+(.*)$/)
        if (hm && !t.includes('\n')) return <h3 key={i} className={`font-title mb-2 mt-5 text-ink ${big ? 'text-[1.3em]' : 'text-[1.1em]'}`}>{inline(hm[2])}</h3>
        const lines = t.split('\n')
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) return <ul key={i} className="mb-3 list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>)}</ul>
        if (lines.length > 1 && lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
          return (
            <div key={i} className="mb-4 overflow-x-auto rounded-lg border border-line font-sans text-[.82em]">
              <table className="w-full border-collapse">
                <tbody>{rows.map((r, j) => <tr key={j} className={j === 0 ? 'bg-wash font-semibold text-ink' : 'border-t border-line'}>{r.map((c, k) => <td key={k} className="px-3 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className="mb-[0.9em]">{inline(t.replace(/\n/g, ' '))}</p>
      })}
    </>
  )
}
