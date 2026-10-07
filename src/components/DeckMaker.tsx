import { useLiveQuery } from 'dexie-react-hooks'
import { FileCode2, FileText, Presentation, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db } from '../lib/db'
import { DECK_THEMES, fromBlocks, generateWithAI, markdownSource, metaFor, noteSource, pdfPageSlides, pdfSource, saveDeck, type AiOpts, type Deck, type Slide } from '../lib/deck'
import { pickFile } from '../lib/image'
import { usePhone } from '../lib/mobile'
import { useAI, usePrefs } from '../lib/prefs'
import { SlideView } from './SlideView'
import { Segmented, Switch } from './ui'

export type DeckSource = { kind: 'note'; id: string } | { kind: 'pdf'; doc: PDFDocumentProxy; name: string }
type Kind = 'note' | 'markdown' | 'pdf'
type Method = 'ai' | 'outline' | 'pages'

const PURPOSES: [AiOpts['purpose'], string][] = [['inform', 'Inform'], ['pitch', 'Pitch'], ['teach', 'Teach'], ['status', 'Status update'], ['summary', 'Summary']]
const LENGTHS: [AiOpts['length'], string][] = [['short', 'Short · 5–7'], ['standard', 'Standard · 8–12'], ['detailed', 'Detailed · 13–18']]

