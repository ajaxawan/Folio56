import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePrefs } from '../lib/prefs'
import { addWelcomeNote, isWelcomed, markWelcomed } from '../lib/welcome'
import { Segmented } from './ui'

/**
 * V6.2 first run. Shown once, on a browser with no notes: a name, dark or light, then a guide note
 * that teaches by being used. Anyone who already has notes is marked as welcomed without seeing it.
 */
export function WelcomeCard({ noteCount, loaded, onOpen }: { noteCount: number; loaded: boolean; onOpen: (id: string) => void }) {
  const { prefs, set } = usePrefs()
  const [show, setShow] = useState(false)
  const [name, setName] = useState(prefs.name)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!loaded) return
    let live = true
    isWelcomed().then((w) => {
      if (!live || w) return
      if (noteCount > 0) { markWelcomed(); setShow(false); return } // has notes: not a first run
      setShow(true)
    })
    return () => { live = false }
  }, [noteCount, loaded])
  if (!show) return null
  const start = async () => {
    setBusy(true)
    if (name.trim() !== prefs.name) set({ name: name.trim() })
    const id = await addWelcomeNote()
    setShow(false)
    onOpen(id)
  }
  const skip = () => { markWelcomed(); setShow(false) }
  return (
    <section aria-labelledby="welcome-title" className="animate-pop relative mx-auto mb-4 mt-2 max-w-[640px] overflow-hidden rounded-3xl border border-line bg-[linear-gradient(160deg,color-mix(in_srgb,var(--color-accent)_14%,var(--color-card))_0%,var(--color-card)_55%)] p-6 shadow-[inset_0_1px_0_var(--color-highlight)] max-sm:p-5">
      <h2 id="welcome-title" className="font-title text-[28px] leading-tight text-ink max-sm:text-[24px]">Welcome to Folio56</h2>
      <p className="mt-2 text-[14.5px] leading-6 text-ink-2">A calm place for your notes. They stay in this browser, on this device — no account, nothing uploaded. Two quick choices, then you’re writing.</p>
      <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy) start() }}>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-muted">What should Folio56 call you? <span className="font-normal text-faint">Optional</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" aria-label="Your name"
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-accent" />
        </label>
        <div>
          <span className="mb-1.5 block text-[12.5px] font-medium text-muted">Easy on the eyes</span>
          <Segmented value={prefs.mode} onChange={(mode) => set({ mode })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'auto', label: 'Match my device' }]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-on-accent transition-transform active:scale-[.97] disabled:opacity-60">
            Start writing <ArrowRight size={16} />
          </button>
          <button type="button" onClick={skip} className="rounded-full px-4 py-2.5 text-[14px] text-muted hover:bg-wash hover:text-ink">Skip the guide</button>
        </div>
      </form>
      <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[12.5px] text-muted"><ShieldCheck size={15} className="shrink-0 text-accent" /> You’ll get a short guide note — keep it, or delete it when you’re done.</p>
    </section>
  )
}
