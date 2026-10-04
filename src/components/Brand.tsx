/** Folio wordmark: an ink drop in the accent colour + italic serif "folio". The drop draws itself in on load. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex select-none items-center gap-1.5" aria-label="Folio">
      <InkDrop size={size * 0.9} />
      <span className="font-display italic tracking-tight text-ink" style={{ fontSize: size * 1.08, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>folio</span>
    </span>
  )
}

export function InkDrop({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0 overflow-visible">
      <path className="ink-draw" d="M12 2.5c0 0-6.5 7.4-6.5 12.1a6.5 6.5 0 0 0 13 0C18.5 9.9 12 2.5 12 2.5Z"
        fill="color-mix(in srgb, var(--color-accent) 22%, transparent)" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.2 15.2a3 3 0 0 0 2.6 2.7" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
    </svg>
  )
}
