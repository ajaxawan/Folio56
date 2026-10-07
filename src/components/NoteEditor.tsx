import { BlockNoteView, darkDefaultTheme, lightDefaultTheme, type Theme } from '@blocknote/mantine'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote, type DefaultReactSuggestionItem } from '@blocknote/react'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import '@blocknote/mantine/style.css'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, ArrowLeft, Check, Link2, ListTree, Printer, ChevronRight, Copy, Download, FilePlus2, FileText, History, LayoutTemplate,
  Image as ImageIcon, Layers, Presentation, Lock, LockOpen, Maximize2, MessageCircle, Mic, Smile, Sparkles, Grid3x3, Minimize2, MoreHorizontal, Palette, Pin, Plus, Send, Sun, Tag, Trash2, Type,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COVERS, EMOJI, surface, swatch } from '../lib/colors'
import { inlineRefs, putImage, urlFor, useCoverCss } from '../lib/blobs'
import { labelColor } from './LabelMenu'
import { getSessionPasscode } from '../lib/crypto'
import {
  createNote, db, duplicateNote, hasPasscode, lockNote, patchNote, readLocked,
  saveLockedContent, setTrashed, snapshot, unlockNote, updateNote,
} from '../lib/db'
import { editorExtensions, normalizeCode, schema } from '../lib/editorSchema'
import { fileToDataUrl, pickFile } from '../lib/image'
import { useAI, usePrefs } from '../lib/prefs'
import { derive } from '../lib/preview'
import type { Note, Version } from '../types'
import { ColorPicker } from './ColorPicker'
import { HistoryPanel } from './HistoryPanel'
import { LabelPicker } from './LabelPicker'
import { PasscodeDialog } from './PasscodeDialog'
import { IconButton, MenuItem, Popover, Segmented, Switch } from './ui'
import { sendNotes } from '../lib/parcelBus'
import { useKeyboardOpen, usePhone } from '../lib/mobile'
import { KeyboardBar } from './KeyboardBar'
import { MemoBanner } from './MemoBanner'
import { FormaliseSheet } from './FormaliseSheet'
import { CopySheet } from './CopySheet'
import { DictateBar } from './DictateBar'
import { SeriesSheet } from './SeriesSheet'
import { shareableBlocks } from '../lib/message'
import { formaliseText, isProcessing, processMemo } from '../lib/voice'
import { SaveTemplateDialog, TemplateDraftBar } from './TemplateBits'
import { toast } from '../lib/toast'
const TemplateGallery = lazy(() => import('./TemplateGallery').then((m) => ({ default: m.TemplateGallery })))
const ExportDialog = lazy(() => import('./ExportDialog').then((m) => ({ default: m.ExportDialog })))
const DeckStudio = lazy(() => import('./DeckStudio').then((m) => ({ default: m.DeckStudio })))
const DeckMaker = lazy(() => import('./DeckMaker').then((m) => ({ default: m.DeckMaker })))

const makeTheme = (dark = true): Theme => ({
  ...(dark ? darkDefaultTheme : lightDefaultTheme),
  colors: {
    ...(dark ? darkDefaultTheme : lightDefaultTheme).colors,
    editor: { text: 'var(--color-ink)', background: 'transparent' },
    menu: { text: 'var(--color-ink)', background: 'var(--color-pop)' },
    tooltip: { text: 'var(--color-ink)', background: 'var(--color-raised)' },
    hovered: { text: 'var(--color-ink)', background: 'var(--color-wash-2)' },
    selected: { text: 'var(--color-on-accent)', background: 'var(--color-accent)' },
    disabled: { text: 'var(--color-faint)', background: 'var(--color-pop)' },
    border: 'var(--color-line)',
    shadow: dark ? 'rgba(0,0,0,.55)' : 'rgba(40,32,20,.16)',
    sideMenu: 'var(--color-faint)',
  },
  borderRadius: 8,
  fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
})

type Ask = null | { mode: 'set' | 'enter'; then: (p: string) => void }


/** What a host (Margins) can do with an embedded editor. */
export interface EditorApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  append: (blocks: any[]) => void
  markdown: () => Promise<string>
}

