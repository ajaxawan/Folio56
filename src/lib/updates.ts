// V6.3 updates: Folio checks for a new version on its own (on start, every half hour while open, and
// when you come back to it), and Settings → About has a "Check for updates" button. A new version
// never swaps in mid-sentence — it waits for you to tap Update.
import { useSyncExternalStore } from 'react'

export type UpdateState = 'idle' | 'checking' | 'ready' | 'current' | 'offline' | 'unsupported'

let state: UpdateState = 'idle'
let apply: ((reload?: boolean) => Promise<void>) | null = null
let reg: ServiceWorkerRegistration | null = null
let lastCheck = 0
let started = false
const subs = new Set<() => void>()
const set = (s: UpdateState) => { state = s; subs.forEach((f) => f()) }

export const useUpdateState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)

export function startUpdates() {
  if (started) return
  started = true
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) { set('unsupported'); return }
  import('virtual:pwa-register').then(({ registerSW }) => {
    apply = registerSW({
      onNeedRefresh: () => set('ready'),
      onRegisteredSW: (_url, r) => {
        reg = r ?? null
        lastCheck = Date.now()
        window.setInterval(() => { void checkForUpdate(true) }, 30 * 60_000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && Date.now() - lastCheck > 10 * 60_000) void checkForUpdate(true)
        })
      },
    })
  }).catch(() => set('unsupported'))
}

/** Asks the server for a newer version. `quiet` checks don't change what Settings shows unless one is found. */
export async function checkForUpdate(quiet = false): Promise<UpdateState> {
  if (state === 'ready') return state
  if (!reg) { if (!quiet) set('unsupported'); return state }
  if (!navigator.onLine) { if (!quiet) set('offline'); return state }
  lastCheck = Date.now()
  if (!quiet) set('checking')
  try { await reg.update() } catch { if (!quiet) set('offline'); return state }
  // A new version downloads in the background; "ready" arrives through onNeedRefresh.
  const installing = reg.installing
  if (installing) {
    await new Promise<void>((res) => {
      const t = window.setTimeout(res, 30_000)
      installing.addEventListener('statechange', () => { if (installing.state === 'installed' || installing.state === 'redundant') { window.clearTimeout(t); res() } })
    })
    await new Promise((r) => setTimeout(r, 300))
  }
  if (reg.waiting && (state as UpdateState) !== 'ready') set('ready')
  if (!quiet && (state as UpdateState) === 'checking') set('current')
  return state
}

/** Swaps in the new version and reloads. Without a service worker, just reloads. */
export async function applyUpdate() {
  if (apply && state === 'ready') await apply(true)
  else location.reload()
}

// ---------------------------------------------------------------- what's new
/** The few things worth knowing about this version, shown once after an update. */
export const WHATS_NEW: { version: string; items: string[] } = {
  version: '6.4',
  items: [
    'Sync my devices: scan a code on each device and they bring each other up to date over your Wi-Fi — pictures and recordings too. No account, no server.',
    'Only what changed travels. A note changed on both devices is kept twice, so nothing is lost.',
    'Not on the same Wi-Fi? Sync with QR codes instead — slower, but it works anywhere.',
    '“Mentioned in · not linked”: notes that name this one, with one tap to turn the mention into a link.',
    'Calmer, smoother motion everywhere: cards glide when they move, archived notes fly to Archive, new themes spread from your tap. Settings → Motion: Calm, Lively or Still.',
  ],
}

/** True once per browser after Folio moves to a new version (never on a first visit). */
export function takeUpdatedFrom(): string | null {
  try {
    const last = localStorage.getItem('folio.lastVersion')
    const known = last ?? (localStorage.getItem('folio.app') ? 'earlier' : null)
    localStorage.setItem('folio.lastVersion', __APP_VERSION__)
    if (!known || known === __APP_VERSION__) return null
    // patch releases (6.3.0 → 6.3.1) don't need a "what's new"
    if (known !== 'earlier' && known.split('.').slice(0, 2).join('.') === __APP_VERSION__.split('.').slice(0, 2).join('.')) return null
    return known
  } catch { return null }
}

/** Worked out once when Folio starts, before anything else marks this browser. */
export const updatedFrom = takeUpdatedFrom()
