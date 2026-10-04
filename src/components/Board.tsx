import { DndContext, DragOverlay, PointerSensor, TouchSensor, type PointerSensorOptions, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { moveBefore } from '../lib/db'
import { usePrefs } from '../lib/prefs'
import type { Label, Note } from '../types'
import { NoteCard } from './NoteCard'

// Mouse/pen drag starts after a small move; on touch, dragging needs a long-press (TouchSensor),
// so a quick sideways swipe on a card can pin/archive instead of picking it up.
class MouseSensor extends PointerSensor {
  static activators = [{ eventName: 'onPointerDown' as const, handler: ({ nativeEvent: e }: { nativeEvent: PointerEvent }, _o: PointerSensorOptions) => e.isPrimary && e.button === 0 && e.pointerType !== 'touch' }]
}

interface Props {
  groups: { key: string; title?: string; notes: Note[]; pinned?: boolean }[]
  labels: Label[]
  childCount: Map<string, number>
  selected: Set<string>
  onOpen: (id: string) => void
  onSelect: (id: string) => void
  canDrag: boolean
  /** representative note id → the series it stands for (collapsed stacks) */
  stacks?: Map<string, Note[]>
  onStack?: (series: string) => void
  /** series currently fanned out */
  fanned?: Set<string>
}

/** Keep-style board: measured masonry (row-first order), drag to reorder, long-press to select on touch. */
export function Board({ groups, labels, childCount, selected, onOpen, onSelect, canDrag, stacks, onStack, fanned }: Props) {
  const [active, setActive] = useState<Note | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  )
  const all = useMemo(() => groups.flatMap((g) => g.notes), [groups])
  const selecting = selected.size > 0

  const onStart = (e: DragStartEvent) => {
    setActive(all.find((n) => n.id === e.active.id) ?? null)
    navigator.vibrate?.(15)
  }
  const onEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id)
    const moved = Math.hypot(e.delta.x, e.delta.y)
    setActive(null); setOverId(null)
    const isTouch = (e.activatorEvent as PointerEvent | TouchEvent)?.type?.startsWith('touch')
    if (moved < 10) { if (isTouch) onSelect(id); return } // long-press without moving = select
    if (!e.over || e.over.id === id || !canDrag) return
    const target = String(e.over.id)
    const g = groups.find((gr) => gr.notes.some((n) => n.id === target))
    if (g) await moveBefore(g.notes, id, target, g.pinned)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)} onDragCancel={() => { setActive(null); setOverId(null) }}>
      {groups.map((g) => g.notes.length > 0 && (
        <section key={g.key} className="mb-6">
          {g.title && <h2 className="flex items-center gap-2 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-accent/90"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{g.title}</h2>}
          <Masonry notes={g.notes} render={(n, idx) => (
            <Cell key={n.id} id={n.id} delay={idx} disabled={!canDrag && !('ontouchstart' in window)} isOver={overId === n.id && active?.id !== n.id}>
              <NoteCard note={n} labels={labels} childCount={childCount.get(n.id) ?? 0} selected={selected.has(n.id)} selecting={selecting}
                onOpen={onOpen} onSelect={onSelect} dragging={active?.id === n.id} stack={stacks?.get(n.id)} onStack={stacks?.has(n.id) || (n.series && fanned?.has(n.series)) ? onStack : undefined} />
            </Cell>
          )} />
        </section>
      ))}
      <DragOverlay dropAnimation={{ duration: 260, easing: 'cubic-bezier(.2,1.25,.35,1)' }}>
        {active && (
          <div className="rotate-[1.5deg] scale-[1.02] cursor-grabbing shadow-2xl">
            <NoteCard note={active} labels={labels} childCount={childCount.get(active.id) ?? 0} selected={false} selecting={false} onOpen={noop} onSelect={noop} stack={stacks?.get(active.id)} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

const noop = () => {}

function Cell({ id, children, disabled, isOver, delay = 0 }: { id: string; children: React.ReactNode; disabled: boolean; isOver: boolean; delay?: number }) {
  const drag = useDraggable({ id, disabled })
  const drop = useDroppable({ id })
  // dnd-kit marks the wrapper as a disabled button when dragging is off (trash, search), which made
  // screen readers — and automation — treat the whole card and its buttons as disabled.
  const { role: _role, 'aria-disabled': _dis, 'aria-pressed': _pressed, ...attrs } = drag.attributes
  void _role; void _dis; void _pressed
  return (
    <div ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el) }} {...attrs} {...drag.listeners} tabIndex={-1} role="group" aria-roledescription="draggable note"
      style={delay >= 0 ? { animationDelay: `${Math.min(delay, 24) * 28}ms` } : undefined}
      className={`${delay >= 0 ? 'animate-rise' : ''} relative touch-manipulation outline-none ${isOver ? 'before:absolute before:-left-2 before:bottom-0 before:top-0 before:w-1 before:rounded-full before:bg-accent' : ''}`}>
      {children}
    </div>
  )
}

