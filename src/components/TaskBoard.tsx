import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ArrowUpRight, CalendarDays, Check, Circle, CircleDot } from 'lucide-react'
import { useState } from 'react'
import { dueState, friendlyDue, taskKey, type Task } from '../lib/tasks'

export type Column = 'todo' | 'doing' | 'done'
const COLS: { k: Column; label: string; icon: React.ReactNode; hint: string }[] = [
  { k: 'todo', label: 'To do', icon: <Circle size={14} />, hint: 'Nothing here — add a task above.' },
  { k: 'doing', label: 'Doing', icon: <CircleDot size={14} />, hint: 'Drag a task here when you start it.' },
  { k: 'done', label: 'Done', icon: <Check size={14} />, hint: 'Finished tasks land here.' },
]
export const columnOf = (t: Task): Column => (t.checked ? 'done' : t.doing ? 'doing' : 'todo')

/** To do / Doing / Done. Drag a card between columns (long-press on touch), or use its menu. */
export function TaskBoard({ tasks, onMove, onOpenSheet, onOpenNote }: {
  tasks: Task[]; onMove: (t: Task, to: Column) => void; onOpenSheet: (t: Task) => void; onOpenNote: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }))
  const [active, setActive] = useState<Task | null>(null)
  const byKey = new Map(tasks.map((t) => [taskKey(t), t]))
  const end = (e: DragEndEvent) => {
    setActive(null)
    const t = byKey.get(String(e.active.id)); const to = e.over?.id as Column | undefined
    if (t && to && to !== columnOf(t)) onMove(t, to)
  }
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(byKey.get(String(e.active.id)) ?? null)} onDragEnd={end} onDragCancel={() => setActive(null)}>
      <div className="no-scrollbar -mx-3 grid snap-x snap-mandatory auto-cols-[min(84vw,300px)] grid-flow-col gap-3 overflow-x-auto px-3 pb-4 sm:mx-0 sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {COLS.map((c) => {
          const items = tasks.filter((t) => columnOf(t) === c.k)
          return <Lane key={c.k} col={c} items={c.k === 'done' ? items.slice(0, 40) : items} total={items.length} activeKey={active ? taskKey(active) : null} onOpenSheet={onOpenSheet} onOpenNote={onOpenNote} onMove={onMove} />
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(.2,1,.3,1)' }}>
        {active && <div className="rotate-[1.5deg] cursor-grabbing"><CardBody t={active} lifted /></div>}
      </DragOverlay>
    </DndContext>
  )
}

function Lane({ col, items, total, activeKey, onOpenSheet, onOpenNote, onMove }: {
  col: (typeof COLS)[number]; items: Task[]; total: number; activeKey: string | null; onOpenSheet: (t: Task) => void; onOpenNote: (id: string) => void; onMove: (t: Task, to: Column) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.k })
  return (
    <section ref={setNodeRef} aria-label={col.label} className={`flex min-h-[220px] snap-start flex-col rounded-2xl border p-2 transition-colors ${isOver ? 'border-accent/60 bg-[color-mix(in_srgb,var(--color-accent)_7%,var(--color-card))]' : 'border-line bg-card/60'}`}>
      <div className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-[13px] font-semibold text-ink-2">
        <span className={col.k === 'done' ? 'text-success' : col.k === 'doing' ? 'text-accent' : 'text-muted'}>{col.icon}</span>{col.label}
        <span className="text-[12px] font-normal text-faint">{total}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((t) => <Card key={taskKey(t)} t={t} hidden={activeKey === taskKey(t)} onOpenSheet={onOpenSheet} onOpenNote={onOpenNote} onMove={onMove} />)}
      </ul>
      {items.length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-faint">{col.hint}</p>}
    </section>
  )
}

function Card({ t, hidden, onOpenSheet, onOpenNote, onMove }: { t: Task; hidden: boolean; onOpenSheet: (t: Task) => void; onOpenNote: (id: string) => void; onMove: (t: Task, to: Column) => void }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: taskKey(t) })
  const col = columnOf(t)
  const next: Column = col === 'todo' ? 'doing' : col === 'doing' ? 'done' : 'todo'
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} role="group" aria-roledescription="draggable task" className={`touch-manipulation ${hidden ? 'opacity-30' : ''}`}>
      <CardBody t={t} onOpen={() => onOpenSheet(t)} onNote={() => onOpenNote(t.noteId)}
        action={<button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onMove(t, next)} title={next === 'doing' ? 'Start' : next === 'done' ? 'Done' : 'Back to To do'}
          className="rounded-full px-2 py-0.5 text-[11.5px] text-muted hover:bg-wash hover:text-ink">{next === 'doing' ? 'Start →' : next === 'done' ? 'Done ✓' : 'Reopen'}</button>} />
    </li>
  )
}

function CardBody({ t, onOpen, onNote, action, lifted }: { t: Task; onOpen?: () => void; onNote?: () => void; action?: React.ReactNode; lifted?: boolean }) {
  const state = dueState(t.due)
  return (
    <div className={`rounded-xl border border-line bg-raised px-3 py-2.5 ${lifted ? 'shadow-2xl shadow-black/40' : 'shadow-sm'}`}>
      <button type="button" onClick={onOpen} className={`block w-full text-left text-[14px] leading-[19px] [overflow-wrap:anywhere] ${t.checked ? 'text-muted line-through' : 'text-ink'}`}>{t.starred && <span className="text-star">★ </span>}{t.text}</button>
      <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
        {t.due && !t.checked && <span className={`inline-flex items-center gap-1 ${state === 'overdue' ? 'text-danger' : state === 'today' ? 'text-accent' : 'text-muted'}`}><CalendarDays size={11} />{friendlyDue(t.due)}</span>}
        {t.owner && <span className="truncate text-ink-2">{t.owner}</span>}
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onNote} className="inline-flex min-w-0 items-center gap-0.5 truncate text-faint hover:text-accent">
          <span className="truncate">{t.note.title || 'Untitled'}</span><ArrowUpRight size={10} className="shrink-0" />
        </button>
        <span className="ml-auto shrink-0">{action}</span>
      </div>
    </div>
  )
}
