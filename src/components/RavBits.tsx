import { useLiveQuery } from 'dexie-react-hooks'
import { Compass, ShieldAlert, Swords, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { db, patchNote } from '../lib/db'
import { usePhone } from '../lib/mobile'
import type { Mark, RavMeta } from '../lib/rav'
import type { Note } from '../types'
import { Switch } from './ui'

/** Start a Reason · Attack · Validate review of a note (or pick one). */
export function RavDialog({ noteId, onClose, onDone }: { noteId?: string; onClose: () => void; onDone: (pageId: string) => void }) {
  const phone = usePhone()
  const notes = useLiveQuery(() => db.notes.filter((n) => n.trashedAt === null && !n.locked && !n.templateDraft && !n.deck && !n.rav).toArray(), []) ?? []
  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300), [notes])
  const [id, setId] = useState(noteId ?? '')
  const pick = id || sorted[0]?.id || ''
  const kids = notes.filter((n) => n.parentId === pick).length
  const [withPages, setWithPages] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = async () => {
    setError(''); setBusy('Reading the note…')
    try { const { runRav } = await import('../lib/rav'); onDone(await runRav(pick, { withPages: withPages && kids > 0 }, setBusy)) }
    catch (e) { setError((e as Error).message || 'Something went wrong.'); setBusy('') }
  }
  const row = (icon: React.ReactNode, name: string, what: string) => (
    <li className="flex gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">{icon}</span>
      <span className="text-[13.5px] leading-5 text-ink-2"><b className="font-semibold text-ink">{name}</b> — {what}</span></li>
  )
  return createPortal(
    <div className={`animate-fade fixed inset-0 z-[65] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-4'}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Reason · Attack · Validate"
        className={`flex w-full flex-col overflow-hidden border-line bg-pop text-ink shadow-2xl ${phone ? 'animate-sheet max-h-[94dvh] rounded-t-3xl border-t' : 'animate-pop max-w-lg rounded-2xl border'}`}>
        <header className="flex items-center gap-2 px-5 pb-2 pt-4">
          <Compass size={19} className="text-accent" />
          <h2 className="text-[17px] font-semibold">Reason · Attack · Validate</h2>
          <button type="button" aria-label="Close" disabled={!!busy} onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-wash disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 pb-4">
          <p className="text-[13.5px] leading-5 text-muted">Put an idea, plan or decision through its paces. You get a page under the note — the note itself isn’t changed.</p>
          <ul className="space-y-2.5">
            {row(<Compass size={16} />, 'Reason', 'the claim, what it rests on, and how it follows')}
            {row(<Swords size={16} />, 'Attack', 'the strongest objections a sharp sceptic would raise')}
            {row(<ShieldAlert size={16} />, 'Validate', 'which assumptions your note really backs up (with exact quotes, checked here) and a cheap test for each one that isn’t — added to Tasks with dates')}
          </ul>
          {!noteId && (
            <select aria-label="Note" value={pick} onChange={(e) => setId(e.target.value)} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent">
              {sorted.map((n) => <option key={n.id} value={n.id}>{n.title || n.preview.replace(/[\u0001-\u0003]/g, '').slice(0, 60) || 'Untitled'}</option>)}
            </select>
          )}
          {kids > 0 && <Switch label={<span className="text-[13px]">Include its {kids} {kids === 1 ? 'page' : 'pages'} (the project’s library)</span>} checked={withPages} onChange={setWithPages} />}
          <p className="text-[11.5px] leading-4 text-faint">Sent to Groq with your key: this note{kids > 0 && withPages ? ' and its pages' : ''}, nothing else. Long notes are read up to about 10,000 characters.</p>
          {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-[13px]">{error}</p>}
        </div>
        <footer className="flex items-center gap-3 border-t border-line px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{busy}</p>
          <button type="button" disabled={!!busy} onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-muted hover:bg-wash disabled:opacity-40">Cancel</button>
          <button type="button" disabled={!!busy || !pick} onClick={run} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent disabled:opacity-50">{busy ? 'Working…' : 'Run RAV'}</button>
        </footer>
      </div>
    </div>, document.body)
}

const MARKS: [Mark, string][] = [['valid', 'Valid'], ['answered', 'Answered'], ['irrelevant', 'Not relevant']]
const VERDICT = { promising: 'Promising', 'needs work': 'Needs work', weak: 'Weak' } as const

/** On a RAV page: the verdict, and each objection to mark — valid, answered, or not relevant. */
export function RavBanner({ note, onOpen }: { note: Note; onOpen: (id: string) => void }) {
  const r = note.rav as RavMeta
  const source = useLiveQuery(() => db.notes.get(r.of), [r.of])
  const marked = Object.keys(r.marks ?? {}).length
  const setMark = (id: string, m: Mark) => {
    const marks = { ...(r.marks ?? {}) }
    if (marks[id] === m) delete marks[id]; else marks[id] = m
    patchNote(note.id, { rav: { ...r, marks } })
  }
  const tone = r.verdict === 'promising' ? 'text-success' : r.verdict === 'weak' ? 'text-danger' : 'text-warn'
  return (
    <section aria-label="RAV review" className="mx-[22px] mb-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:mx-[54px]">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <Compass size={16} className="text-accent" />
        <span className="font-semibold text-ink">Verdict: <span className={tone}>{VERDICT[r.verdict]}</span></span>
        {source && <button type="button" onClick={() => onOpen(source.id)} className="ml-auto truncate rounded-md px-2 py-1 text-[12.5px] text-accent-ink hover:bg-wash">Open “{source.title || 'Untitled'}”</button>}
      </div>
      {r.attacks.length > 0 && (
        <>
          <p className="mt-2 text-[12.5px] text-muted">Mark each objection as you think it through ({marked} of {r.attacks.length} marked). Your marks stay with this page.</p>
          <ul className="mt-2 space-y-2">
            {r.attacks.map((a) => (
              <li key={a.id} className="rounded-xl border border-line/70 bg-canvas/40 px-3 py-2">
                <div className="text-[13px] leading-5 text-ink-2"><b className="font-semibold text-ink">{a.id} · {a.severity}</b> — {a.point}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Objection ${a.id}`}>
                  {MARKS.map(([m, label]) => (
                    <button key={m} type="button" role="radio" aria-checked={r.marks?.[a.id] === m} onClick={() => setMark(a.id, m)}
                      className={`rounded-full border px-2.5 py-0.5 text-[12px] ${r.marks?.[a.id] === m ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-ink' : 'border-line text-muted hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** After a voice memo is written up: offer to test the ideas in it (once; dismissible). */
export function RavOffer({ note, onRun }: { note: Note; onRun: () => void }) {
  const has = useLiveQuery(() => db.notes.filter((n) => n.rav?.of === note.id && n.trashedAt === null).count(), [note.id])
  if (!note.memo || note.memo.status !== 'done' || note.memo.ravDismissed || has === undefined || has > 0) return null
  return (
    <div className="mx-[22px] mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 sm:mx-[54px]">
      <Compass size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-[13px] text-ink-2">Test the ideas in this recording — reason them through, attack them, and see what holds up.</span>
      <button type="button" onClick={onRun} className="rounded-full bg-accent px-3 py-1 text-[12.5px] font-medium text-on-accent">Reason · Attack · Validate</button>
      <button type="button" aria-label="Not now" onClick={() => patchNote(note.id, { memo: { ...note.memo!, ravDismissed: true } })} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-wash"><X size={15} /></button>
    </div>
  )
}
