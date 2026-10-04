import { AlertCircle, ArrowUpRight, CalendarDays, Check, ChevronRight, Inbox, Plus, Star, Sun, Sunrise, User } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { addTaskTo, db, inboxNote, updateNote } from '../lib/db'
import {
  collectTasks, dateOf, dueState, friendlyDue, keyOf, parseQuickAdd, quickAddText, setChecked, setDue, setStar, taskKey, type Task,
} from '../lib/tasks'
import type { Note } from '../types'
import { TaskSheet } from './TaskSheet'

type List = 'today' | 'upcoming' | 'anytime' | 'all' | 'done'
const DAY = 86400000

/** Writes a change to one task's note; returns the note's previous content (for Undo). */
async function edit(t: Task, fn: (c: unknown[]) => unknown[]) {
  const n = await db.notes.get(t.noteId); if (!n) return null
  const before = n.content
  await updateNote(n.id, { content: fn(n.content) as Note['content'] })
  return { id: n.id, before }
}

const ownerHue = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }

/**
 * Every checkbox in Folio, as one to-do list. Ticking, dating or starring here changes the
 * checkbox in its note. Smart lists: Today (incl. overdue), Upcoming, Anytime, All, Done.
 */
export function TasksView({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
  const [list, setList] = useState<List>('today')
  const [owner, setOwner] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Task | null>(null)
  const [toast, setToast] = useState<null | { msg: string; undo?: () => void }>(null)
  const [settling, setSettling] = useState<Set<string>>(new Set()) // just ticked: stay a moment, then leave
  const [limit, setLimit] = useState(80)
  const now = new Date(); const tk = keyOf(now)

  const all = useMemo(() => collectTasks(notes), [notes])
  const owners = useMemo(() => [...new Set(all.filter((t) => !t.checked && t.owner).map((t) => t.owner!))].sort(), [all])
  const mine = (t: Task) => !owner || (owner === '—' ? !t.owner : t.owner === owner)
  const open = all.filter((t) => (!t.checked || settling.has(taskKey(t))) && mine(t))
  const counts = {
    today: open.filter((t) => t.due && t.due <= tk).length,
    overdue: open.filter((t) => t.due && t.due < tk && !t.checked).length,
    upcoming: open.filter((t) => t.due && t.due > tk).length,
    anytime: open.filter((t) => !t.due).length,
    all: open.length,
  }

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4500); return () => clearTimeout(id) }, [toast])

  const toggle = async (t: Task) => {
    const k = taskKey(t)
    const r = await edit(t, (c) => setChecked(c, t.index, !t.checked))
    if (!t.checked) {
      setSettling((s) => new Set(s).add(k))
      setTimeout(() => setSettling((s) => { const n = new Set(s); n.delete(k); return n }), 1100)
      setToast({ msg: `Done: ${t.text}`, undo: r ? () => updateNote(r.id, { content: r.before }) : undefined })
    }
  }
  const star = (t: Task) => edit(t, (c) => setStar(c, t.index, !t.starred))
  const moveAllToToday = async (ts: Task[]) => {
    // one write per note, applied in turn so indices stay valid
    const byNote = new Map<string, Task[]>()
    for (const t of ts) byNote.set(t.noteId, [...(byNote.get(t.noteId) ?? []), t])
    for (const [id, items] of byNote) {
      const n = await db.notes.get(id); if (!n) continue
      let c = n.content
      for (const t of items) c = setDue(c, t.index, tk)
      await updateNote(id, { content: c })
    }
    setToast({ msg: `Moved ${ts.length} ${ts.length === 1 ? 'task' : 'tasks'} to today` })
  }

  // ---------- grouping ----------
  type Group = { key: string; title: string; tone?: 'danger' | 'accent'; icon?: React.ReactNode; action?: React.ReactNode; tasks: Task[] }
  const byDue = (a: Task, b: Task) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || Number(b.starred) - Number(a.starred) || b.note.updatedAt - a.note.updatedAt || a.index - b.index
  const groups: Group[] = useMemo(() => {
    if (list === 'today') {
      const overdue = open.filter((t) => t.due && t.due < tk).sort(byDue)
      const today = open.filter((t) => t.due === tk).sort(byDue)
      const starred = open.filter((t) => t.starred && (!t.due || t.due > tk)).sort(byDue)
      return [
        { key: 'overdue', title: 'Overdue', tone: 'danger' as const, icon: <AlertCircle size={15} />, tasks: overdue,
          action: overdue.length > 0 && <button type="button" onClick={() => moveAllToToday(overdue)} className="rounded-full px-2.5 py-1 text-[12.5px] font-medium text-accent hover:bg-wash">Move all to today</button> },
        { key: 'today', title: 'Today', tone: 'accent' as const, icon: <Sun size={15} />, tasks: today },
        { key: 'starred', title: 'Starred', icon: <Star size={15} />, tasks: starred },
      ].filter((g) => g.tasks.length)
    }
    if (list === 'upcoming') {
      const up = open.filter((t) => t.due && t.due > tk).sort(byDue)
      const out = new Map<string, Group>()
      for (const t of up) {
        const d = dateOf(t.due!); const diff = Math.round((+d - +new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY)
        const key = diff < 7 ? t.due! : diff < 14 ? 'next-week' : d.getFullYear() === now.getFullYear() ? `m${d.getMonth()}` : `y${d.getFullYear()}`
        const title = diff === 1 ? 'Tomorrow' : diff < 7 ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
          : key === 'next-week' ? 'Next week' : key.startsWith('m') ? d.toLocaleDateString(undefined, { month: 'long' }) : String(d.getFullYear())
        if (!out.has(key)) out.set(key, { key, title, icon: diff === 1 ? <Sunrise size={15} /> : <CalendarDays size={15} />, tasks: [] })
        out.get(key)!.tasks.push(t)
      }
      return [...out.values()]
    }
    const pool = list === 'anytime' ? open.filter((t) => !t.due) : list === 'done' ? all.filter((t) => t.checked && mine(t)) : open
    const out = new Map<string, Group>()
    const ordered = [...pool].sort((a, b) => b.note.updatedAt - a.note.updatedAt || a.index - b.index)
    for (const t of ordered) {
      if (!out.has(t.noteId)) out.set(t.noteId, { key: t.noteId, title: t.note.title || 'Untitled', icon: t.note.icon ? <span className="text-[14px]">{t.note.icon}</span> : undefined, tasks: [] })
      out.get(t.noteId)!.tasks.push(t)
    }
    return [...out.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, all, owner, settling, tk])

  let shown = 0
  const tabs: { k: List; label: string; n?: number; alert?: boolean }[] = [
    { k: 'today', label: 'Today', n: counts.today, alert: counts.overdue > 0 },
    { k: 'upcoming', label: 'Upcoming', n: counts.upcoming },
    { k: 'anytime', label: 'Anytime', n: counts.anytime },
    { k: 'all', label: 'All', n: counts.all },
    { k: 'done', label: 'Done' },
  ]

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <div className="mb-4">
        <h1 className="font-title text-[30px] font-bold tracking-tight">Tasks</h1>
        <p className="text-[13px] text-muted">
          {counts.overdue > 0 && <span className="text-danger">{counts.overdue} overdue · </span>}
          {counts.today - counts.overdue} due today · {counts.upcoming} coming up · {counts.anytime} anytime
        </p>
      </div>

      <QuickAdd list={list} onAdded={(m) => setToast({ msg: m })} />

      <div className="no-scrollbar -mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Task lists">
        {tabs.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={list === t.k} onClick={() => { setList(t.k); setLimit(80) }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${list === t.k ? 'border-transparent bg-accent text-on-accent' : 'border-line text-ink-2 hover:border-accent/50'}`}>
            {t.label}
            {t.n ? <span className={`min-w-5 rounded-full px-1.5 text-center text-[11.5px] ${list === t.k ? 'bg-black/15' : t.alert ? 'bg-red-500/20 text-danger' : 'bg-wash-2 text-muted'}`}>{t.n}</span> : null}
          </button>
        ))}
      </div>

      {owners.length > 0 && list !== 'done' && (
        <div className="no-scrollbar -mx-3 mb-4 flex items-center gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Filter by person">
          <User size={14} className="shrink-0 text-faint" />
          {[null, ...owners, '—'].map((o) => (
            <button key={o ?? 'all'} type="button" onClick={() => setOwner(o)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] ${owner === o ? 'bg-wash-2 text-ink' : 'text-muted hover:text-ink'}`}>
              {o === null ? 'Everyone' : o === '—' ? 'Unassigned' : o}
            </button>
          ))}
        </div>
      )}

      {groups.map((g) => {
        if (shown >= limit) return null
        const items = g.tasks.slice(0, limit - shown); shown += items.length
        return (
          <section key={g.key} className="mb-5" aria-label={g.title}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${g.tone === 'danger' ? 'text-danger' : g.tone === 'accent' ? 'text-accent' : 'text-ink-2'}`}>
                {g.icon}{(list === 'all' || list === 'anytime' || list === 'done')
                  ? <button type="button" onClick={() => onOpen(g.key)} className="group flex items-center gap-1 hover:text-ink">{g.title}<ChevronRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /></button>
                  : g.title}
              </span>
              <span className="text-[12px] text-faint">{g.tasks.length}</span>
              <span className="ml-auto">{g.action}</span>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-[inset_0_1px_0_var(--color-highlight)]">
              {items.map((t) => (
                <TaskRow key={taskKey(t)} t={t} settling={settling.has(taskKey(t))} showNote={list === 'today' || list === 'upcoming'}
                  onToggle={toggle} onStar={star} onOpenSheet={setSheet} onOpenNote={onOpen} />
              ))}
            </ul>
          </section>
        )
      })}

      {shown >= limit && <button type="button" onClick={() => setLimit((l) => l + 150)} className="mx-auto mb-8 block rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 hover:border-accent/60">Show more</button>}

      {groups.length === 0 && <Empty list={list} hasAny={all.length > 0} />}

      {sheet && <TaskSheet task={sheet} onClose={() => setSheet(null)} onOpenNote={(id) => { setSheet(null); onOpen(id) }}
        onDone={(msg, undo) => { setSheet(null); if (msg) setToast({ msg, undo }) }} />}

      {toast && (
        <div role="status" className="animate-pop fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[65] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-line bg-raised px-4 py-2.5 text-[13.5px] text-ink shadow-2xl md:bottom-8">
          <Check size={15} className="shrink-0 text-accent" /><span className="truncate">{toast.msg}</span>
          {toast.undo && <button type="button" onClick={() => { toast.undo!(); setToast(null) }} className="shrink-0 font-semibold text-accent">Undo</button>}
        </div>
      )}
    </div>
  )
}

function Empty({ list, hasAny }: { list: List; hasAny: boolean }) {
  const text = !hasAny ? ['No tasks yet', 'Add one above, tick boxes in any note, or record a meeting — action items land here.']
    : list === 'today' ? ['All clear for today', 'Nothing due or overdue. Plan ahead in Upcoming, or add something above.']
    : list === 'upcoming' ? ['Nothing scheduled', 'Give a task a date — type “fri” or “next week” when you add it.']
    : list === 'anytime' ? ['Every task has a date', 'Tasks without a date collect here.']
    : list === 'done' ? ['Nothing finished yet', 'Ticked tasks show up here.'] : ['No open tasks', 'Everything is done.']
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-accent"><Check size={28} strokeWidth={2.4} /></div>
      <p className="font-title text-[19px] font-semibold">{text[0]}</p>
      <p className="mt-1 max-w-xs text-[13.5px] leading-5 text-muted">{text[1]}</p>
    </div>
  )
}

/** "Add a task" with live understanding of dates (fri, tomorrow, 10 oct), @people and !! for star. */
function QuickAdd({ list, onAdded }: { list: List; onAdded: (msg: string) => void }) {
  const [v, setV] = useState('')
  const q = parseQuickAdd(v)
  const due = q.due ?? (list === 'today' ? keyOf(new Date()) : null)
  const add = async () => {
    if (!q.text.trim()) return
    const inbox = await inboxNote()
    await addTaskTo(inbox.id, quickAddText({ ...q, due }))
    setV('')
    onAdded(`Added to Inbox${due ? ` · ${friendlyDue(due)}` : ''}`)
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); add() }} className="mb-4 rounded-2xl border border-line bg-surface/70 px-3 py-1.5 transition-colors focus-within:border-accent">
      <div className="flex items-center gap-2">
        <Plus size={18} className="shrink-0 text-accent" />
        <input aria-label="Add a task" value={v} onChange={(e) => setV(e.target.value)} enterKeyHint="done"
          placeholder={list === 'upcoming' ? 'Add a task… e.g. “send quote fri”' : 'Add a task… e.g. “call Ahmed tomorrow !!”'}
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
        {v.trim() && <button type="submit" className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-on-accent">Add</button>}
      </div>
      {v.trim() && (
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5 pl-7 text-[12px]">
          {due && <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] px-2 py-0.5 text-accent"><CalendarDays size={12} />{friendlyDue(due)}</span>}
          {q.owner && <span className="inline-flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-ink-2"><User size={12} />{q.owner}</span>}
          {q.starred && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-star"><Star size={12} />Starred</span>}
          <span className="inline-flex items-center gap-1 text-faint"><Inbox size={12} />Inbox</span>
        </div>
      )}
    </form>
  )
}

const TaskRow = memo(function TaskRow({ t, settling, showNote, onToggle, onStar, onOpenSheet, onOpenNote }: {
  t: Task; settling: boolean; showNote: boolean; onToggle: (t: Task) => void; onStar: (t: Task) => void; onOpenSheet: (t: Task) => void; onOpenNote: (id: string) => void
}) {
  const checked = t.checked || settling
  const state = dueState(t.due)
  // swipe (touch): right = done, left = schedule
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; locked: null | 'x' | 'y' } | null>(null)
  const onDown = (e: React.PointerEvent) => { if (e.pointerType !== 'touch') return; start.current = { x: e.clientX, y: e.clientY, locked: null } }
  const onMove = (e: React.PointerEvent) => {
    const s = start.current; if (!s) return
    const x = e.clientX - s.x, y = e.clientY - s.y
    if (!s.locked) { if (Math.abs(x) > 10 && Math.abs(x) > Math.abs(y) * 1.4) s.locked = 'x'; else if (Math.abs(y) > 10) s.locked = 'y' }
    if (s.locked === 'x') setDx(Math.max(-140, Math.min(140, x)))
  }
  const onUp = () => {
    const s = start.current; start.current = null
    if (s?.locked === 'x') { if (dx > 90) onToggle(t); else if (dx < -90) onOpenSheet(t) }
    setDx(0)
  }
  const swiped = start.current?.locked === 'x'
  return (
    <li className={`relative border-b border-line last:border-b-0`}>
      {dx !== 0 && (
        <div aria-hidden className={`absolute inset-0 flex items-center px-5 text-[13px] font-semibold ${dx > 0 ? 'justify-start bg-emerald-600/80 text-white' : 'justify-end bg-[color-mix(in_srgb,var(--color-accent)_70%,black)] text-white'}`}>
          {dx > 0 ? <span className="flex items-center gap-2"><Check size={18} /> {t.checked ? 'Not done' : 'Done'}</span> : <span className="flex items-center gap-2">Schedule <CalendarDays size={18} /></span>}
        </div>
      )}
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: swiped ? 'none' : 'transform .2s ease' }}
        className="relative flex touch-pan-y items-start gap-3 bg-card px-3.5 py-3 coarse:py-3.5">
        <button type="button" role="checkbox" aria-checked={checked} aria-label={checked ? `Mark “${t.text}” not done` : `Complete “${t.text}”`} onClick={() => onToggle(t)}
          className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${checked ? 'tick border-accent bg-accent text-on-accent' : state === 'overdue' ? 'border-red-300/80 hover:bg-red-400/10' : 'border-muted/70 hover:border-accent'}`}>
          {checked && <Check size={13} strokeWidth={3.2} />}
        </button>
        <button type="button" onClick={() => onOpenSheet(t)} className="min-w-0 flex-1 text-left">
          <span className={`strike block text-[15px] leading-[21px] [overflow-wrap:anywhere] ${checked ? 'on text-muted' : 'text-ink'}`}>{t.text}</span>
          {(t.due || t.owner || showNote) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              {t.due && !(t.dueFromDaily && state === 'today') && (
                <span className={`inline-flex items-center gap-1 ${state === 'overdue' ? 'text-danger' : state === 'today' ? 'text-accent' : state === 'soon' ? 'text-ink-2' : 'text-muted'}`}>
                  <CalendarDays size={12} />{friendlyDue(t.due)}
                </span>
              )}
              {t.owner && (
                <span className="inline-flex items-center gap-1 text-ink-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] font-bold text-black/80" style={{ background: `hsl(${ownerHue(t.owner)} 60% 72%)` }}>{t.owner[0].toUpperCase()}</span>{t.owner}
                </span>
              )}
              {showNote && (
                <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); onOpenNote(t.noteId) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenNote(t.noteId) } }}
                  className="inline-flex max-w-[60%] items-center gap-0.5 truncate text-faint hover:text-accent">
                  {t.note.icon ?? (t.note.daily ? <Sun size={11} /> : null)}<span className="truncate">{t.note.title || 'Untitled'}</span><ArrowUpRight size={11} className="shrink-0" />
                </span>
              )}
            </span>
          )}
        </button>
        <button type="button" aria-label={t.starred ? 'Unstar' : 'Star'} aria-pressed={t.starred} onClick={() => onStar(t)}
          className={`-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:bg-wash ${t.starred ? 'text-star' : 'text-faint opacity-0 focus:opacity-100 coarse:opacity-60 [li:hover_&]:opacity-100'}`}>
          <Star size={16} className={t.starred ? 'fill-current' : ''} />
        </button>
      </div>
    </li>
  )
})
