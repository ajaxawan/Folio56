import { ChevronLeft, ChevronRight, Mic } from 'lucide-react'
import { useState } from 'react'
import { openDaily } from '../lib/db'
import { todayKey } from '../lib/templates'
import type { Note } from '../types'

/** Calendar + timeline of daily notes. Click any day to open (or start) its note. */
export function JournalView({ notes, onOpen, onSpeak }: { notes: Note[]; onOpen: (id: string) => void; onSpeak?: () => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const daily = notes.filter((n) => n.daily && n.trashedAt === null).sort((a, b) => (b.daily! > a.daily! ? 1 : -1))
  const byDay = new Map(daily.map((n) => [n.daily!, n]))
  const first = new Date(month); const offset = first.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  const tk = todayKey()
  const open = async (d: Date) => onOpen((await openDaily(d)).id)

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-title text-[30px] font-bold tracking-tight">Journal</h1>
          {onSpeak && <button type="button" onClick={onSpeak} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13.5px] text-ink-2 hover:border-accent/60"><Mic size={15} className="text-red-400" /> Speak today’s entry</button>}
        </div>
        <div className="rounded-2xl border border-line bg-card p-4 shadow-[inset_0_1px_0_var(--color-highlight)]">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md p-1 text-muted hover:bg-wash hover:text-ink"><ChevronLeft size={18} /></button>
            <span className="font-title text-[16px] font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md p-1 text-muted hover:bg-wash hover:text-ink"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-faint">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />
              const k = todayKey(d); const has = byDay.has(k); const isToday = k === tk
              return (
                <button key={i} type="button" onClick={() => open(d)} title={has ? byDay.get(k)!.title : 'Start a note for this day'}
                  className={`relative flex aspect-square items-center justify-center rounded-lg text-[13px] transition-colors ${isToday ? 'bg-accent font-semibold text-on-accent' : has ? 'bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-ink hover:bg-[color-mix(in_srgb,var(--color-accent)_26%,transparent)]' : 'text-ink-2 hover:bg-wash'}`}>
                  {d.getDate()}
                  {has && !isToday && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
                </button>
              )
            })}
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-faint">{daily.length} daily notes · click any day to open or start one</p>
      </div>

      <div className="lg:pt-14">
        {daily.map((n) => {
          const d = new Date(n.daily! + 'T00:00:00')
          const tasks = n.checklist.filter((c) => c.text.trim())
          const done = tasks.filter((c) => c.checked).length
          const preview = n.preview.split('\n').filter((l) => l && !l.startsWith('\u0001')).join(' ').slice(0, 220)
          return (
            <button key={n.id} type="button" onClick={() => onOpen(n.id)}
              className="group mb-3 flex w-full gap-4 rounded-2xl border border-line bg-card p-4 text-left shadow-[inset_0_1px_0_var(--color-highlight)] transition hover:border-accent/50">
              <div className="w-14 shrink-0 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className="font-title text-[28px] font-semibold leading-none">{d.getDate()}</div>
                <div className="text-[11px] text-faint">{d.toLocaleDateString(undefined, { month: 'short' })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-ink">{n.title || 'Daily note'}</div>
                {tasks.length > 0 && <div className="mt-0.5 text-[12.5px] text-muted">{done}/{tasks.length} focus tasks done</div>}
                {preview && <p className="mt-1 line-clamp-2 text-[13.5px] text-ink-2">{preview}</p>}
                {!preview && !tasks.length && <p className="mt-1 text-[13px] text-faint">Empty</p>}
              </div>
            </button>
          )
        })}
        {!daily.length && <p className="py-16 text-center text-muted">No daily notes yet. Press <kbd className="rounded border border-line px-1.5">T</kbd> or pick a day.</p>}
      </div>
    </div>
  )
}