/** Rough height guess for a card that hasn't been measured yet (keeps scrolling steady). */
function estimate(n: Note, compact: boolean) {
  const line = compact ? 20 : 22
  let h = compact ? 26 : 34
  if (n.title) h += Math.ceil(n.title.length / 26) * (compact ? 20 : 24) + 6
  if (n.cover && !n.image) h += compact ? 40 : 64
  if (n.image && !n.locked) h += 170
  const lines = n.preview ? n.preview.split('\n').length : 0
  h += Math.min(lines, compact ? 6 : 9) * line
  h += Math.min(n.checklist.length, compact ? 4 : 6) * (line + 6)
  if (n.labels.length) h += 34
  if (n.locked) h += 30
  return h
}

/** Above this many cards, only the ones near the screen are drawn. */
const VIRTUAL_FROM = 120

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

function Masonry({ notes, render }: { notes: Note[]; render: (n: Note, idx: number) => React.ReactNode }) {
  const { prefs } = usePrefs()
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const heights = useRef(new Map<string, number>())
  const [tick, bump] = useState(0)
  const list = prefs.layout === 'list'
  const compact = prefs.density === 'compact'
  // Phones get two columns like Keep: narrow cards, tighter gaps.
  const narrow = width > 0 && width < 600
  const gap = narrow ? 10 : compact ? 10 : 16
  const colW = narrow ? 150 : compact ? 200 : 240
  const virtual = notes.length > VIRTUAL_FROM

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Many cards report their size at once: apply them in one re-layout per frame, not one per card.
  const queued = useRef(false)
  const report = useCallback((id: string, h: number) => {
    if (Math.abs((heights.current.get(id) ?? -99) - h) <= 2) return
    heights.current.set(id, h)
    if (!queued.current) { queued.current = true; requestAnimationFrame(() => { queued.current = false; bump((x) => x + 1) }) }
  }, [])

  const cols = list ? 1 : Math.max(1, Math.floor((width + gap) / (colW + gap)))
  const layout = useMemo(() => {
    const columns: { note: Note; top: number; h: number; idx: number }[][] = Array.from({ length: cols }, () => [])
    const colH = new Array(cols).fill(0)
    notes.forEach((n, idx) => {
      let c = 0
      for (let i = 1; i < cols; i++) if (colH[i] < colH[c] - 1) c = i
      const h = heights.current.get(n.id) ?? estimate(n, compact)
      columns[c].push({ note: n, top: colH[c], h, idx })
      colH[c] += h + gap
    })
    return { columns, height: Math.max(0, ...colH) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, cols, gap, tick, compact])

  // Visible window (in this board's own coordinates), updated on scroll in coarse steps.
  const [win, setWin] = useState({ from: 0, to: 2400 })
  useEffect(() => {
    if (!virtual) return
    const el = ref.current; const sp = scrollParent(el); if (!el || !sp) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = sp.getBoundingClientRect().top - el.getBoundingClientRect().top
      const from = Math.floor((top - 900) / 300) * 300, to = Math.ceil((top + sp.clientHeight + 1200) / 300) * 300
      setWin((w) => (w.from === from && w.to === to ? w : { from, to }))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    sp.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll)
    return () => { sp.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [virtual, layout.height])

  if (virtual) {
    const cw = cols > 0 && width ? (width - gap * (cols - 1)) / cols : 0
    return (
      <div ref={ref} className={list ? 'mx-auto max-w-2xl' : ''}>
        <div className="relative" style={{ height: layout.height }}>
          {layout.columns.map((col, ci) => col.filter((it) => it.top < win.to && it.top + it.h > win.from).map((it) => (
            <div key={it.note.id} className="absolute" style={{ top: it.top, left: list ? 0 : ci * (cw + gap), width: list ? '100%' : cw }}>
              <Measure id={it.note.id} onSize={report}>{render(it.note, -1)}</Measure>
            </div>
          )))}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={list ? 'mx-auto max-w-2xl' : ''}>
      <div className="flex items-start" style={{ gap }}>
        {layout.columns.map((col, ci) => (
          <Column key={ci} gap={gap}>
            {col.map((it) => <Measure key={it.note.id} id={it.note.id} onSize={report}>{render(it.note, it.idx)}</Measure>)}
          </Column>
        ))}
      </div>
    </div>
  )
}

function Measure({ id, onSize, children }: { id: string; onSize: (id: string, h: number) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => onSize(id, el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onSize])
  return <div ref={ref}>{children}</div>
}

function Column({ gap, children }: { gap: number; children: React.ReactNode }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [ref] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', disrespectUserMotionPreference: false })
  return <div ref={reduce ? undefined : ref} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>{children}</div>
}
