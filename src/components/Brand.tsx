/** Folio56 wordmark: italic serif "folio" with a small raised "56" in the accent colour, like an edition number. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex select-none items-start" role="img" aria-label="Folio56" style={{ lineHeight: 1 }}>
      <span aria-hidden className="font-display italic tracking-tight text-ink" style={{ fontSize: size * 1.12, fontWeight: 500, letterSpacing: '-0.02em' }}>folio</span>
      <span aria-hidden className="font-display italic" style={{ fontSize: size * 0.6, fontWeight: 600, color: 'var(--color-accent)', marginLeft: size * 0.06, marginTop: -size * 0.02, letterSpacing: '0.01em', fontVariantNumeric: 'lining-nums' }}>56</span>
    </span>
  )
}