/** Make a presentation from a note, a Markdown file or a PDF — with AI, or straight from its structure. */
export function DeckMaker({ source, onClose, onCreated }: { source?: DeckSource; onClose: () => void; onCreated: (noteId: string) => void }) {
  const ai = useAI()
  const phone = usePhone()
  const { prefs } = usePrefs()
  const [kind, setKind] = useState<Kind>(source?.kind ?? 'note')
  const notes = useLiveQuery(() => db.notes.filter((n) => n.trashedAt === null && !n.locked && !n.templateDraft && !n.deck).toArray(), []) ?? []
  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300), [notes])
  const [noteId, setNoteId] = useState(source?.kind === 'note' ? source.id : '')
  useEffect(() => { if (!noteId && sorted[0]) setNoteId(sorted[0].id) }, [sorted, noteId])
  const kids = notes.filter((n) => n.parentId === noteId).length
  const [withPages, setWithPages] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [method, setMethod] = useState<Method>(ai ? 'ai' : source?.kind === 'pdf' ? 'pages' : 'outline')
  useEffect(() => { if (!ai && method === 'ai') setMethod(kind === 'pdf' ? 'pages' : 'outline'); if (kind === 'pdf' && method === 'outline') setMethod(ai ? 'ai' : 'pages'); if (kind !== 'pdf' && method === 'pages') setMethod(ai ? 'ai' : 'outline') }, [kind, ai, method])
  const [purpose, setPurpose] = useState<AiOpts['purpose']>('inform')
  const [length, setLength] = useState<AiOpts['length']>('standard')
  const [speaker, setSpeaker] = useState(true)
  const [extra, setExtra] = useState('')
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('folio.deckTheme') || 'classic' } catch { return 'classic' } })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const ready = kind === 'note' ? !!noteId : kind === 'markdown' ? !!file : !!(file || source?.kind === 'pdf')
  const sourceName = kind === 'note' ? sorted.find((n) => n.id === noteId)?.title || 'Untitled' : kind === 'pdf' && source?.kind === 'pdf' && !file ? source.name : file?.name ?? ''

  const pick = async () => {
    const f = await pickFile(kind === 'pdf' ? 'application/pdf,.pdf' : '.md,.markdown,.txt,text/markdown,text/plain')
    if (f) { setFile(f); setError('') }
  }
  const run = async () => {
    setError(''); setBusy('Getting the content…')
    try { localStorage.setItem('folio.deckTheme', theme) } catch { /* ignore */ }
    try {
      let title = '', subtitle = '', slides: Slide[] = []
      let src: Deck['source']
      if (kind === 'pdf') {
        const data = file ? await file.arrayBuffer() : null
        const doc = data ? (await import('../lib/margins').then((m) => m.openPdf(data))) : (source as { doc: PDFDocumentProxy }).doc
        const name = file?.name ?? (source as { name: string }).name
        src = { kind: 'pdf', name }
        if (method === 'pages') {
          const p = await pdfSource(doc, name)
          title = p.title
          slides = await pdfPageSlides(doc, (s) => setBusy(s))
        } else {
          const p = await pdfSource(doc, name, setBusy)
          if (p.text.replace(/\s/g, '').length < 200) throw new Error('This PDF has almost no text (it may be scanned images). Try “One slide per page”.')
          const r = await generateWithAI(p.text, { purpose, length, notes: speaker, extra }, setBusy)
          title = r.title || p.title; subtitle = r.subtitle; slides = r.slides
        }
      } else {
        const s = kind === 'note' ? await noteSource(noteId, withPages && kids > 0) : await markdownSource(file!)
        src = { kind: kind === 'note' ? 'note' : 'markdown', name: s.title, id: kind === 'note' ? noteId : undefined }
        if (method === 'ai') {
          if (s.text.trim().length < 80) throw new Error('There’s very little here to make slides from. Write a bit more, or use “From headings”.')
          const r = await generateWithAI(s.text, { purpose, length, notes: speaker, extra }, setBusy)
          title = r.title || s.title; subtitle = r.subtitle; slides = r.slides
        } else { title = s.title; slides = fromBlocks(s.blocks, s.title) }
      }
      if (slides[0]?.layout !== 'title') slides.unshift({ id: crypto.randomUUID().slice(0, 8), layout: 'title', title, subtitle: subtitle || undefined })
      const deck: Deck = { v: 1, theme, title: title || 'Presentation', subtitle, slides, source: src, made: method, createdAt: Date.now() }
      setBusy('Saving…')
      const n = await saveDeck(deck)
      onCreated(n.id)
    } catch (e) { setError((e as Error).message || 'Something went wrong.'); setBusy('') }
  }

  const sample = (k: string): Deck => ({ v: 1, theme: k, title: sourceName || 'Your presentation', slides: [{ id: 's', layout: 'title', title: sourceName || 'Your presentation', subtitle: 'Made with Folio' }], made: 'outline', createdAt: Date.now() })
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] transition-colors ${on ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-ink-2 hover:border-muted/60'}`

  return createPortal(
    <div className={`animate-fade fixed inset-0 z-[65] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-4'}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Make a presentation"
        className={`flex w-full flex-col overflow-hidden border-line bg-pop text-ink shadow-2xl ${phone ? 'animate-sheet max-h-[94dvh] rounded-t-3xl border-t' : 'animate-pop max-h-[92vh] max-w-3xl rounded-2xl border'}`}>
        <header className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-4">
          <Presentation size={19} className="text-accent" />
          <h2 className="text-[17px] font-semibold">Make a presentation</h2>
          <button type="button" aria-label="Close" onClick={onClose} disabled={!!busy} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-wash disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          {/* 1 · from */}
          <section aria-labelledby="dm-from">
            <h3 id="dm-from" className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">From</h3>
            <Segmented value={kind} onChange={(k) => { setKind(k); setFile(null); setError('') }} options={[
              { value: 'note', label: <span className="flex items-center justify-center gap-1.5"><FileText size={14} /> A note</span> },
              { value: 'markdown', label: <span className="flex items-center justify-center gap-1.5"><FileCode2 size={14} /> Markdown file</span> },
              { value: 'pdf', label: <span className="flex items-center justify-center gap-1.5"><FileText size={14} /> PDF</span> },
            ]} />
            <div className="mt-2.5">
              {kind === 'note' ? (
                <div className="flex flex-col gap-1.5">
                  <select aria-label="Note" value={noteId} onChange={(e) => setNoteId(e.target.value)} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent">
                    {sorted.map((n) => <option key={n.id} value={n.id}>{n.title || n.preview.replace(/[\u0001-\u0003]/g, '').slice(0, 60) || 'Untitled'}</option>)}
                  </select>
                  {kids > 0 && <Switch label={<span className="text-[13px]">Include its {kids} {kids === 1 ? 'page' : 'pages'} inside</span>} checked={withPages} onChange={setWithPages} />}
                </div>
              ) : (
                <button type="button" onClick={pick} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left text-[14px] hover:border-accent/60">
                  <span className="min-w-0 flex-1 truncate">{sourceName || (kind === 'pdf' ? 'Choose a PDF…' : 'Choose a Markdown file…')}</span>
                  <span className="text-[12.5px] text-accent-ink">{sourceName ? 'Change' : 'Browse'}</span>
                </button>
              )}
              {kind === 'pdf' && <p className="mt-1.5 text-[12px] text-faint">The PDF is read here and not kept — only the slides are saved.</p>}
            </div>
          </section>

          {/* 2 · how */}
          <section aria-labelledby="dm-how">
            <h3 id="dm-how" className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">How</h3>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to make it">
              <button type="button" role="radio" aria-checked={method === 'ai'} disabled={!ai} onClick={() => setMethod('ai')}
                className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left disabled:opacity-60 ${method === 'ai' ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'border-line hover:border-muted/60'}`}>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold"><Sparkles size={15} className="text-accent" /> Write it with AI</span>
                <span className="text-[12px] leading-4 text-muted">{ai ? 'Reads the content and designs the slides: layouts, numbers, speaker notes.' : 'Turn on AI in Settings to use this. Nothing is sent anywhere until you do.'}</span>
              </button>
              {kind === 'pdf' ? (
                <button type="button" role="radio" aria-checked={method === 'pages'} onClick={() => setMethod('pages')}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left ${method === 'pages' ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'border-line hover:border-muted/60'}`}>
                  <span className="text-[14px] font-semibold">One slide per page</span>
                  <span className="text-[12px] leading-4 text-muted">Present the PDF as it is. No AI, nothing leaves this device.</span>
                </button>
              ) : (
                <button type="button" role="radio" aria-checked={method === 'outline'} onClick={() => setMethod('outline')}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left ${method === 'outline' ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'border-line hover:border-muted/60'}`}>
                  <span className="text-[14px] font-semibold">From headings</span>
                  <span className="text-[12px] leading-4 text-muted">Each heading becomes a slide with its points, tables and pictures. No AI.</span>
                </button>
              )}
            </div>
            {method === 'ai' && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-line p-3">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Purpose">{PURPOSES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={purpose === k} onClick={() => setPurpose(k)} className={chip(purpose === k)}>{l}</button>)}</div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Length">{LENGTHS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={length === k} onClick={() => setLength(k)} className={chip(length === k)}>{l}</button>)}</div>
                <Switch label={<span className="text-[13px]">Speaker notes for each slide</span>} checked={speaker} onChange={setSpeaker} />
                <input value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Anything else" placeholder="Anything else? e.g. “for the client, focus on cost and timeline”"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none focus:border-accent" />
                <p className="text-[11.5px] text-faint">Sent to Groq with your key only when you press Create. Long sources are read in parts.</p>
              </div>
            )}
          </section>

          {/* 3 · look */}
          <section aria-labelledby="dm-look">
            <h3 id="dm-look" className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Look <span className="font-normal normal-case tracking-normal text-faint">· change it any time</span></h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Theme">
              {DECK_THEMES.map((t) => {
                const d = sample(t.key)
                return (
                  <button key={t.key} type="button" role="radio" aria-checked={theme === t.key} aria-label={t.name} onClick={() => setTheme(t.key)} className="text-left">
                    <div className={`overflow-hidden rounded-lg ring-1 transition ${theme === t.key ? 'ring-2 ring-accent' : 'ring-line hover:ring-muted/60'}`}><SlideView slide={d.slides[0]} theme={t} meta={metaFor(d, 0, prefs.name.trim())} /></div>
                    <div className="mt-1 text-[12.5px] font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted">{t.note}</div>
                  </button>
                )
              })}
            </div>
          </section>
          {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-[13px] text-ink">{error}</p>}
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{busy || (ready ? `From “${sourceName}”` : 'Choose what to make it from')}</p>
          <button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg px-4 py-2 text-[14px] text-muted hover:bg-wash disabled:opacity-40">Cancel</button>
          <button type="button" onClick={run} disabled={!ready || !!busy} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent disabled:opacity-50">{busy ? 'Working…' : 'Create presentation'}</button>
        </footer>
      </div>
    </div>, document.body)
}
