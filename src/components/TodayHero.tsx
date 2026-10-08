import { ArrowRight, CheckSquare, ChevronDown, ChevronUp, CornerDownRight, Mic, Plus, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addDailyTask, updateNote } from '../lib/db'
import { greeting, usePrefs } from '../lib/prefs'
import { toggleChecklistItem } from '../lib/preview'
import { todayKey } from '../lib/templates'
import { firstName } from '../lib/device'
import { usePhone } from '../lib/mobile'
import { collectTasks } from '../lib/tasks'
import type { Note } from '../types'

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
const firstLine = (s: string) => s.replace(/[\u0001\u0002\u0003]/g, '').split('\n').find((l) => l.trim()) ?? ''

/**
 * The "Today" home card: the date, today's focus list, what's due, and a line to pick up the page
 * you were last working on. (No streaks, rings or activity grids — Folio doesn't keep score.)
 */
export function TodayHero({ notes, onOpenToday, onTasks, onJournal, onOpen, onReview }: {
  notes: Note[]; onOpenToday: () => void; onTasks: () => void; onJournal?: () => void; onOpen?: (id: string) => void; onReview?: () => void
}) {
  const { prefs, set } = usePrefs()
  const phone = usePhone()
  const [text, setText] = useState('')
  const now = new Date()
  const today = notes.find((n) => n.daily === todayKey() && n.trashedAt === null)
  const tasks = (today?.checklist ?? []).map((c, i) => ({ ...c, i })).filter((c) => c.text.trim())
  const done = tasks.filter((t) => t.checked).length
  const { dueToday, overdue } = useMemo(() => {
    const tk = todayKey(); let dueToday = 0, overdue = 0
    for (const t of collectTasks(notes)) { if (t.checked || t.note.daily === tk) continue; if (t.due === tk) dueToday++; else if (t.due && t.due < tk) overdue++ }
    return { dueToday, overdue }
  }, [notes])
  const dueLabel = overdue ? <><span className="text-danger">{overdue} overdue</span>{dueToday ? ` · ${dueToday} due` : ''}</> : dueToday ? `${dueToday} due today` : 'All tasks'
  // Pick up where you left off: the most recently edited page that isn't a daily note.
  const last = useMemo(() => notes.filter((n) => n.trashedAt === null && !n.archived && !n.daily && (n.title || n.preview)).sort((a, b) => b.updatedAt - a.updatedAt)[0], [notes])

  const add = async () => { const t = text.trim(); if (!t) return; setText(''); await addDailyTask(t) }
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const card = 'relative overflow-hidden border border-line bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_12%,var(--color-card))_0%,var(--color-card)_58%)] shadow-[inset_0_1px_0_var(--color-highlight)]'

  if (prefs.todayCollapsed) {
    return (
      <section className={`${card} mb-6 flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[13.5px]`}>
        <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent">Today</span>
        <span className="font-title text-[15px]">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        {tasks.length > 0 && <span className="text-muted max-sm:hidden">· {done}/{tasks.length} focus</span>}
        <button type="button" onClick={onTasks} className="text-muted hover:text-ink max-sm:hidden">· {dueLabel}</button>
        <button type="button" onClick={onOpenToday} className="ml-auto rounded-full px-3 py-1 text-[12.5px] text-accent hover:bg-wash">Open</button>
        <button type="button" aria-label="Expand today" onClick={() => set({ todayCollapsed: false })} className="rounded-md p-1 text-muted hover:bg-wash hover:text-ink"><ChevronDown size={16} /></button>
      </section>
    )
  }

  const focus = (max: number) => (
    <>
      {tasks.length > 0 && (
        <ul className="space-y-0.5">
          {tasks.slice(0, max).map((t) => (
            <li key={t.i}>
              <button type="button" onClick={() => today && updateNote(today.id, { content: toggleChecklistItem(today.content, t.i, !t.checked) })}
                className={`flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[15px] hover:bg-wash ${t.checked ? 'text-muted' : 'text-ink'}`}>
                {t.checked ? <CheckSquare size={18} className="tick mt-px shrink-0 text-accent" /> : <Square size={18} className="mt-px shrink-0 text-muted" />}
                <span className="min-w-0 [overflow-wrap:anywhere]"><span className={`strike ${t.checked ? 'on' : ''}`}>{t.text}</span></span>
              </button>
            </li>
          ))}
          {tasks.length > max && <li className="pl-8 text-[12px] text-muted">+ {tasks.length - max} more in today's note</li>}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 transition-colors focus-within:border-accent">
        <Plus size={16} className="text-accent" />
        <input aria-label="Add a focus task for today" value={text} onChange={(e) => setText(e.target.value)} placeholder={tasks.length ? 'Add another…' : 'What matters today?'} enterKeyHint="done"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint" />
      </form>
    </>
  )

  const cont = last && onOpen && (
    <button type="button" onClick={() => onOpen(last.id)} className="group flex w-full min-w-0 items-center gap-2.5 border-t border-line pt-3 text-left text-[13.5px]">
      <CornerDownRight size={15} className="shrink-0 text-accent" />
      <span className="shrink-0 text-muted">Continue</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-title text-[15.5px] text-ink group-hover:underline">{last.title || firstLine(last.preview) || 'Untitled'}</span>
        {last.title && firstLine(last.preview) && <span className="text-muted max-md:hidden"> — {firstLine(last.preview)}</span>}
      </span>
      <span className="shrink-0 text-[12px] text-faint">{ago(last.updatedAt)}</span>
    </button>
  )

  if (phone) {
    return (
      <section className={`${card} mb-5 rounded-[22px] p-4`} aria-label="Today">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onOpenToday} className="min-w-0 flex-1 text-left">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-accent">Today · {greeting()}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-title text-[30px] leading-none tracking-tight">{weekday}</span>
              <span className="truncate text-[14px] text-muted">{now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </div>
          </button>
          <button type="button" aria-label="Collapse today" onClick={() => set({ todayCollapsed: true })} className="rounded-md p-1 text-muted"><ChevronUp size={16} /></button>
        </div>
        <div className="mt-3">{focus(3)}</div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <button type="button" onClick={onOpenToday} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 font-medium text-on-accent active:scale-95">{today ? "Today's note" : 'Start today'} <ArrowRight size={14} /></button>
          {onJournal && <button type="button" aria-label="Speak today's journal" onClick={onJournal} className="inline-flex items-center rounded-full bg-wash px-3 py-2 text-ink-2 active:scale-95"><Mic size={14} className="text-red-400" /></button>}
          <button type="button" onClick={onTasks} className="ml-auto rounded-full px-2 py-2 text-muted active:text-accent">{dueLabel} →</button>
        </div>
        {cont && <div className="mt-3">{cont}</div>}
      </section>
    )
  }

  return (
    <section className={`${card} mb-8 rounded-3xl p-6 lg:p-7`} aria-label="Today">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <button type="button" aria-label="Collapse today" title="Collapse" onClick={() => set({ todayCollapsed: true })} className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted hover:bg-wash hover:text-ink"><ChevronUp size={16} /></button>
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-10">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-accent">Today</div>
          <div className="font-title text-[40px] leading-none tracking-tight lg:text-[48px]">{weekday}</div>
          <div className="mt-2 text-[15px] text-ink-2">{now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} · <span className="text-muted">{greeting()}{prefs.name.trim() ? `, ${firstName(prefs.name)}` : ''}.</span></div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onOpenToday} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-on-accent shadow-lg shadow-black/20 transition-transform hover:translate-x-0.5">
              {today ? "Open today's note" : "Start today's note"} <ArrowRight size={14} />
            </button>
            {onJournal && <button type="button" onClick={onJournal} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] text-ink-2 hover:border-accent/60"><Mic size={14} className="text-red-400" /> Speak it</button>}
            <button type="button" onClick={onTasks} className="px-2 py-2 text-[13px] text-muted hover:text-ink">{dueLabel} →</button>
            {onReview && [5, 6, 0].includes(now.getDay()) && <button type="button" onClick={onReview} className="px-2 py-2 text-[13px] text-muted hover:text-ink">Week in review →</button>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between pr-6">
            <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-muted">Focus</span>
            {tasks.length > 0 && <span className="text-[12px] text-faint">{done}/{tasks.length} done</span>}
          </div>
          {focus(5)}
        </div>
      </div>
      {cont && <div className="relative mt-5">{cont}</div>}
    </section>
  )
}
