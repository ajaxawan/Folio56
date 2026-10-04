import { ArrowUpRight, CalendarDays, CalendarX, Check, Star, Sun, Sunrise, Trash2, User } from 'lucide-react'
import { useState } from 'react'
import { db, updateNote } from '../lib/db'
import { friendlyDue, keyOf, removeTask, setChecked, setDue, setStar, setText, type Task } from '../lib/tasks'
import { Sheet } from './ui'

const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return keyOf(d) }
const nextWeekday = (wd: number) => { const d = new Date(); const diff = ((wd - d.getDay() + 7) % 7) || 7; d.setDate(d.getDate() + diff); return keyOf(d) }

/** Details for one task: words, date, person, star, done, delete — and a way back to its note. */
export function TaskSheet({ task, onClose, onOpenNote, onDone }: {
  task: Task; onClose: () => void; onOpenNote: (id: string) => void; onDone: (msg?: string, undo?: () => void) => void
}) {
  const [text, setTextV] = useState(task.text)
  const [due, setDueV] = useState<string | null>(task.dueFromDaily ? null : task.due)
  const [owner, setOwner] = useState(task.owner ?? '')
  const [starred, setStarred] = useState(task.starred)

  const save = async (extra?: { checked?: boolean; remove?: boolean }) => {
    const n = await db.notes.get(task.noteId); if (!n) return onDone()
    const before = n.content
    const wordsChanged = text.trim() !== task.text || (owner.trim() || null) !== task.owner
    const dueChanged = due !== (task.dueFromDaily ? null : task.due)
    if (!extra && !wordsChanged && !dueChanged && starred === task.starred) return onDone()
    let c = n.content
    if (extra?.remove) c = removeTask(c, task.index)
    else if (wordsChanged) c = setText(c, task.index, text.trim() || task.text, { due, starred, explicitDue: !!due, owner: owner.trim() || null })
    else {
      // only the markers changed: keep the item's own formatting
      if (dueChanged) c = setDue(c, task.index, due)
      if (starred !== task.starred) c = setStar(c, task.index, starred)
    }
    if (extra?.checked !== undefined) c = setChecked(c, task.index, extra.checked)
    await updateNote(n.id, { content: c })
    const undo = () => { void updateNote(n.id, { content: before }) }
    onDone(extra?.remove ? 'Task deleted' : extra?.checked ? 'Done' : undefined, extra?.remove || extra?.checked ? undo : undefined)
  }

  const chips: [string, string | null, React.ReactNode][] = [
    ['Today', plus(0), <Sun size={14} key="t" />],
    ['Tomorrow', plus(1), <Sunrise size={14} key="m" />],
    ['This weekend', new Date().getDay() === 6 ? plus(0) : nextWeekday(6), <CalendarDays size={14} key="w" />],
    ['Next week', nextWeekday(1), <CalendarDays size={14} key="n" />],
    ['No date', null, <CalendarX size={14} key="x" />],
  ]
  return (
    <Sheet label="Task" onClose={() => save().then(onClose)}>
      <div className="mb-3 flex items-start gap-3">
        <button type="button" aria-label="Complete" onClick={() => save({ checked: !task.checked })}
          className={`mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${task.checked ? 'border-accent bg-accent text-on-accent' : 'border-muted hover:border-accent'}`}>{task.checked && <Check size={14} strokeWidth={3} />}</button>
        <textarea aria-label="Task" value={text} onChange={(e) => setTextV(e.target.value)} rows={Math.min(5, Math.max(1, Math.ceil(text.length / 34)))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save().then(onClose) } }}
          className="min-w-0 flex-1 resize-none bg-transparent text-[18px] font-medium leading-7 outline-none" />
        <button type="button" aria-label={starred ? 'Unstar' : 'Star'} aria-pressed={starred} onClick={() => setStarred(!starred)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-wash ${starred ? 'text-star' : 'text-muted'}`}><Star size={19} className={starred ? 'fill-current' : ''} /></button>
      </div>

      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[.08em] text-faint">When</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {chips.map(([label, k, icon]) => (
          <button key={label} type="button" onClick={() => setDueV(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${due === k ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-ink-2 hover:border-accent/50'}`}>{icon}{label}</button>
        ))}
        <label className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${due && !chips.some(([, k]) => k === due) ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-ink-2'}`}>
          <CalendarDays size={14} />{due && !chips.some(([, k]) => k === due) ? friendlyDue(due) : 'Pick a date'}
          <input type="date" aria-label="Pick a date" value={due ?? ''} onChange={(e) => setDueV(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
      {due && <p className="mb-3 text-[12.5px] text-muted">Due {friendlyDue(due)}{due < keyOf(new Date()) ? ' — overdue' : ''}</p>}
      {!due && task.dueFromDaily && <p className="mb-3 text-[12.5px] text-muted">From the daily note for {friendlyDue(task.due!)}.</p>}

      <label className="mb-4 flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-accent">
        <User size={15} className="text-muted" />
        <input aria-label="Who" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who’s doing it? (optional)" className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
      </label>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onOpenNote(task.noteId)} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-wash px-3 py-2.5 text-left text-[13.5px] hover:bg-wash-2">
          <span className="text-muted">In</span><span className="truncate font-medium">{task.note.icon ? `${task.note.icon} ` : ''}{task.note.title || 'Untitled'}</span><ArrowUpRight size={14} className="ml-auto shrink-0 text-muted" />
        </button>
        <button type="button" aria-label="Delete task" onClick={() => save({ remove: true })} className="flex h-11 w-11 items-center justify-center rounded-xl text-danger hover:bg-red-500/10"><Trash2 size={18} /></button>
        <button type="button" onClick={() => save().then(onClose)} className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent">Save</button>
      </div>
    </Sheet>
  )
}
