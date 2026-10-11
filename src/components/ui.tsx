import { X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
    setShift(r.left < box.left + pad ? box.left + pad - r.left : r.right > box.right - pad ? box.right - pad - r.right : 0)
  }, [open])
  if (!open) return null
  // Phones: menus become a bottom sheet (thumb-reachable, never clipped, above the keyboard).
  if (isPhone()) {
    return createPortal(
      <div className="animate-fade fixed inset-0 z-[80] bg-scrim" onClick={(e) => e.stopPropagation()}>
        <div ref={ref} data-popover onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
          className="animate-sheet sheet fixed inset-x-0 bottom-[var(--kb,0px)] max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-pop px-3 pt-2 text-ink shadow-2xl">
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const phone = isPhone()
  return (
    <div className={`animate-fade fixed inset-0 z-[60] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-3'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`w-full ${width} overflow-y-auto overscroll-contain border-line bg-pop text-ink shadow-2xl ${phone ? 'animate-sheet sheet mb-[var(--kb,0px)] max-h-[92dvh] rounded-t-3xl border-t px-4 pt-2' : 'animate-pop max-h-[90vh] rounded-2xl border p-5'}`}>
        {phone && <div className="sheet-grip" />}
        <div className={`flex items-center justify-between ${phone ? 'sticky -top-2 z-10 -mx-4 mb-3 bg-pop px-4 py-1' : 'mb-4'}`}>
          <h2 id={titleId} className="text-[17px] font-semibold">{title}</h2>
          <IconButton size="sm" label="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-wash p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
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
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const phone = isPhone()
  return createPortal(
    <div className={`animate-fade fixed inset-0 z-[70] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-4'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={label}
        className={`w-full max-w-md border-line bg-pop text-ink shadow-2xl ${phone ? 'animate-sheet sheet rounded-t-3xl border-t px-4 pt-2' : 'animate-pop rounded-2xl border p-5'} ${className}`}>
        {phone && <div className="sheet-grip" />}
        {children}
      </div>
    </div>, document.body)
}
