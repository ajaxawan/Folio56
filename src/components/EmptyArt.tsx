/** Small line illustrations for empty screens. Stroke uses currentColor so they fit every theme. */
export function EmptyArt({ kind }: { kind: 'archive' | 'trash' | 'tasks' | 'label' | 'notes' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 120 96" className="mx-auto mb-4 h-24 w-32 text-muted/70" aria-hidden>
      <ellipse cx="60" cy="88" rx="38" ry="4" fill="currentColor" opacity=".12" />
      {kind === 'archive' && (<g {...common}><rect x="28" y="22" width="64" height="14" rx="3" /><path d="M32 36v38a4 4 0 0 0 4 4h48a4 4 0 0 0 4-4V36" /><path d="M50 48h20" /><path d="M44 14l6 6M76 14l-6 6M60 10v8" opacity=".6" /></g>)}
      {kind === 'trash' && (<g {...common}><path d="M36 30h48M52 30v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" /><path d="M40 30l4 46a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4l4-46" /><path d="M53 42v26M67 42v26" opacity=".6" /></g>)}
      {kind === 'tasks' && (<g {...common}><rect x="30" y="14" width="60" height="66" rx="6" /><path d="M40 32l4 4 8-8M58 32h22M40 50l4 4 8-8M58 50h22" /><rect x="40" y="62" width="10" height="10" rx="2" opacity=".6" /><path d="M58 67h16" opacity=".6" /></g>)}
      {kind === 'label' && (<g {...common}><path d="M30 44V24a4 4 0 0 1 4-4h20l34 34-24 24-34-34z" /><circle cx="42" cy="32" r="4" /></g>)}
      {kind === 'notes' && (<g {...common}><rect x="26" y="18" width="40" height="52" rx="5" transform="rotate(-8 46 44)" /><rect x="52" y="20" width="42" height="54" rx="5" /><path d="M60 34h26M60 44h26M60 54h16" /><path d="M86 12l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity=".7" /></g>)}
    </svg>
  )
}
