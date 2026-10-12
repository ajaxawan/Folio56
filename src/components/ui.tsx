import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { lastPointer, recentTap, spring, still, tScale } from '../lib/motion'
import { createPortal } from 'react-dom'
import { isPhone } from '../lib/mobile'

export function IconButton({ label, onClick, children, active, className = '', size = 'md', disabled }: {
  label: string; onClick?: (e: React.MouseEvent) => void; children: ReactNode; active?: boolean; className?: string; size?: 'sm' | 'md' | 'lg'; disabled?: boolean
}) {
  const s = size === 'sm' ? 'h-9 w-9 coarse:h-11 coarse:w-11' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10 coarse:h-11 coarse:w-11'
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={`${s} inline-flex shrink-0 items-center justify-center rounded-full text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-wash hover:text-ink active:scale-[.93] disabled:opacity-40 ${active ? 'bg-wash text-ink' : ''} ${className}`}>
      {children}
    </button>
  )
}

/** Small anchored popover that closes on outside click / Escape. */
export function Popover({ open, onClose, children, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    document.addEventListener('keydown', onKey, true)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [open, onClose])
  // Keep the popover inside the visible area: nudge it sideways if it would be clipped by the
  // scrolling panel it lives in (e.g. a card in the left-most column) or by the screen edge.
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    if (!open) { setShift(0); return }
    const el = ref.current; if (!el) return
    let box = { left: 0, right: window.innerWidth }
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p)
      if (/(auto|scroll|hidden)/.test(o.overflowX + o.overflowY)) { const r = p.getBoundingClientRect(); box = { left: Math.max(0, r.left), right: Math.min(window.innerWidth, r.right) }; break }
    }
    const r = el.getBoundingClientRect()
    const pad = 8
    // V6.4: menus unfold from the button that opened them
    if (recentTap()) el.style.setProperty('--origin', `${Math.min(Math.max(lastPointer.x - r.left, 0), r.width)}px ${Math.min(Math.max(lastPointer.y - r.top, 0), r.height)}px`)
    setShift(r.left < box.left + pad ? box.left + pad - r.left : r.right > box.right - pad ? box.right - pad - r.right : 0)
  }, [open])
  const phone = isPhone()
  const d = useDismiss(onClose, phone)
  if (!open) return null
  // Phones: menus become a bottom sheet (thumb-reachable, never clipped, above the keyboard).
  if (phone) {
    return createPortal(
      <div className={`${d.leaving ? 'animate-fade-out' : 'animate-fade'} fixed inset-0 z-[80] bg-scrim`} onClick={(e) => e.stopPropagation()}>
        <div ref={(el) => { ref.current = el; d.panel.current = el }} data-popover onClick={(e) => e.stopPropagation()} {...d.dragProps} onPointerDown={(e) => { e.stopPropagation(); d.dragProps.onPointerDown?.(e) }}
          className={`${d.leaving ? 'animate-sheet-out' : 'animate-sheet'} sheet fixed inset-x-0 bottom-[var(--kb,0px)] max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-pop px-3 pt-2 text-ink shadow-2xl`}>
          <div className="sheet-grip" />
          {children}
        </div>
      </div>, document.body)
  }
  return (
    <div ref={ref} data-popover onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={shift ? { translate: `${shift}px 0` } : undefined}
      className={`animate-pop absolute z-50 rounded-xl border border-line bg-pop p-1.5 text-ink shadow-2xl shadow-black/40 ${className}`}>
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, danger, icon, hint }: { children: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode; hint?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-wash coarse:py-3 coarse:text-[15px] ${danger ? 'text-red-500 dark:text-danger' : 'text-ink'}`}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </button>
  )
}

export function Modal({ title, onClose, children, width = 'max-w-md' }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: string }) {
  const titleId = useId()
  const phone = isPhone()
  const d = useDismiss(onClose, phone)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') d.close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [d])
  return (
    <div className={`${d.leaving ? 'animate-fade-out' : 'animate-fade'} fixed inset-0 z-[60] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-3'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) d.close() }}>
      <div ref={d.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} {...d.dragProps}
        className={`w-full ${width} overflow-y-auto overscroll-contain border-line bg-pop text-ink shadow-2xl ${phone ? `${d.leaving ? 'animate-sheet-out' : 'animate-sheet'} sheet mb-[var(--kb,0px)] max-h-[92dvh] rounded-t-3xl border-t px-4 pt-2` : `${d.leaving ? 'animate-leave' : 'animate-grow'} max-h-[90vh] rounded-2xl border p-5`}`}>
        {phone && <div className="sheet-grip" />}
        <div className={`flex items-center justify-between ${phone ? 'sheet-drag sticky -top-2 z-10 -mx-4 mb-3 bg-pop px-4 py-1' : 'mb-4'}`}>
          <h2 id={titleId} className="text-[17px] font-semibold">{title}</h2>
          <IconButton size="sm" label="Close" onClick={d.close}><X size={18} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * V6.4: dialogs and sheets leave as gently as they arrive, grow out of what you tapped (bigger
 * screens), and on phones follow your finger down — let go far or fast enough and they close.
 */
export function useDismiss(onClose: () => void, phone: boolean) {
  const [leaving, setLeaving] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const done = useRef(onClose)
  useEffect(() => { done.current = onClose })
  const close = useCallback(() => {
    if (still()) { done.current(); return }
    setLeaving((was) => { if (!was) window.setTimeout(() => done.current(), (phone ? 200 : 130) * tScale()); return true })
  }, [phone])
  // grow from the tap (only when the tap was recent and outside the panel)
  useLayoutEffect(() => {
    const el = panel.current; if (!el || phone || !recentTap()) return
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max(lastPointer.x - r.left, 0), r.width), y = Math.min(Math.max(lastPointer.y - r.top, 0), r.height)
    el.style.setProperty('--origin', `${x}px ${y}px`)
  }, [phone])
  const drag = useRef<{ y0: number; y: number; t: number; v: number; dy: number; id: number; on: boolean } | null>(null)
  const dragProps = phone ? {
    onPointerDown: (e: React.PointerEvent) => {
      const el = panel.current; if (!el || e.button !== 0) return
      const top = e.clientY - el.getBoundingClientRect().top
      if (top > 64 || el.scrollTop > 2) return // the grip and header only, or a sheet scrolled to the top
      drag.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, dy: 0, id: e.pointerId, on: false }
      window.getSelection()?.removeAllRanges() // a selected word would turn the pull into a text drag
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = drag.current, el = panel.current; if (!g || !el || e.pointerId !== g.id) return
      const now = performance.now()
      g.v = (e.clientY - g.y) / Math.max(1, now - g.t); g.y = e.clientY; g.t = now
      g.dy = Math.max(0, e.clientY - g.y0)
      if (!g.on && g.dy > 6) { g.on = true; el.setPointerCapture?.(e.pointerId) }
      if (g.on) { el.style.transform = `translateY(${g.dy}px)`; el.style.transition = 'none' }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const g = drag.current, el = panel.current; drag.current = null; if (!g || !el || !g.on) return
      el.releasePointerCapture?.(e.pointerId)
      if (g.dy > 120 || g.v > 0.6) {
        const a = el.animate([{ transform: `translateY(${g.dy}px)` }, { transform: 'translateY(100%)' }], { duration: Math.max(120, 220 - g.v * 60) * tScale(), easing: 'cubic-bezier(.3,0,.8,.4)', fill: 'forwards' })
        a.finished.then(() => done.current()).catch(() => done.current())
      } else {
        el.animate([{ transform: `translateY(${g.dy}px)` }, { transform: 'none' }], { duration: 320 * tScale(), easing: spring() })
        el.style.transform = ''
      }
      el.style.transition = ''
    },
    onPointerCancel: () => { const el = panel.current; drag.current = null; if (el) { el.style.transform = ''; el.style.transition = '' } },
  } : {}
  return useMemo(() => ({ leaving, close, panel, dragProps }), [leaving, close, dragProps]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const at = options.findIndex((o) => o.value === value)
  return (
    <div className="relative flex rounded-lg bg-wash p-0.5">
      {/* V6.4: the chosen pill glides to its new place */}
      {at >= 0 && <span aria-hidden className="seg-thumb pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-card shadow-sm" style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${at * 100}%)` }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`relative z-[1] min-w-0 flex-1 basis-0 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${value === o.value ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[14px]">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-wash-2'}`}>
        <span className="switch-knob absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" style={{ transform: checked ? 'translateX(16px)' : 'none' }} />
      </button>
    </label>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  )
}

/** Bottom sheet (phones) / centred card (bigger screens), rendered on top of everything. */
export function Sheet({ onClose, children, label, className = '' }: { onClose: () => void; children: ReactNode; label: string; className?: string }) {
  const phone = isPhone()
  const d = useDismiss(onClose, phone)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') d.close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [d])
  return createPortal(
    <div className={`${d.leaving ? 'animate-fade-out' : 'animate-fade'} fixed inset-0 z-[70] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-4'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) d.close() }}>
      <div ref={d.panel} role="dialog" aria-modal="true" aria-label={label} {...d.dragProps}
        className={`w-full max-w-md border-line bg-pop text-ink shadow-2xl ${phone ? `${d.leaving ? 'animate-sheet-out' : 'animate-sheet'} sheet rounded-t-3xl border-t px-4 pt-2` : `${d.leaving ? 'animate-leave' : 'animate-grow'} rounded-2xl border p-5`} ${className}`}>
        {phone && <div className="sheet-grip" />}
        {children}
      </div>
    </div>, document.body)
}

/** V6.4: "done" — a circle settles in and the tick draws itself. */
export function DoneMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <div aria-hidden className={`done-mark flex shrink-0 items-center justify-center rounded-full bg-accent text-on-accent ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.52} height={size * 0.52} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
    </div>
  )
}