export function NoteEditor({ id, onClose, onNavigate, focus, setFocus, embedded, onReady, initialNote }: {
  id: string; onClose: () => void; onNavigate: (id: string) => void; focus: boolean; setFocus: (v: boolean) => void
  /** Shown beside something else (the PDF in Margins): compact header, full width, Esc left to the host. */
  embedded?: boolean; onReady?: (api: EditorApi | null) => void
  /** The note as the list already has it, so the page can draw at once instead of waiting on the database. */
  initialNote?: Note
}) {
  const live = useLiveQuery(() => db.notes.get(id), [id])
  const note = live === undefined && initialNote?.id === id ? initialNote : live
  const [content, setContent] = useState<unknown[] | null>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [error, setError] = useState('')

  // Resolve content: plain notes directly, locked notes after passcode.
  const lockedNow = note?.locked
  useEffect(() => {
    setContent(null); setError('')
    if (!note) return
    if (!note.locked) return // plain notes read straight from the note (below), with no empty frame first
    const pass = getSessionPasscode()
    if (pass) readLocked(note, pass).then(setContent).catch(() => setError('Could not decrypt this note.'))
    else setAsk({ mode: 'enter', then: (p) => readLocked(note, p).then(setContent).catch(() => setError('Could not decrypt this note.')) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, lockedNow])

  if (note === undefined) return null
  // A plain note's editor is created from the note as it is at mount time; when Folio rewrites the
  // page (memo.v changes) the key changes and the editor is rebuilt from the new content.
  const initial = note && !note.locked ? (note.content ?? []) : content
  if (note === null || !note) return <div className="p-10 text-muted">This note no longer exists. <button className="text-accent-ink" onClick={onClose}>Go back</button></div>
  // A presentation opens in the slide studio instead of the text editor.
  if (note.deck && !embedded) return <Suspense fallback={<div className="editor-veil h-full" />}><DeckStudio key={note.id} note={note} onClose={onClose} onOpen={onNavigate} setWide={setFocus} /></Suspense>
  return (
    <>
      {initial ? (
        <EditorPage key={`${note.id}:${note.locked}:${note.memo?.v ?? 0}`} note={note} initial={initial} onClose={onClose} onNavigate={onNavigate} focus={focus} setFocus={setFocus} setAsk={setAsk} embedded={embedded} onReady={onReady} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
          <Lock size={36} />
          <p className="text-[15px]">{error || 'This note is locked'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] hover:bg-wash">Back</button>
            {!ask && <button type="button" onClick={() => setAsk({ mode: 'enter', then: (p) => readLocked(note, p).then(setContent).catch(() => setError('Could not decrypt this note.')) })}
              className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent">Unlock</button>}
          </div>
        </div>
      )}
      {ask && <PasscodeDialog mode={ask.mode} onCancel={() => setAsk(null)} onDone={(p) => { const t = ask.then; setAsk(null); t(p) }} />}
    </>
  )
}

function EditorPage({ note, initial, onClose, onNavigate, focus, setFocus, setAsk, embedded, onReady }: {
  note: Note; initial: unknown[]; onClose: () => void; onNavigate: (id: string) => void; focus: boolean; setFocus: (v: boolean) => void; setAsk: (a: Ask) => void
  embedded?: boolean; onReady?: (api: EditorApi | null) => void
}) {
  const { prefs, set, dark } = usePrefs()
  const ai = useAI()
  const [title, setTitle] = useState(note.title)
  const [menu, setMenu] = useState<null | 'type' | 'more' | 'color' | 'labels' | 'icon' | 'cover' | 'paper' | 'toc'>(null)
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved')
  const [history, setHistory] = useState(false)
  const [stats, setStats] = useState(() => derive(initial as never[]).words)
  const [chars, setChars] = useState(false)
  const phone = usePhone()
  const kbOpen = useKeyboardOpen()
  const [edFocus, setEdFocus] = useState(false)
  const [formalise, setFormalise] = useState(false)
  // Calm writing (laptop): once you start typing, the page's controls fade back until the mouse moves.
  const [calm, setCalm] = useState(false)
  const fineRef = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  useEffect(() => {
    if (!calm) return
    const wake = () => setCalm(false)
    window.addEventListener('mousemove', wake, { once: true })
    return () => window.removeEventListener('mousemove', wake)
  }, [calm])
  const [copyMsg, setCopyMsg] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [saveTpl, setSaveTpl] = useState(false)
  const [tplInsert, setTplInsert] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deckOpen, setDeckOpen] = useState(false)
  const insertAt = useRef<string | null>(null)
  const draft = note.templateDraft ?? null
  const busy = !!note.memo && (note.memo.status === 'transcribing' || note.memo.status === 'writing') && isProcessing(note.id)
  // Only this page's sub-pages and its ancestors — not the whole library (matters with thousands of notes).
  const kids = useLiveQuery(() => db.notes.where('parentId').equals(note.id).toArray(), [note.id]) ?? []
  const crumbs = useLiveQuery(async () => {
    const out: Note[] = []; let p = note.parentId; let guard = 0
    while (p && guard++ < 32) { const n = await db.notes.get(p); if (!n) break; out.unshift(n); p = n.parentId }
    return out
  }, [note.parentId]) ?? []
  const labels = useLiveQuery(() => db.labels.toArray(), []) ?? []
  const timer = useRef<number | undefined>(undefined)
  const mountV = note.memo ? (note.memo.v ?? 0) : undefined
  const dirty = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const linkGo = useRef<(id: string) => void>(() => {})
  const theme = useMemo(() => makeTheme(dark), [dark])

  const editor = useCreateBlockNote({
    schema,
    extensions: editorExtensions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: (initial?.length ? normalizeCode(initial) : undefined) as any,
    // Images are stored once in the image store; a locked note keeps them inside its encrypted text instead.
    uploadFile: async (file: File) => (note.locked ? fileToDataUrl(file) : putImage(await fileToDataUrl(file))),
    resolveFileUrl: (url: string) => urlFor(url),
    animations: false,
    domAttributes: { editor: { 'aria-label': 'Note text' } },
    // Links to other notes open in place; web links open in a new tab.
    links: {
      onClick: (e: MouseEvent) => {
        const href = (e.target as HTMLElement).closest('a')?.getAttribute('href') ?? ''
        const i = href.indexOf('#note=')
        if (i >= 0) { e.preventDefault(); linkGo.current(href.slice(i + 6)); return true }
        if (href.startsWith('#')) { e.preventDefault(); return true } // in-app anchors (e.g. Margins page links) are handled by their view
        if (href) window.open(href, '_blank', 'noopener')
        return true
      },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMd = useCallback(async (includeFolded: boolean) => String(await Promise.resolve(editor.blocksToMarkdownLossy(shareableBlocks(editor.document, includeFolded) as any))), [editor])
  const persist = useCallback(async (extra: Partial<Note> = {}) => {
    window.clearTimeout(timer.current)
    // Folio rewrote this page (voice memo / formalise) since this editor opened: never save over it.
    if (mountV !== undefined && ((await db.notes.get(note.id))?.memo?.v ?? 0) !== mountV) return
    const doc = editor.document
    if (note.locked) {
      const pass = getSessionPasscode(); if (!pass) return
      await saveLockedContent(note.id, doc, pass, extra.title ?? undefined)
      if (Object.keys(extra).some((k) => k !== 'title')) await patchNote(note.id, extra)
    } else await updateNote(note.id, { content: doc, ...extra })
    setSaved('saved')
  }, [editor, note.id, note.locked, mountV])

  // Contents for long notes: the headings, kept up to date as you write.
  const [outline, setOutline] = useState(() => outlineOf(initial as never[]))
  const [activeHead, setActiveHead] = useState('')
  // stored blocks may lack ids (imports, templates); the editor gives every block one — read the outline from it
  useEffect(() => { setOutline(outlineOf(editor.document)) }, [editor]) // eslint-disable-line react-hooks/set-state-in-effect
  const showToc = !embedded && !focus && outline.length >= 3
  useEffect(() => {
    if (!showToc) return
    const root = scroller.current; if (!root) return
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 120
      let cur = ''
      for (const h of outline) { const el = root.querySelector(`[data-id="${h.id}"]`); if (el && el.getBoundingClientRect().top <= top) cur = h.id }
      setActiveHead(cur || outline[0]?.id || '')
    }
    onScroll(); root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [showToc, outline])
  // The contents rail sits in the margin beside the page — only when the margin is wide enough.
  const [scrollerW, setScrollerW] = useState(0)
  useEffect(() => {
    const el = scroller.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setScrollerW(e.contentRect.width)); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Long outlines: top-level headings always; the ones beneath only for the section you're in.
  const tocItems = useMemo(() => {
    if (outline.length <= 12) return outline
    const top = Math.min(...outline.map((h) => h.level))
    let sec = ''; const secOf = new Map<string, string>()
    for (const h of outline) { if (h.level === top) sec = h.id; secOf.set(h.id, sec) }
    const activeSec = secOf.get(activeHead) ?? ''
    return outline.filter((h) => h.level === top || secOf.get(h.id) === activeSec)
  }, [outline, activeHead])
  const jump = (id: string) => {
    scroller.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // put the cursor at the end of that heading so you can keep writing from there
    try { editor.setTextCursorPosition(id, 'end'); editor.focus() } catch { /* block gone */ }
  }

  const onChange = () => {
    if (fineRef.current && (document.activeElement as HTMLElement | null)?.closest?.('.bn-editor')) setCalm(true)
    dirty.current = true
    setSaved('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { persist(); setStats(derive(editor.document).words); setOutline(outlineOf(editor.document)) }, 450)
  }

  // Leaving the page (or closing the Margins notes panel) never drops the last keystrokes.
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void persistRef.current() } }, [])

  // Let a host add blocks (quotes, page snapshots…) to the end of this page.
  useEffect(() => {
    if (!onReady) return
    onReady({
      append: (blocks) => {
        const doc = editor.document
        const last = doc[doc.length - 1]
        const lastEmpty = last && last.type === 'paragraph' && !(Array.isArray(last.content) && last.content.length)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (doc.length === 1 && lastEmpty) editor.replaceBlocks([last], blocks as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else editor.insertBlocks(blocks as any, lastEmpty && doc.length > 1 ? doc[doc.length - 2] : last, 'after')
        requestAnimationFrame(() => { const r = scroller.current; if (r) r.scrollTo({ top: r.scrollHeight, behavior: 'smooth' }) })
      },
      markdown: () => getMd(true),
    })
    return () => onReady(null)
  }, [editor, onReady, getMd])

  // periodic snapshot while writing
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (!dirty.current || note.locked) return
      dirty.current = false
      const fresh = await db.notes.get(note.id); if (fresh) snapshot(fresh)
    }, 5 * 60 * 1000)
    return () => window.clearInterval(t)
  }, [note.id, note.locked])

  const finish = async () => {
    await persist({ title: title.trim() })
    const fresh = await db.notes.get(note.id)
    if (!fresh) return
    if (fresh.templateDraft) return // a template's working copy is saved back into the template on close
    const hasKids = kids.length > 0
    if (!fresh.locked && !fresh.title && !fresh.preview && !fresh.checklist.length && !fresh.image && !hasKids) { await db.notes.delete(note.id); return }
    await snapshot(fresh)
  }
  // The top page of a template being edited (sub-pages of the template are edited the same way).
  const draftRoot = async () => {
    let cur = await db.notes.get(note.id); let guard = 0
    while (cur?.parentId && guard++ < 32) { const p = await db.notes.get(cur.parentId); if (!p?.templateDraft) break; cur = p }
    return cur
  }
  const closeDraft = async (save: boolean) => {
    window.clearTimeout(timer.current)
    if (save) await persist({ title: title.trim() })
    const root = await draftRoot()
    const { finishDraft } = await import('../lib/templateKit')
    const tpl = draft ? await db.templates.get(draft) : undefined
    if (root) await finishDraft(root.id, save)
    setFocus(false); onClose()
    toast(save ? `Saved template “${tpl?.name ?? 'Template'}”` : 'Changes to the template discarded')
    document.dispatchEvent(new CustomEvent('folio:templates', { detail: { id: draft } }))
  }
  const close = async () => { if (draft) return closeDraft(true); await finish(); setFocus(false); onClose() }
  const go = async (id: string) => { await finish(); onNavigate(id) }

  // ---- links between notes: type [[ to link; links open the note; "Linked from" lists notes linking here
  const linkItems = useCallback(async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const q = query.trim().toLowerCase()
    const all = await db.notes.filter((n) => n.trashedAt === null && n.id !== note.id && !n.daily && !n.templateDraft).toArray()
    const hits = all.filter((n) => !q || (n.title || '').toLowerCase().includes(q))
      .sort((a, b) => Number((b.title || '').toLowerCase().startsWith(q)) - Number((a.title || '').toLowerCase().startsWith(q)) || b.updatedAt - a.updatedAt).slice(0, 8)
    const link = (id: string, title: string) => editor.insertInlineContent([{ type: 'link', href: `#note=${id}`, content: title || 'Untitled' }, ' '])
    const items: DefaultReactSuggestionItem[] = hits.map((n) => ({ title: n.title || 'Untitled', subtext: (n.preview || '').replace(/[\u0001\u0002\u0003]/g, '').split('\n')[0].slice(0, 60) || undefined, icon: n.icon ? <span>{n.icon}</span> : <FileText size={16} />, group: 'Link to a note', onItemClick: () => link(n.id, n.title) }))
    if (query.trim()) items.push({ title: `New page “${query.trim()}”`, subtext: 'Create it and link to it', icon: <FilePlus2 size={16} />, group: 'Link to a note', onItemClick: async () => { const n = await createNote({ title: query.trim() }); link(n.id, n.title) } })
    return items
  }, [editor, note.id])
  // ---- "/" menu: the usual blocks, plus "Template" to drop a template into this note
  const slashItems = useCallback(async (query: string) => filterSuggestionItems([
    ...getDefaultReactSlashMenuItems(editor),
    { title: 'Template', subtext: 'Insert one of your templates here', aliases: ['template', 'tpl', 'layout', 'meeting', 'checklist'], group: 'Others', icon: <LayoutTemplate size={18} />,
      onItemClick: () => { insertAt.current = editor.getTextCursorPosition().block.id; setTplInsert(true) } },
  ], query), [editor])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertTemplate = (blocks: any[]) => {
    if (!blocks.length) return
    const at = insertAt.current ? editor.getBlock(insertAt.current) : undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empty = at && at.type === 'paragraph' && !(at.content as any[])?.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (at && empty) editor.replaceBlocks([at], blocks as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else editor.insertBlocks(blocks as any, at ?? editor.document[editor.document.length - 1], 'after')
    insertAt.current = null
    setTimeout(() => editor.focus(), 50)
  }
  const [backlinks, setBacklinks] = useState<Note[]>([])
  useEffect(() => {
    let dead = false
    const tag = `#note=${note.id}`
    db.notes.filter((n) => n.trashedAt === null && n.id !== note.id && !n.locked && !n.templateDraft && JSON.stringify(n.content).includes(tag)).toArray().then((r) => { if (!dead) setBacklinks(r) })
    return () => { dead = true }
  }, [note.id])
  linkGo.current = (id: string) => { if (id) void go(id) }


  // keyboard: Esc leaves focus mode, then closes; Ctrl+Shift+F focus; Ctrl+S save version
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !embedded && !document.querySelector('.bn-suggestion-menu, [data-popover], [role="dialog"]')) { if (focus) setFocus(false); else close() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocus(!focus) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persist().then(async () => { const f = await db.notes.get(note.id); if (f) snapshot(f) }) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // focus dimming + typewriter scrolling follow the cursor
  const [activeBlock, setActiveBlock] = useState('')
  const markActive = useCallback(() => {
    if (!focus) return
    try { setActiveBlock(editor.getTextCursorPosition().block.id) } catch { /* no cursor */ }
  }, [editor, focus])
  useEffect(() => { markActive(); if (focus) editor.focus() }, [focus, markActive, editor])
  useEffect(() => editor.onSelectionChange(() => {
    const root = scroller.current; if (!root) return
    markActive()
    if (prefs.typewriter) {
      const sel = window.getSelection(); if (!sel?.rangeCount) return
      const r = sel.getRangeAt(0).getBoundingClientRect(); if (!r.height) return
      const box = root.getBoundingClientRect()
      const target = box.top + box.height * 0.42
      root.scrollBy({ top: r.top - target, behavior: 'smooth' })
    }
  }), [editor, markActive, prefs.typewriter])

  // autosize title
  useEffect(() => { const t = titleRef.current; if (t) { t.style.height = '0px'; t.style.height = t.scrollHeight + 'px' } }, [title, prefs.font, prefs.width])

  const children = kids.filter((n) => n.trashedAt === null)
  const noteLabels = labels.filter((l) => note.labels.includes(l.id))
  const s = surface(note.color, dark, prefs.cardStyle)
  const tint = note.color === 'default' ? 'transparent' : prefs.cardStyle === 'vivid' ? swatch(note.color, dark) : s.background
  const cover = useCoverCss(note.cover)
  // Pages with tables get a wider column automatically, so tables have room to breathe.
  const hasTable = useMemo(() => (initial as { type?: string }[]).some((b) => b?.type === 'table'), [initial])
  const pagePx = prefs.width === 'wide' ? 1180 : hasTable ? 1000 : 820
  // Contents rail: centred page with the rail in its margin when there's room for both margins;
  // otherwise the page moves left a little to make room; on narrower screens, a Contents button.
  const spare = scrollerW - pagePx
  const tocMode: 'rail' | 'shift' | 'button' = !showToc || embedded ? 'button' : spare >= 2 * 236 ? 'rail' : spare >= 250 ? 'shift' : 'button'
  const tocRoomy = tocMode !== 'button'
  const countInHeader = !embedded && scrollerW > 0 && (tocMode === 'button' ? spare / 2 < 190 : false)
  const shiftLeft = tocMode === 'shift' ? Math.max(16, Math.floor((spare - 236) / 2)) : 0
  const railW = tocMode === 'rail' ? Math.min(280, spare / 2 - 8) : tocMode === 'shift' ? spare - shiftLeft - 8 : 64
  const tocTop = outline.length ? Math.min(...outline.map((h) => h.level)) : 1
  const maxW = embedded ? 'max-w-none' : prefs.width === 'wide' ? 'max-w-[1180px]' : hasTable ? 'max-w-[1000px]' : 'max-w-[820px]'
  const size = prefs.textSize === 'sm' ? '15px' : prefs.textSize === 'lg' ? '18px' : '16.5px'
  const readMin = Math.max(1, Math.round(stats / 220))

  const withPass = (fn: (p: string) => void) => {
    const p = getSessionPasscode(); if (p) return fn(p)
    hasPasscode().then((has) => setAsk({ mode: has ? 'enter' : 'set', then: fn }))
  }
  const toggleLock = async () => {
    setMenu(null)
    await persist({ title: title.trim() })
    if (note.locked) withPass((p) => unlockNote(note.id, p))
    else withPass((p) => lockNote(note.id, p))
  }
  const restore = async (v: Version) => {
    await persist() ; const cur = await db.notes.get(note.id); if (cur) await snapshot(cur)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.replaceBlocks(editor.document, (v.content?.length ? v.content : [{ type: 'paragraph' }]) as any)
    setTitle(v.title); await persist({ title: v.title }); setHistory(false)
  }

  return (
    <div className={`editor-veil flex h-full min-w-0 ${embedded ? 'note-embedded' : ''}`} style={embedded ? undefined : { viewTransitionName: `note-${note.id}` } as React.CSSProperties}>
      <div className="relative flex min-w-0 flex-1 flex-col" style={{ background: `linear-gradient(to bottom, ${tint === 'transparent' ? 'color-mix(in srgb, var(--color-accent) 9%, transparent)' : `color-mix(in srgb, ${tint} 55%, transparent)`}, transparent 320px)` }}>
        {/* header */}
        <header className={`no-print z-20 box-content flex h-12 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-opacity max-sm:h-13 duration-500 ${focus ? 'opacity-0 hover:opacity-100 focus-within:opacity-100' : calm ? 'opacity-20 hover:opacity-100' : ''}`}>
          {!embedded && <IconButton label="Back (Esc)" onClick={close}><ArrowLeft size={19} /></IconButton>}
          <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13px] text-muted">
            {crumbs.map((c) => (
              <span key={c.id} className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => go(c.id)} className="max-w-40 truncate rounded-md px-1.5 py-1 hover:bg-wash hover:text-ink">{c.title || 'Untitled'}</button>
                <ChevronRight size={13} />
              </span>
            ))}
            <span className="truncate px-1.5 text-ink-2">{title || 'Untitled'}</span>
          </nav>
          <span className="hidden items-center gap-1 px-2 text-[12px] text-faint sm:flex">
            {saved === 'saving' ? 'Saving…' : <><Check size={13} className="text-accent" /> Saved</>}
            {/* when the page fills the width, the word count sits up here instead of over the text */}
            {prefs.showCounts && countInHeader && <button type="button" onClick={() => setChars(!chars)} title="Toggle characters" className="ml-1.5 rounded px-1 hover:text-ink">· {chars ? `${derivedChars(editor)} characters` : `${stats} ${stats === 1 ? 'word' : 'words'}`}</button>}
          </span>
          {phone && kbOpen && <button type="button" onClick={() => (document.activeElement as HTMLElement | null)?.blur()} className="rounded-full px-3 py-1.5 text-[15px] font-semibold text-accent">Done</button>}
          {ai && !busy && <IconButton label="Dictate into this page" active={dictating} onClick={() => setDictating(!dictating)} className="max-sm:hidden"><Mic size={18} /></IconButton>}
          <div className="relative max-sm:hidden">
            <IconButton label="Text options" active={menu === 'type'} onClick={() => setMenu(menu === 'type' ? null : 'type')}><Type size={18} /></IconButton>
            <Popover open={menu === 'type'} onClose={() => setMenu(null)} className="right-0 top-11 w-72 p-3">
              <div className="mb-1.5 text-[12px] text-muted">Font</div>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {(['sans', 'serif', 'mono'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => set({ font: f })}
                    className={`rounded-lg border py-2 text-center ${prefs.font === f ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
                    <div className={`text-[20px] ${f === 'serif' ? 'font-serif' : f === 'mono' ? 'font-mono' : 'font-sans'}`}>Ag</div>
                    <div className="text-[11px] capitalize">{f === 'sans' ? 'Default' : f}</div>
                  </button>
                ))}
              </div>
              <div className="mb-1.5 text-[12px] text-muted">Size</div>
              <div className="mb-3"><Segmented value={prefs.textSize} onChange={(v) => set({ textSize: v })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} /></div>
              <div className="mb-1.5 text-[12px] text-muted">Page width</div>
              <div className="mb-2"><Segmented value={prefs.width} onChange={(v) => set({ width: v })} options={[{ value: 'narrow', label: 'Readable' }, { value: 'wide', label: 'Wide' }]} /></div>
              <Switch label="Typewriter scrolling" checked={prefs.typewriter} onChange={(v) => set({ typewriter: v })} />
              <Switch label="Word count" checked={prefs.showCounts} onChange={(v) => set({ showCounts: v })} />
            </Popover>
          </div>
          {!embedded && <IconButton label={focus ? 'Exit focus (Ctrl+Shift+F)' : 'Focus mode (Ctrl+Shift+F)'} active={focus} onClick={() => setFocus(!focus)} className="max-sm:hidden">
            {focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </IconButton>}
          <IconButton label="Version history" active={history} onClick={() => setHistory(!history)} className="max-sm:hidden"><History size={18} /></IconButton>
          <IconButton label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => patchNote(note.id, { pinned: !note.pinned })} className="max-sm:hidden">
            <Pin size={18} className={note.pinned ? 'fill-current' : ''} />
          </IconButton>
          <div className="relative">
            <IconButton label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><MoreHorizontal size={19} /></IconButton>
            <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="right-0 top-11 w-60">
              {phone && <div className="px-3 pb-2 text-[12.5px] text-muted">{stats} {stats === 1 ? 'word' : 'words'} · {readMin} min read · {saved === 'saving' ? 'Saving…' : 'Saved'}</div>}
              <div className="px-1 pb-1"><ColorPicker value={note.color} onChange={(color) => patchNote(note.id, { color })} /></div>
              {phone && <>
                <div className="my-1 h-px bg-line" />
                {ai && <MenuItem icon={<Mic size={15} />} onClick={() => { setMenu(null); setDictating(true) }}>Dictate into this page</MenuItem>}
                <MenuItem icon={<Type size={15} />} onClick={() => setMenu('type')}>Text & page options</MenuItem>
                <MenuItem icon={<History size={15} />} onClick={() => { setMenu(null); setHistory(true) }}>Version history</MenuItem>
                <MenuItem icon={<Maximize2 size={15} />} onClick={() => { setMenu(null); setFocus(!focus) }}>{focus ? 'Exit focus mode' : 'Focus mode'}</MenuItem>
              </>}
              <div className="my-1 h-px bg-line" />
              {ai && !note.locked && <MenuItem icon={<Sparkles size={15} />} onClick={() => { setMenu(null); setFormalise(true) }}>{note.memo?.transcript && note.memo.source !== 'text' ? 'Rewrite from recording…' : 'Formalise with AI…'}</MenuItem>}
              {!note.locked && <MenuItem icon={<MessageCircle size={15} />} onClick={() => { setMenu(null); setCopyMsg(true) }}>Copy as message…</MenuItem>}
              {!draft && <MenuItem icon={<Layers size={15} />} hint={note.series ?? undefined} onClick={() => { setMenu(null); setSeriesOpen(true) }}>{note.series ? 'Series' : 'Add to a series…'}</MenuItem>}
              {!draft && <MenuItem icon={<Pin size={15} />} onClick={() => { setMenu(null); patchNote(note.id, { pinned: !note.pinned }) }}>{note.pinned ? 'Unpin' : 'Pin'}</MenuItem>}
              {!draft && <MenuItem icon={note.locked ? <LockOpen size={15} /> : <Lock size={15} />} onClick={toggleLock}>{note.locked ? 'Remove lock' : 'Lock with passcode'}</MenuItem>}
              {!draft && !note.locked && <MenuItem icon={<LayoutTemplate size={15} />} onClick={async () => { setMenu(null); await persist({ title: title.trim() }); setSaveTpl(true) }}>Save as template…</MenuItem>}
              {!draft && <MenuItem icon={<Copy size={15} />} onClick={async () => { setMenu(null); await persist(); const f = await db.notes.get(note.id); if (f && !f.locked) { const n = await duplicateNote(f); go(n.id) } }}>Duplicate</MenuItem>}
              {!note.locked && !draft && <MenuItem icon={<Send size={15} />} onClick={async () => { setMenu(null); await persist(); sendNotes([note.id]) }}>Share as link…</MenuItem>}
              {!note.locked && <MenuItem icon={<Download size={15} />} onClick={async () => { setMenu(null); await persist({ title: title.trim() }); setExporting(true) }}>Export…</MenuItem>}
              {!note.locked && !draft && <MenuItem icon={<Presentation size={15} />} onClick={async () => { setMenu(null); await persist({ title: title.trim() }); setDeckOpen(true) }}>Make a presentation…</MenuItem>}
              <MenuItem icon={<Printer size={15} />} onClick={async () => { setMenu(null); await persist({ title: title.trim() }); document.title = title || 'Note'; window.print(); document.title = 'Folio' }}>Print or save as PDF</MenuItem>
              {outline.length >= 3 && <MenuItem icon={<ListTree size={15} />} onClick={() => setMenu('toc')}>Contents</MenuItem>}
              {!draft && <MenuItem icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={async () => { setMenu(null); await patchNote(note.id, { archived: !note.archived, pinned: false }); close() }}>{note.archived ? 'Unarchive' : 'Archive'}</MenuItem>}
              {!draft && <MenuItem icon={<Trash2 size={15} />} danger onClick={async () => { setMenu(null); window.clearTimeout(timer.current); await setTrashed(note.id, true); setFocus(false); onClose() }}>Move to trash</MenuItem>}
            </Popover>
          </div>
        </header>
        {draft && !embedded && <TemplateDraftBar templateId={draft} isRoot={!crumbs.some((c) => c.templateDraft === draft)} onDone={() => closeDraft(true)} onDiscard={() => closeDraft(false)} />}

        {focus && activeBlock && <style>{`.focus-dim .bn-block-outer[data-id="${activeBlock}"], .focus-dim .bn-block-outer:has(.bn-block-outer[data-id="${activeBlock}"]) { opacity: 1 !important; } .focus-dim .bn-block-outer[data-id="${activeBlock}"] .bn-block-outer { opacity: 1; }`}</style>}
        {/* writing surface */}
        <div ref={scroller} className={`print-area folio-editor min-h-0 flex-1 overflow-y-auto ${hasTable && !embedded && prefs.width !== 'wide' ? 'wide-tables' : ''} ${focus ? 'focus-dim' : ''} ${note.paper && note.paper !== 'none' ? `paper-${note.paper}` : ''}`} data-font={prefs.font} style={{ ['--ed-size' as string]: size }}>
          {cover && (
            <div className="group/cover relative h-40 w-full sm:h-56" style={{ background: cover }}>
              <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 coarse:opacity-100">
                <button type="button" onClick={() => setMenu('cover')} className="rounded-md bg-black/45 px-2.5 py-1 text-[12px] text-white backdrop-blur hover:bg-black/60">Change cover</button>
                <button type="button" onClick={() => patchNote(note.id, { cover: null })} className="rounded-md bg-black/45 px-2.5 py-1 text-[12px] text-white backdrop-blur hover:bg-black/60">Remove</button>
              </div>
            </div>
          )}
          <div className="relative">
          <div className={`mx-auto w-full ${maxW} pb-[40vh] ${cover ? (note.icon ? 'pt-0' : 'pt-6') : 'pt-6 sm:pt-12'}`} style={shiftLeft ? { marginLeft: shiftLeft, marginRight: 'auto' } : undefined}>
            <div className="group/head px-[26px] sm:px-[54px]">
              {note.icon && (
                <div className="relative">
                  <button type="button" title="Change icon" onClick={() => setMenu(menu === 'icon' ? null : 'icon')}
                    className={`rounded-xl text-[56px] leading-none transition hover:bg-wash sm:text-[64px] ${cover ? '-mt-10 sm:-mt-12' : ''}`}>{note.icon}</button>
                </div>
              )}
              {/* add icon / cover / paper */}
              <div className={`relative mb-1 mt-2 flex flex-wrap gap-1 text-[12.5px] text-muted transition-opacity ${focus ? 'opacity-0' : 'opacity-0 group-hover/head:opacity-100 focus-within:opacity-100 coarse:opacity-100'}`}>
                {!note.icon && <button type="button" onClick={() => setMenu(menu === 'icon' ? null : 'icon')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><Smile size={14} /> Add icon</button>}
                {!note.cover && <button type="button" onClick={() => setMenu(menu === 'cover' ? null : 'cover')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><ImageIcon size={14} /> Add cover</button>}
                <button type="button" onClick={() => setMenu(menu === 'paper' ? null : 'paper')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><Grid3x3 size={14} /> Paper</button>
                <Popover open={menu === 'icon'} onClose={() => setMenu(null)} className="left-0 top-8 w-[296px] p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI.map((e) => <button key={e} type="button" onClick={() => { patchNote(note.id, { icon: e }); setMenu(null) }} className="flex h-8 w-8 items-center justify-center rounded-md text-[20px] hover:bg-wash">{e}</button>)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                    <input aria-label="Type any emoji" placeholder="Or type any emoji" maxLength={4} onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) { patchNote(note.id, { icon: v }); setMenu(null) } }}
                      className="min-w-0 flex-1 rounded-md bg-wash px-2 py-1.5 text-[13px] outline-none" />
                    {note.icon && <button type="button" onClick={() => { patchNote(note.id, { icon: null }); setMenu(null) }} className="rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-wash">Remove</button>}
                  </div>
                </Popover>
                <Popover open={menu === 'cover'} onClose={() => setMenu(null)} className="left-0 top-8 w-[320px] p-2.5">
                  <div className="mb-2 text-[12px] text-muted">Gradients</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(COVERS).map(([k, v]) => <button key={k} type="button" title={k} onClick={() => { patchNote(note.id, { cover: `g:${k}` }); setMenu(null) }} className="h-12 rounded-lg ring-accent hover:ring-2" style={{ background: v }} />)}
                  </div>
                  <button type="button" onClick={async () => { setMenu(null); const f = await pickFile(); if (f) patchNote(note.id, { cover: await putImage(await fileToDataUrl(f, 2000, 0.82)) }) }}
                    className="mt-2 w-full rounded-lg bg-wash py-2 text-[13px] hover:bg-wash-2">Upload an image…</button>
                </Popover>
                <Popover open={menu === 'paper'} onClose={() => setMenu(null)} className="left-0 top-8 w-[260px] p-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['none', 'grid', 'dots', 'lines'] as const).map((k) => (
                      <button key={k} type="button" onClick={() => { patchNote(note.id, { paper: k }); setMenu(null) }}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] capitalize ${(note.paper ?? 'none') === k ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
                        <span className={`h-10 w-full rounded-md bg-card ${k !== 'none' ? `paper-${k} dense` : ''}`} />{k}
                      </button>
                    ))}
                  </div>
                </Popover>
              </div>
              <textarea ref={titleRef} rows={1} value={title} aria-label="Title" placeholder="Untitled"
                onChange={(e) => { setTitle(e.target.value); setSaved('saving') }}
                onBlur={() => persist({ title: title.trim() })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); editor.setTextCursorPosition(editor.document[0], 'start') } }}
                className={`font-title block w-full resize-none overflow-hidden bg-transparent text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-ink outline-none placeholder:text-faint/60 sm:text-[42px] ${prefs.font === 'mono' ? '!font-mono !text-[28px]' : ''}`} />

              {/* properties */}
              <div className={`mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted ${focus ? 'opacity-0' : ''}`}>
                {note.daily && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-600 dark:text-star"><Sun size={12} /> Daily note</span>}
                {note.locked && <span className="inline-flex items-center gap-1 rounded-full bg-wash px-2.5 py-1"><Lock size={12} /> Encrypted</span>}
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === 'color' ? null : 'color')} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-wash">
                    <span className="h-3 w-3 rounded-full border border-line" style={{ background: swatch(note.color, dark) }} /> <Palette size={12} className="hidden" />Colour
                  </button>
                  <Popover open={menu === 'color'} onClose={() => setMenu(null)} className="left-0 top-8"><ColorPicker value={note.color} onChange={(color) => patchNote(note.id, { color })} /></Popover>
                </div>
                {noteLabels.map((l) => <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-2" style={{ background: `color-mix(in srgb, ${labelColor(l)} 16%, transparent)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: labelColor(l) }} />{l.name}</span>)}
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === 'labels' ? null : 'labels')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-wash">
                    <Tag size={12} /> {noteLabels.length ? 'Edit' : 'Add label'}
                  </button>
                  <Popover open={menu === 'labels'} onClose={() => setMenu(null)} className="left-0 top-8"><LabelPicker selected={note.labels} onChange={(ids) => patchNote(note.id, { labels: ids })} /></Popover>
                </div>
                <span className="px-2 py-1 text-faint">Created {new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="mt-5"><MemoBanner note={note} /></div>
            <div className={`min-h-[40vh] ${busy ? 'pointer-events-none opacity-60' : ''}`} onFocus={() => setEdFocus(true)} onBlur={() => setEdFocus(false)}>
              <BlockNoteView editor={editor} theme={theme} onChange={onChange} editable={!busy} slashMenu={false}>
                <SuggestionMenuController triggerCharacter="[[" getItems={linkItems} />
                <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
              </BlockNoteView>
            </div>

            {/* notes that link here */}
            {backlinks.length > 0 && (
              <div className={`no-print mt-8 px-[26px] sm:px-[54px] ${focus ? 'opacity-0' : ''}`}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-muted"><Link2 size={12} /> Linked from</div>
                {backlinks.map((b) => (
                  <button key={b.id} type="button" onClick={() => go(b.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[15px] text-ink-2 hover:bg-wash">
                    {b.icon ? <span className="w-[17px] text-center">{b.icon}</span> : <FileText size={17} className="shrink-0 text-muted" />}
                    <span className="truncate">{b.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            )}
            {/* sub-pages */}
            <div className={`mt-10 px-[26px] sm:px-[54px] ${focus ? 'opacity-0' : ''}`}>
              {children.length > 0 && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Pages inside</div>}
              {children.map((ch) => (
                <button key={ch.id} type="button" onClick={() => go(ch.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[15px] text-ink-2 hover:bg-wash">
                  <FileText size={17} className="shrink-0 text-muted" />
                  <span className="truncate">{ch.title || 'Untitled'}</span>
                  {ch.locked && <Lock size={12} className="text-muted" />}
                </button>
              ))}
              <button type="button" onClick={async () => { const n = await createNote({ parentId: note.id, color: note.color, templateDraft: draft }); go(n.id) }}
                className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] text-muted hover:bg-wash hover:text-ink">
                <FilePlus2 size={17} /> Add a page inside
              </button>
            </div>
          </div>
          {/* contents: beside the page when there's room, otherwise a small button that opens them */}
          {showToc && (
            <div className="no-print pointer-events-none absolute inset-y-0 right-0 pt-6 sm:pt-12" style={{ width: railW }}>
              {tocRoomy ? (
                <nav aria-label="Contents" className={`pointer-events-auto sticky top-4 max-h-[calc(100dvh-150px)] overflow-y-auto overscroll-contain pb-4 pr-3 transition-opacity duration-500 ${calm ? 'opacity-25 hover:opacity-100' : ''}`}>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-muted">Contents</div>
                  {tocItems.map((h) => (
                    <button key={h.id} type="button" onClick={() => jump(h.id)} title={h.text}
                      className={`block w-full truncate rounded-md py-1 pr-2 text-left text-[13px] leading-snug transition-colors ${activeHead === h.id ? 'text-ink' : 'text-muted hover:text-ink'}`}
                      style={{ paddingLeft: 12 + (h.level - tocTop) * 12, boxShadow: activeHead === h.id ? 'inset 2px 0 0 var(--color-accent)' : undefined }}>{h.text}</button>
                  ))}
                </nav>
              ) : (
                <div className="pointer-events-auto sticky top-4 flex justify-end pr-3 max-sm:hidden">
                  <IconButton label="Contents" onClick={() => setMenu('toc')} className={`bg-pop/80 shadow-sm ring-1 ring-line backdrop-blur ${calm ? 'opacity-25 hover:opacity-100' : ''}`}><ListTree size={17} /></IconButton>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {menu === 'toc' && (
          <div className="no-print fixed inset-0 z-[60] flex items-start justify-center bg-scrim p-4 pt-20" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenu(null) }}>
            <div role="dialog" aria-label="Contents" className="animate-pop max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-pop p-2 shadow-2xl">
              <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-faint">Contents</div>
              {outline.map((h) => (
                <button key={h.id} type="button" onClick={() => { setMenu(null); setTimeout(() => jump(h.id), 50) }}
                  className="block w-full truncate rounded-lg py-2 pr-2 text-left text-[14.5px] text-ink-2 hover:bg-wash" style={{ paddingLeft: 12 + (h.level - 1) * 14 }}>{h.text}</button>
              ))}
            </div>
          </div>
        )}
        {/* status */}
        {prefs.showCounts && !countInHeader && (
          <button type="button" onClick={() => setChars(!chars)} title="Toggle characters"
            className={`absolute bottom-3 right-4 rounded-full border border-line bg-pop/90 px-3 py-1 text-[12px] text-muted shadow-sm backdrop-blur hover:text-ink max-sm:hidden ${focus ? 'opacity-40 hover:opacity-100' : calm ? 'opacity-0' : ''} transition-opacity duration-500`}>
            {chars ? `${editor.document ? derivedChars(editor) : 0} characters` : `${stats} ${stats === 1 ? 'word' : 'words'} · ${readMin} min read`}
          </button>
        )}
        {!prefs.showCounts && <span className="hidden"><Plus /></span>}
        {phone && kbOpen && edFocus && !dictating && <KeyboardBar editor={editor} locked={note.locked} onDictate={ai ? () => setDictating(true) : undefined} />}
        {dictating && <DictateBar editor={editor} onClose={() => setDictating(false)} />}
      </div>

      {copyMsg && (
        <CopySheet title={title} onClose={() => setCopyMsg(false)}
          hasFolded={editor.document.some((b) => b.type === 'heading' && (b.props as { isToggleable?: boolean }).isToggleable)}
          getMarkdown={getMd} />
      )}
      {seriesOpen && <SeriesSheet ids={[note.id]} onClose={() => setSeriesOpen(false)} />}
      {saveTpl && <SaveTemplateDialog note={note} pages={kids.filter((k) => k.trashedAt === null && !k.locked).length} onClose={() => setSaveTpl(false)} />}
      <Suspense fallback={null}>
        {tplInsert && <TemplateGallery mode="insert" onClose={() => setTplInsert(false)} onCreated={() => {}} onEdit={(id) => { setTplInsert(false); go(id) }}
          onInsert={(blocks) => { setTplInsert(false); insertTemplate(blocks) }} />}
        {exporting && <ExportDialog scope={{ ids: [note.id] }} onClose={() => setExporting(false)} />}
        {deckOpen && <DeckMaker source={{ kind: 'note', id: note.id }} onClose={() => setDeckOpen(false)} onCreated={(id) => { setDeckOpen(false); go(id) }} />}
      </Suspense>
      {formalise && (
        <FormaliseSheet fromRecording={!!note.memo?.transcript && note.memo.source !== 'text'} onClose={() => setFormalise(false)}
          onSettings={() => document.dispatchEvent(new CustomEvent('folio:settings'))}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getText={async () => Promise.resolve(editor.blocksToMarkdownLossy((await inlineRefs(editor.document)) as any))}
          onRun={async (style) => {
            await persist({ title: title.trim() })
            const fresh = await db.notes.get(note.id); if (!fresh) return
            if (fresh.memo?.transcript && fresh.memo.source !== 'text') void processMemo(note.id, { style })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else void formaliseText(fresh, `${title ? `# ${title}\n\n` : ''}${await Promise.resolve(editor.blocksToMarkdownLossy(editor.document as any))}`, style as 'minutes' | 'memo')
          }} />
      )}
      {history && (
        <div className="fixed inset-0 z-40 sm:static sm:z-auto">
          <HistoryPanel noteId={note.id} locked={note.locked} onClose={() => setHistory(false)} onRestore={restore}
            onSaveNow={async () => { await persist(); const f = await db.notes.get(note.id); if (f) await snapshot(f) }} />
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function derivedChars(editor: any) {
  let n = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (bs: any[]) => { for (const b of bs) { if (Array.isArray(b.content)) for (const c of b.content) n += (c.text ?? '').length; if (b.children) walk(b.children) } }
  walk(editor.document)
  return n
}

/** Headings (level 1–3) with text, for the contents list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function outlineOf(blocks: any[]): { id: string; level: number; text: string }[] {
  const out: { id: string; level: number; text: string }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (bs: any[]) => { for (const b of bs ?? []) {
    if (b?.type === 'heading') { const text = (Array.isArray(b.content) ? b.content : []).map((c: { text?: string; content?: { text?: string }[] }) => c.text ?? (c.content ?? []).map((x) => x.text ?? '').join('')).join('').trim(); if (text && b.id) out.push({ id: b.id, level: Math.min(3, b.props?.level ?? 1), text }) }
    if (b?.children?.length) walk(b.children)
  } }
  walk(blocks)
  return out
}
