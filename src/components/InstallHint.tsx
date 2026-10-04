import { PlusSquare, Share, X } from 'lucide-react'
import { useState } from 'react'
import { isIOS, isStandalone } from '../lib/mobile'

const KEY = 'folio.installHint'

/**
 * iPhone/iPad in a Safari tab: suggest Add to Home Screen. Besides opening full screen,
 * it matters for data — Safari can clear a site's storage after 7 days without a visit,
 * while Home Screen apps keep theirs.
 */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => { try { return !isIOS || isStandalone() || !!localStorage.getItem(KEY) } catch { return true } })
  if (hidden) return null
  const close = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ } setHidden(true) }
  return (
    <div className="animate-pop relative mb-3 mt-1 rounded-2xl border border-accent/30 bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-card))] p-3.5 pr-10">
      <button type="button" aria-label="Dismiss" onClick={close} className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-wash"><X size={17} /></button>
      <p className="text-[14.5px] font-semibold text-ink">Keep Folio on your Home Screen</p>
      <p className="mt-0.5 text-[13px] leading-5 text-muted">It opens full screen like an app, and Safari won't clear your notes if you don't visit for a week.</p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
        Tap <span className="inline-flex items-center gap-1 rounded-md bg-wash px-1.5 py-0.5"><Share size={13} /> Share</span> then
        <span className="inline-flex items-center gap-1 rounded-md bg-wash px-1.5 py-0.5"><PlusSquare size={13} /> Add to Home Screen</span>
      </p>
    </div>
  )
}
