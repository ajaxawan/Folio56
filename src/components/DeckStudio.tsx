import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Download, FileCode2, FileType2, ImagePlus, MonitorPlay, MoreHorizontal,
  Palette, Play, Plus, Printer, Sparkles, StickyNote, Trash2, X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Note } from '../types'
import { DECK_CSS, DECK_THEMES, LAYOUTS, VISUAL, metaFor, newSlide, outlineBlocks, renderSlide, themeOf, updateDeck, type Deck, type Item, type Layout, type Slide } from '../lib/deck'
import { checkNumbers, MAKE_VISUAL, rewriteSlide } from '../lib/deckAI'
import { flowToText, itemLine, parseItemLine, textToFlow } from '../lib/deckDiagrams'
import { download, setTrashed } from '../lib/db'
import { fileToDataUrl, pickFile } from '../lib/image'
import { isRef, putImage, toDataUrl } from '../lib/blobs'
import { usePhone } from '../lib/mobile'
import { useAI, usePrefs } from '../lib/prefs'
import { toast } from '../lib/toast'
import { SlideView } from './SlideView'
import { IconButton, MenuItem, Popover } from './ui'

const DeckMaker = lazy(() => import('./DeckMaker').then((m) => ({ default: m.DeckMaker })))
const safe = (s: string) => (s || 'Presentation').replace(/[\\/:*?"<>|#^[\]]+/g, '').trim().slice(0, 80) || 'Presentation'
const lines = (s: string) => s.split('\n').map((x) => x.replace(/^\s*[-•*]\s+/, '').trim()).filter(Boolean)

/** The presentation editor: slides on the left, the slide in the middle, its content on the right. */
export function DeckStudio({ note, onClose, onOpen, setWide }: { note: Note; onClose: () => void; onOpen: (id: string) => void; setWide?: (v: boolean) => void }) {
  // the studio uses the whole window (the app's sidebar steps aside while it's open)
  useEffect(() => { setWide?.(true); return () => setWide?.(false) }, [setWide])
  const phone = usePhone()
  const ai = useAI()
  const { prefs } = usePrefs()
  const author = prefs.name.trim()
  const [deck, setDeck] = useState<Deck>(note.deck!)
  const [sel, setSel] = useState(0)
  const [menu, setMenu] = useState<null | 'theme' | 'export' | 'more' | 'add'>(null)
  const [presenting, setPresenting] = useState<number | null>(null)
  const [again, setAgain] = useState(false)
  const [saved, setSaved] = useState(true)
  const [aiBusy, setAiBusy] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(deck)
  const theme = themeOf(deck.theme)
  const slide = deck.slides[Math.min(sel, deck.slides.length - 1)]

  const save = useCallback(async () => { window.clearTimeout(timer.current); await updateDeck(note.id, latest.current); setSaved(true) }, [note.id])
  const change = (d: Deck) => { latest.current = d; setDeck(d); setSaved(false); window.clearTimeout(timer.current); timer.current = window.setTimeout(save, 450) }
  useEffect(() => () => { window.clearTimeout(timer.current); void updateDeck(note.id, latest.current) }, [note.id]) // flush on leave
  const recheck = (s: Slide) => (deck.figures ? checkNumbers([s], deck.figures)[0] : s)
  const patch = (p: Partial<Slide>) => change({ ...deck, slides: deck.slides.map((s, i) => (i === sel ? recheck({ ...s, ...p }) : s)) })
  /** “These numbers are right” — remember them as checked for this deck. */
  const vouch = (nums: string[]) => { const figures = [...new Set([...(deck.figures ?? []), ...nums.map((n) => n.replace(/[,\s+]/g, '')), ...nums.map((n) => n.replace(/[,\s+%]/g, ''))])]; change({ ...deck, figures, slides: deck.slides.map((s, i) => (i === sel ? { ...s, check: undefined } : s)) }) }
  const flagged = deck.slides.filter((s) => s.check?.length).length
  const close = async () => { await save(); onClose() }

  const move = (d: number) => {
    const j = sel + d; if (j < 0 || j >= deck.slides.length) return
    const s = [...deck.slides]; [s[sel], s[j]] = [s[j], s[sel]]; change({ ...deck, slides: s }); setSel(j)
  }
  const dup = () => { const s = [...deck.slides]; s.splice(sel + 1, 0, { ...structuredClone(slide), id: crypto.randomUUID().slice(0, 8) }); change({ ...deck, slides: s }); setSel(sel + 1) }
  const del = () => {
    if (deck.slides.length <= 1) return
    const before = deck
    const s = deck.slides.filter((_, i) => i !== sel); change({ ...deck, slides: s }); setSel(Math.max(0, sel - 1))
    toast('Slide deleted', () => { change(before); setSel(sel) })
  }
  const add = (l: Layout) => { const s = [...deck.slides]; s.splice(sel + 1, 0, newSlide(l)); change({ ...deck, slides: s }); setSel(sel + 1); setMenu(null) }

  // keyboard: ↑/↓ through slides (when not typing), F5 / Ctrl+Enter to present
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting !== null) return
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? '')
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); setPresenting(sel); return }
      if (typing || document.querySelector('[role=dialog]')) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); setSel((x) => Math.min(x + 1, deck.slides.length - 1)) }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)) }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // keep the selected thumbnail in view
  useEffect(() => { document.querySelector(`[data-thumb="${sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [sel])

  const exportPptx = async () => {
    setMenu(null); toast('Making the PowerPoint…')
    try { const { deckToPptx } = await import('../lib/pptx'); download(`${safe(deck.title)}.pptx`, await deckToPptx(latest.current, author)); toast('Downloaded PowerPoint (.pptx)') } catch (e) { console.error(e); toast('Couldn’t make the PowerPoint file') }
  }
  const exportPdf = async () => {
    setMenu(null)
    const d = latest.current
    const pages: string[] = []
    for (const [i, s] of d.slides.entries()) pages.push(`<section class="pg">${renderSlide(s, theme, metaFor(d, i, author), s.image ? (isRef(s.image) ? await toDataUrl(s.image) : s.image) : null)}</section>`)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safe(d.title)}</title><style>${DECK_CSS}@page{size:13.333in 7.5in;margin:0}html,body{margin:0;background:#fff}.pg{width:1280px;height:720px;overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${pages.join('')}</body></html>`
    const { printHtml } = await import('../lib/exporter')
    await printHtml(html); toast('Choose “Save as PDF” in the print dialog')
  }
  const exportOutline = async () => {
    setMenu(null)
    const { blocksToMd } = await import('../lib/markdown')
    download(`${safe(deck.title)}.md`, new Blob([`# ${deck.title}\n\n${blocksToMd(outlineBlocks(latest.current))}`], { type: 'text/markdown' }))
  }
  const rewrite = async (how: string, label: string) => {
    setAiBusy(label)
    try { const s = await rewriteSlide(slide, how, deck.figures); change({ ...deck, slides: deck.slides.map((x, i) => (i === sel ? s : x)) }); toast('Slide rewritten', () => change(deck)) } catch (e) { toast((e as Error).message) } finally { setAiBusy('') }
  }

  const thumbs = (
    <ol aria-label="Slides" className={phone ? 'no-scrollbar flex gap-2 overflow-x-auto px-3 py-2' : 'flex flex-col gap-2.5 overflow-y-auto px-3 py-3'}>
      {deck.slides.map((s, i) => (
        <li key={s.id} className={phone ? 'w-28 shrink-0' : ''}>
          <button type="button" data-thumb={i} onClick={() => setSel(i)} aria-current={i === sel ? 'true' : undefined} aria-label={`Slide ${i + 1}: ${s.title || LAYOUTS.find((l) => l.k === s.layout)!.label}`}
            className="group flex w-full items-start gap-2 text-left">
            {!phone && <span className={`w-5 shrink-0 pt-0.5 text-right text-[11.5px] tabular-nums ${i === sel ? 'font-semibold text-accent-ink' : 'text-muted'}`}>{i + 1}</span>}
            <span className={`relative block min-w-0 flex-1 overflow-hidden rounded-md ring-1 transition ${i === sel ? 'ring-2 ring-accent' : 'ring-line group-hover:ring-muted/60'}`}>
              <SlideView slide={s} theme={theme} meta={metaFor(deck, i, author)} />
              {!!s.check?.length && <span title="Has numbers to check" className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[10px] font-bold text-canvas">!</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
  const addBtn = (
    <div className="relative">
      <button type="button" onClick={() => setMenu(menu === 'add' ? null : 'add')} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-[13px] text-ink-2 hover:border-accent/60 hover:text-ink"><Plus size={14} /> Add slide</button>
      <Popover open={menu === 'add'} onClose={() => setMenu(null)} className="bottom-11 left-0 w-56">
        {LAYOUTS.map((l) => <MenuItem key={l.k} onClick={() => add(l.k)}>{l.label}</MenuItem>)}
      </Popover>
    </div>
  )

  return (
    <div className="flex h-full min-w-0 flex-col bg-canvas">
      <header className="z-20 box-content flex h-14 shrink-0 items-center gap-1 border-b border-line/70 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton label="Back (Esc)" onClick={close}><ArrowLeft size={19} /></IconButton>
        <input value={deck.title} onChange={(e) => change({ ...deck, title: e.target.value })} aria-label="Presentation title"
          className="font-title min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-[17px] font-semibold outline-none hover:bg-wash focus:bg-wash" />
        {flagged > 0 && <button type="button" onClick={() => setSel(deck.slides.findIndex((s) => s.check?.length))} className="hidden items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-warn hover:bg-wash sm:flex" title="Numbers that aren’t in your source"><AlertTriangle size={13} /> {flagged} to check</button>}
        <span className="hidden items-center gap-1 px-2 text-[12px] text-faint sm:flex">{saved ? <><Check size={13} className="text-accent" /> Saved</> : 'Saving…'}</span>
        <div className="relative">
          <IconButton label="Theme" active={menu === 'theme'} onClick={() => setMenu(menu === 'theme' ? null : 'theme')}><Palette size={18} /></IconButton>
          <Popover open={menu === 'theme'} onClose={() => setMenu(null)} className="right-0 top-11 w-[min(92vw,460px)] p-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Theme</div>
            <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Theme">
              {DECK_THEMES.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={deck.theme === t.key} aria-label={t.name} onClick={() => change({ ...deck, theme: t.key })} className="text-left">
                  <div className={`overflow-hidden rounded-md ring-1 ${deck.theme === t.key ? 'ring-2 ring-accent' : 'ring-line hover:ring-muted/60'}`}><SlideView slide={slide} theme={t} meta={metaFor(deck, sel, author)} /></div>
                  <div className="mt-1 text-[12px] font-medium">{t.name}</div>
                </button>
              ))}
            </div>
          </Popover>
        </div>
        <div className="relative">
          <IconButton label="Download" active={menu === 'export'} onClick={() => setMenu(menu === 'export' ? null : 'export')}><Download size={18} /></IconButton>
          <Popover open={menu === 'export'} onClose={() => setMenu(null)} className="right-0 top-11 w-60">
            <MenuItem icon={<FileType2 size={15} />} onClick={exportPptx}>PowerPoint (.pptx)</MenuItem>
            <MenuItem icon={<Printer size={15} />} onClick={exportPdf}>PDF (print)</MenuItem>
            <MenuItem icon={<FileCode2 size={15} />} onClick={exportOutline}>Outline (Markdown)</MenuItem>
          </Popover>
        </div>
        <div className="relative">
          <IconButton label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><MoreHorizontal size={19} /></IconButton>
          <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="right-0 top-11 w-64">
            {deck.source?.kind === 'note' && deck.source.id && <MenuItem icon={<StickyNote size={15} />} onClick={async () => { setMenu(null); await save(); onOpen(deck.source!.id!) }}>Open “{deck.source.name}”</MenuItem>}
            <MenuItem icon={<Sparkles size={15} />} onClick={() => { setMenu(null); setAgain(true) }}>Make another version…</MenuItem>
            <MenuItem icon={<Trash2 size={15} />} danger onClick={async () => { setMenu(null); await save(); await setTrashed(note.id, true); onClose() }}>Move to trash</MenuItem>
          </Popover>
        </div>
        <button type="button" onClick={() => setPresenting(sel)} className="ml-1 flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13.5px] font-semibold text-on-accent" title="Present (F5)"><Play size={14} className="fill-current" /> Present</button>
      </header>

      <div className={`flex min-h-0 flex-1 ${phone ? 'flex-col overflow-y-auto' : ''}`}>
        {!phone && <aside className="flex w-44 shrink-0 flex-col border-r border-line/70 bg-side xl:w-56"><div className="min-h-0 flex-1 overflow-y-auto">{thumbs}</div><div className="p-3 pt-1">{addBtn}</div></aside>}
        <main className={`flex min-w-0 flex-1 flex-col ${phone ? '' : 'overflow-hidden'}`}>
          <div className={`flex min-h-0 flex-1 items-center justify-center ${phone ? 'p-3' : 'p-4 xl:p-8'}`}>
            <div className="w-full max-w-[1100px] overflow-hidden rounded-lg shadow-[0_20px_60px_-25px_rgba(0,0,0,.6)] ring-1 ring-line">
              <SlideView slide={slide} theme={theme} meta={metaFor(deck, sel, author)} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-2 pb-3 text-[12.5px] text-muted">
            <IconButton size="sm" label="Previous slide" disabled={sel === 0} onClick={() => setSel(sel - 1)}><ChevronLeft size={17} /></IconButton>
            <span className="tabular-nums">Slide {sel + 1} of {deck.slides.length}</span>
            <IconButton size="sm" label="Next slide" disabled={sel >= deck.slides.length - 1} onClick={() => setSel(sel + 1)}><ChevronRight size={17} /></IconButton>
          </div>
          {phone && <>{thumbs}<div className="px-3 pb-2">{addBtn}</div></>}
        </main>
        <aside aria-label="Slide content" className={`${phone ? 'border-t' : 'w-[300px] shrink-0 overflow-y-auto border-l xl:w-[340px]'} border-line/70 bg-side px-4 py-4`}>
          <Inspector key={slide.id} slide={slide} index={sel} total={deck.slides.length} patch={patch} onMove={move} onDup={dup} onDel={del}
            ai={ai} aiBusy={aiBusy} onRewrite={rewrite} onVouch={vouch} />
        </aside>
      </div>
      {presenting !== null && <Present deck={deck} start={presenting} author={author} onExit={(i) => { setPresenting(null); setSel(i) }} />}
      {again && <Suspense fallback={null}><DeckMaker source={deck.source?.kind === 'note' && deck.source.id ? { kind: 'note', id: deck.source.id } : undefined} onClose={() => setAgain(false)} onCreated={async (id) => { setAgain(false); await save(); onOpen(id) }} /></Suspense>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">{label}{children}</label>
}
const inputCls = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal text-ink outline-none focus:border-accent'

function Inspector({ slide: s, index, total, patch, onMove, onDup, onDel, ai, aiBusy, onRewrite, onVouch }: {
  slide: Slide; index: number; total: number; patch: (p: Partial<Slide>) => void; onMove: (d: number) => void; onDup: () => void; onDel: () => void
  ai: boolean; aiBusy: string; onRewrite: (how: string, label: string) => void; onVouch: (nums: string[]) => void
}) {
  // text areas keep their own text so blank lines while typing aren't swallowed
  const [bul, setBul] = useState((s.bullets ?? []).join('\n'))
  const [lb, setLb] = useState((s.left?.bullets ?? []).join('\n'))
  const [rb, setRb] = useState((s.right?.bullets ?? []).join('\n'))
  const [tbl, setTbl] = useState(s.table ? [s.table.head, ...s.table.rows].map((r) => r.join(' | ')).join('\n') : '')
  const [its, setIts] = useState((s.items ?? []).map(itemLine).join('\n'))
  const [chartTxt, setChartTxt] = useState((s.chart?.data ?? []).map((d) => `${d.label} | ${d.value}`).join('\n'))
  const [flowTxt, setFlowTxt] = useState(s.flow ? flowToText(s.flow) : '')
  const quadTxt = (i: number) => { const q = s.matrix?.quads[i]; return q ? [q.title, ...q.points].join('\n') : '' }
  const [quads, setQuads] = useState([0, 1, 2, 3].map(quadTxt))
  const stats = s.stats?.length ? s.stats : [{ value: '', label: '' }]
  const has = (...l: Layout[]) => l.includes(s.layout)
  const setLayout = (layout: Layout) => {
    const p: Partial<Slide> = { layout }
    // carry the content across: list ⇄ steps ⇄ flowchart
    const asItems = (): Item[] => s.items?.length ? s.items : (s.bullets ?? []).map((b) => parseItemLine(b, layout === 'timeline'))
    if (['process', 'cycle', 'timeline', 'agenda'].includes(layout)) { const it = asItems(); p.items = it; setIts(it.map(itemLine).join('\n')) }
    if (['bullets', 'closing'].includes(layout) && !s.bullets?.length && s.items?.length) { p.bullets = s.items.map((i) => [i.when, i.label, i.detail].filter(Boolean).join(' — ')); setBul(p.bullets.join('\n')) }
    if (layout === 'flow' && !s.flow) { const it = asItems(); if (it.length) { const f = textToFlow(['(Start)', ...it.map((i) => i.label), '(Done)'].join(' -> ')); p.flow = f; setFlowTxt(flowToText(f)) } }
    if (layout === 'chart' && !s.chart) p.chart = { kind: 'column', data: [] }
    if (layout === 'matrix' && !s.matrix) p.matrix = { x: '', y: '', quads: [{ title: '', points: [] }, { title: '', points: [] }, { title: '', points: [] }, { title: '', points: [] }] }
    if (layout === 'two' && !s.left) { const b = s.bullets ?? []; p.left = { heading: '', bullets: b.slice(0, Math.ceil(b.length / 2)) }; p.right = { heading: '', bullets: b.slice(Math.ceil(b.length / 2)) }; setLb(p.left.bullets.join('\n')); setRb(p.right.bullets.join('\n')) }
    if (layout === 'stat' && !s.stats?.length) p.stats = [{ value: '', label: '' }]
    if (layout === 'quote' && !s.quote) p.quote = { text: (s.bullets ?? [])[0] ?? '', by: '' }
    patch(p)
  }
  const pickImage = async () => { const f = await pickFile(); if (f) patch({ image: await putImage(await fileToDataUrl(f, 2000)) }) }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-[13px] font-semibold">Slide {index + 1} <span className="font-normal text-muted">of {total}</span></span>
        <IconButton size="sm" label="Move slide up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></IconButton>
        <IconButton size="sm" label="Move slide down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></IconButton>
        <IconButton size="sm" label="Duplicate slide" onClick={onDup}><Copy size={15} /></IconButton>
        <IconButton size="sm" label="Delete slide" disabled={total <= 1} onClick={onDel}><Trash2 size={15} /></IconButton>
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium text-muted">Layout</div>
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Layout">
          {LAYOUTS.map((l) => <button key={l.k} type="button" role="radio" aria-checked={s.layout === l.k} onClick={() => setLayout(l.k)}
            className={`rounded-md px-1.5 py-1.5 text-[12px] ${s.layout === l.k ? 'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] font-semibold text-ink ring-1 ring-accent' : 'bg-wash text-ink-2 hover:text-ink'}`}>{l.label}</button>)}
        </div>
      </div>
      {s.layout !== 'quote' && <Field label="Title"><input className={inputCls} value={s.title} onChange={(e) => patch({ title: e.target.value })} /></Field>}
      {!!s.check?.length && (
        <div role="note" className="rounded-xl border border-warn/40 bg-[color-mix(in_srgb,var(--color-warn)_9%,transparent)] p-3 text-[12.5px] leading-5 text-ink-2">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink"><AlertTriangle size={14} className="text-warn" /> Check these numbers</div>
          Not found in your source: {s.check.map((n) => <b key={n} className="mx-0.5 rounded bg-wash px-1 font-semibold text-ink">{n}</b>)}. The AI may have worked them out — or made them up.
          <div className="mt-2 flex gap-2"><button type="button" onClick={() => onVouch(s.check!)} className="rounded-md bg-wash px-2.5 py-1 font-medium text-ink hover:bg-wash-2">They’re right</button></div>
        </div>
      )}
      {has('title', 'section', 'closing', 'bullets', 'stat') && <Field label={s.layout === 'title' ? 'Subtitle' : 'Line under it (optional)'}><input className={inputCls} value={s.subtitle ?? ''} onChange={(e) => patch({ subtitle: e.target.value || undefined })} /></Field>}
      {has('process', 'timeline', 'agenda') && (
        <Field label={s.layout === 'timeline' ? 'Milestones · “When: what — detail”, one per line' : s.layout === 'agenda' ? 'Parts · one per line' : 'Steps · “Step — detail”, one per line'}>
          <textarea rows={6} className={inputCls} value={its} onChange={(e) => { setIts(e.target.value); patch({ items: e.target.value.split('\n').filter((l) => l.trim()).map((l) => parseItemLine(l, s.layout === 'timeline')) }) }}
            placeholder={s.layout === 'timeline' ? 'Sep 2026: Survey done\nOct 2026: Design approved — structural sign-off' : 'Order placed — website or phone\nStock checked\nShipped'} />
        </Field>
      )}
      {s.layout === 'cycle' && (
        <>
          <Field label="Stages of the loop · “Stage — detail”, one per line"><textarea rows={5} className={inputCls} value={its} onChange={(e) => { setIts(e.target.value); patch({ items: e.target.value.split('\n').filter((l) => l.trim()).map((l) => parseItemLine(l)) }) }} placeholder={'Plan\nBuild\nReview — demo on Friday\nLearn'} /></Field>
          <Field label="In the middle (optional)"><input className={inputCls} value={s.subtitle ?? ''} onChange={(e) => patch({ subtitle: e.target.value || undefined })} placeholder="e.g. Two-week sprint" /></Field>
        </>
      )}
      {s.layout === 'flow' && (
        <Field label="Flowchart · one arrow per line">
          <textarea rows={7} className={`${inputCls} font-mono text-[12.5px]`} value={flowTxt} onChange={(e) => { setFlowTxt(e.target.value); patch({ flow: textToFlow(e.target.value) }) }}
            placeholder={'(Order in) -> [In stock?]\n[In stock?] -yes-> Pack and ship -> (Done)\n[In stock?] -no-> Reorder'} />
          <span className="text-[11.5px] font-normal leading-4 text-faint">(Round) = start or end · [Square] = a decision · label a branch with -yes-&gt;</span>
        </Field>
      )}
      {s.layout === 'chart' && (
        <>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Chart type">
            {(['column', 'bar', 'line', 'pie'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={(s.chart?.kind ?? 'column') === k} onClick={() => patch({ chart: { data: [], ...s.chart, kind: k } })}
              className={`rounded-md px-1.5 py-1.5 text-[12px] capitalize ${(s.chart?.kind ?? 'column') === k ? 'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] font-semibold text-ink ring-1 ring-accent' : 'bg-wash text-ink-2 hover:text-ink'}`}>{k}</button>)}
          </div>
          <Field label="Data · “Label | number”, one per line">
            <textarea rows={6} className={`${inputCls} font-mono text-[12.5px]`} value={chartTxt} placeholder={'Jan | 31\nFeb | 44\nMar | 52'} onChange={(e) => {
              setChartTxt(e.target.value)
              const data = e.target.value.split('\n').map((l) => l.split('|')).filter((x) => x.length >= 2 && x[0].trim()).map(([l, v]) => ({ label: l.trim(), value: parseFloat(v.replace(/[^\d.-]/g, '')) })).filter((d) => Number.isFinite(d.value))
              patch({ chart: { kind: 'column', ...s.chart, data } })
            }} />
          </Field>
          <div className="flex gap-2">
            <Field label="Unit"><input className={`${inputCls} w-20`} value={s.chart?.unit ?? ''} placeholder="%" onChange={(e) => patch({ chart: { kind: 'column', data: [], ...s.chart, unit: e.target.value || undefined } })} /></Field>
            <Field label="What’s measured"><input className={inputCls} value={s.chart?.series ?? ''} placeholder="Monthly output" onChange={(e) => patch({ chart: { kind: 'column', data: [], ...s.chart, series: e.target.value || undefined } })} /></Field>
          </div>
        </>
      )}
      {s.layout === 'matrix' && (
        <>
          <div className="flex gap-2">
            <Field label="Up the side"><input className={inputCls} value={s.matrix?.y ?? ''} placeholder="Impact ↑" onChange={(e) => patch({ matrix: { x: '', quads: [], ...s.matrix, y: e.target.value } })} /></Field>
            <Field label="Along the bottom"><input className={inputCls} value={s.matrix?.x ?? ''} placeholder="Effort →" onChange={(e) => patch({ matrix: { y: '', quads: [], ...s.matrix, x: e.target.value } })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {['Top left', 'Top right', 'Bottom left', 'Bottom right'].map((name, i) => (
              <textarea key={name} aria-label={name} rows={3} className={`${inputCls} text-[12.5px]`} placeholder={`${name}: title, then points`} value={quads[i]} onChange={(e) => {
                const next = quads.map((q, k) => (k === i ? e.target.value : q)); setQuads(next)
                patch({ matrix: { x: s.matrix?.x ?? '', y: s.matrix?.y ?? '', quads: next.map((q) => { const [title = '', ...points] = q.split('\n').map((l) => l.trim()).filter(Boolean); return { title, points } }) } })
              }} />
            ))}
          </div>
        </>
      )}
      {has('process', 'timeline', 'flow', 'chart', 'matrix') && <Field label="What to notice (optional)"><input className={inputCls} value={s.subtitle ?? ''} onChange={(e) => patch({ subtitle: e.target.value || undefined })} placeholder="One line under the diagram" /></Field>}
      {has('bullets', 'closing', 'image') && <Field label="Points · one per line"><textarea rows={6} className={inputCls} value={bul} onChange={(e) => { setBul(e.target.value); patch({ bullets: lines(e.target.value) }) }} placeholder="Use **bold** for a key word" /></Field>}
      {s.layout === 'two' && (
        <>
          <Field label="Left heading"><input className={inputCls} value={s.left?.heading ?? ''} onChange={(e) => patch({ left: { bullets: s.left?.bullets ?? [], heading: e.target.value } })} /></Field>
          <Field label="Left points"><textarea rows={4} className={inputCls} value={lb} onChange={(e) => { setLb(e.target.value); patch({ left: { heading: s.left?.heading, bullets: lines(e.target.value) } }) }} /></Field>
          <Field label="Right heading"><input className={inputCls} value={s.right?.heading ?? ''} onChange={(e) => patch({ right: { bullets: s.right?.bullets ?? [], heading: e.target.value } })} /></Field>
          <Field label="Right points"><textarea rows={4} className={inputCls} value={rb} onChange={(e) => { setRb(e.target.value); patch({ right: { heading: s.right?.heading, bullets: lines(e.target.value) } }) }} /></Field>
        </>
      )}
      {s.layout === 'stat' && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-medium text-muted">Numbers · up to 3</div>
          {stats.map((x, i) => (
            <div key={i} className="flex gap-1.5">
              <input aria-label={`Number ${i + 1}`} className={`${inputCls} w-28`} placeholder="42%" value={x.value} onChange={(e) => patch({ stats: stats.map((y, k) => (k === i ? { ...y, value: e.target.value } : y)) })} />
              <input aria-label={`Label ${i + 1}`} className={inputCls} placeholder="what it means" value={x.label} onChange={(e) => patch({ stats: stats.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })} />
              {stats.length > 1 && <IconButton size="sm" label="Remove number" onClick={() => patch({ stats: stats.filter((_, k) => k !== i) })}><X size={14} /></IconButton>}
            </div>
          ))}
          {stats.length < 3 && <button type="button" onClick={() => patch({ stats: [...stats, { value: '', label: '' }] })} className="self-start rounded-md px-2 py-1 text-[12.5px] text-accent-ink hover:bg-wash">+ Add a number</button>}
        </div>
      )}
      {s.layout === 'quote' && (
        <>
          <Field label="Quote"><textarea rows={4} className={inputCls} value={s.quote?.text ?? ''} onChange={(e) => patch({ quote: { text: e.target.value, by: s.quote?.by } })} /></Field>
          <Field label="Who said it"><input className={inputCls} value={s.quote?.by ?? ''} onChange={(e) => patch({ quote: { text: s.quote?.text ?? '', by: e.target.value } })} /></Field>
        </>
      )}
      {s.layout === 'table' && (
        <Field label="Table · one row per line, columns split with |">
          <textarea rows={7} className={`${inputCls} font-mono text-[12.5px]`} value={tbl} placeholder={'Option | Cost | Time\nA | $10k | 2 weeks'} onChange={(e) => {
            setTbl(e.target.value)
            const rows = e.target.value.split('\n').filter((l) => l.trim()).map((l) => l.split('|').map((c) => c.trim()))
            patch({ table: { head: rows[0] ?? [], rows: rows.slice(1) } })
          }} />
        </Field>
      )}
      {s.layout === 'image' && (
        <div className="flex gap-2">
          <button type="button" onClick={pickImage} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-wash py-2 text-[13px] hover:bg-wash-2"><ImagePlus size={15} /> {s.image ? 'Change picture' : 'Choose picture'}</button>
          {s.image && <button type="button" onClick={() => patch({ image: null })} className="rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-wash">Remove</button>}
        </div>
      )}
      <Field label="Speaker notes"><textarea rows={4} className={inputCls} value={s.notes ?? ''} onChange={(e) => patch({ notes: e.target.value || undefined })} placeholder="What you'll say — shown when you press N while presenting" /></Field>
      {ai && s.layout !== 'image' && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted"><Sparkles size={13} className="text-accent" /> Rewrite this slide</div>
          <div className="flex flex-wrap gap-1.5">
            {([...(VISUAL.includes(s.layout) || s.layout === 'title' ? [] : [[MAKE_VISUAL, 'Make it visual']]), ['Make it shorter: fewer, tighter points', 'Shorter'], ['Make it punchier and more confident', 'Punchier'], ['Add more detail from the same facts', 'More detail'], ['Use simpler, plain words', 'Simpler']] as const).map(([how, label]) => (
              <button key={label} type="button" disabled={!!aiBusy} onClick={() => onRewrite(how, label)} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 hover:border-accent/60 hover:text-ink disabled:opacity-50">{aiBusy === label ? 'Working…' : label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Full-screen slideshow: → / Space / click for next, ← for back, N for notes, Esc to stop. */
function Present({ deck, start, author, onExit }: { deck: Deck; start: number; author: string; onExit: (i: number) => void }) {
  const [i, setI] = useState(start)
  const [notes, setNotes] = useState(false)
  // presenter view: this slide, the next one, your notes and a timer — like PowerPoint's
  const [presenter, setPresenter] = useState(false)
  const [t0] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  const elapsed = Math.floor((now - t0) / 1000)
  const theme = themeOf(deck.theme)
  const root = useRef<HTMLDivElement>(null)
  const touch = useRef<number | null>(null)
  const iRef = useRef(i)
  useEffect(() => { iRef.current = i }, [i])
  const done = useRef(false)
  const finish = useCallback(() => { if (done.current) return; done.current = true; onExit(iRef.current) }, [onExit])
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(deck.slides.length - 1, x + d))), [deck.slides.length])
  const exit = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); finish() }, [finish])
  useEffect(() => { root.current?.requestFullscreen?.().catch(() => {}); root.current?.focus() }, [])
  useEffect(() => {
    // leaving full screen with the browser's own Esc also ends the show
    const onFs = () => { if (!document.fullscreenElement) finish() }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [finish])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(deck.slides.length - 1)
      else if (e.key.toLowerCase() === 'n') setNotes((x) => !x)
      else if (e.key.toLowerCase() === 'p') setPresenter((x) => !x)
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exit() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, exit, deck.slides.length])
  const s = deck.slides[i]
  const said = useMemo(() => [s.title, s.subtitle, ...(s.bullets ?? []), s.quote?.text].filter(Boolean).join('. '), [s])
  return createPortal(
    <div ref={root} tabIndex={-1} role="dialog" aria-label="Presenting" className="fixed inset-0 z-[95] flex flex-col bg-black outline-none"
      onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; const x = e.clientX / window.innerWidth; go(x < 0.3 ? -1 : 1) }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }} onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1) }}>
      {presenter ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,30%)] gap-5 bg-neutral-950 p-5 text-neutral-100" aria-label="Presenter view">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1"><SlideView slide={s} theme={theme} meta={metaFor(deck, i, author)} fit="contain" /></div>
            <div className="flex items-center gap-4 text-[15px] tabular-nums text-neutral-300">
              <span className="text-[26px] font-semibold text-white">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
              <span>Slide {i + 1} of {deck.slides.length}</span>
              <span className="ml-auto">{new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Next</div>
            {deck.slides[i + 1] ? <div className="overflow-hidden rounded-md ring-1 ring-white/15"><SlideView slide={deck.slides[i + 1]} theme={theme} meta={metaFor(deck, i + 1, author)} /></div> : <div className="rounded-md border border-white/15 px-4 py-8 text-center text-[14px] text-neutral-400">End of the show</div>}
            <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Notes</div>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[20px] leading-relaxed">{s.notes || <span className="text-neutral-500">No speaker notes for this slide.</span>}</div>
          </div>
        </div>
      ) : <div className="min-h-0 flex-1"><SlideView slide={s} theme={theme} meta={metaFor(deck, i, author)} fit="contain" /></div>}
      <p className="sr-only" aria-live="polite">Slide {i + 1} of {deck.slides.length}. {said}</p>
      {notes && !presenter && <div className="max-h-[30vh] shrink-0 overflow-y-auto border-t border-white/10 bg-neutral-900 px-8 py-4 text-[17px] leading-relaxed text-neutral-100">{s.notes || <span className="text-neutral-400">No speaker notes for this slide.</span>}</div>}
      <div className="group absolute inset-x-0 bottom-0 flex h-16 items-end">
        <div className="flex w-full items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" aria-label="Previous" onClick={() => go(-1)} className="rounded-full p-2 text-white/85 hover:bg-white/10"><ChevronLeft size={20} /></button>
          <span className="text-[13px] tabular-nums text-white/85">{i + 1} / {deck.slides.length}</span>
          <button type="button" aria-label="Next" onClick={() => go(1)} className="rounded-full p-2 text-white/85 hover:bg-white/10"><ChevronRight size={20} /></button>
          {!presenter && <button type="button" onClick={() => setNotes(!notes)} className="ml-2 rounded-full px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/10">{notes ? 'Hide notes' : 'Notes (N)'}</button>}
          <button type="button" onClick={() => setPresenter(!presenter)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/10"><MonitorPlay size={15} /> {presenter ? 'Audience view' : 'Presenter view (P)'}</button>
          <button type="button" onClick={exit} className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/10">End show (Esc)</button>
        </div>
      </div>
      <div className="absolute inset-x-0 top-0 h-[3px] bg-white/10"><div className="h-full bg-white/70 transition-[width] duration-300" style={{ width: `${((i + 1) / deck.slides.length) * 100}%` }} /></div>
    </div>, document.body)
}
