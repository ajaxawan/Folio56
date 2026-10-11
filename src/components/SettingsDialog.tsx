import { Check, FileDown, FileUp, KeyRound, LayoutTemplate, Link2, QrCode, RefreshCw, Send } from 'lucide-react'
import { receiveParcel, scanBeam, sendNotes } from '../lib/parcelBus'
import { applyUpdate, checkForUpdate, useUpdateState } from '../lib/updates'
import { WhatsNewDialog } from './Safety'
import { useEffect, useRef, useState } from 'react'
import { hasPasscode } from '../lib/db'
import { setSessionPasscode } from '../lib/crypto'
import { ACCENTS, LIGHT_THEMES, THEMES, usePrefs, type AccentKey } from '../lib/prefs'
import { PasscodeDialog } from './PasscodeDialog'
import { WallpaperPicker } from './WallpaperPicker'
import { StoragePanel } from './StoragePanel'
import { VoicePanel } from './VoicePanel'
import { QuickCapturePanel } from './QuickCapturePanel'
import { BackupPanel } from './BackupBits'
import { isIOS, isStandalone } from '../lib/mobile'
import { Modal, Row, Segmented, Switch } from './ui'

/**
 * Dark and light themes on two tabs. Hovering (or focusing) a theme previews it on the whole app
 * at once; moving away puts the current one back.
 */
function ThemePicker() {
  const { prefs, set, dark } = usePrefs()
  const [tab, setTab] = useState<'dark' | 'light'>(dark ? 'dark' : 'light')
  const root = document.documentElement
  const saved = useRef<{ theme?: string; mode?: string } | null>(null)
  const preview = (theme: string, mode: 'dark' | 'light') => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return
    saved.current ??= { theme: root.dataset.theme, mode: root.dataset.mode }
    root.dataset.theme = theme; root.dataset.mode = mode
  }
  const unpreview = () => { if (saved.current) { root.dataset.theme = saved.current.theme; root.dataset.mode = saved.current.mode; saved.current = null } }
  useEffect(() => unpreview, []) // eslint-disable-line react-hooks/exhaustive-deps
  const list = tab === 'dark' ? THEMES : LIGHT_THEMES
  return (
    <div onMouseLeave={unpreview}>
      <div className="mb-2"><Segmented value={tab} onChange={setTab} options={[{ value: 'dark', label: `Dark · ${THEMES.length}` }, { value: 'light', label: `Light · ${LIGHT_THEMES.length}` }]} /></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((t) => {
          const isDark = tab === 'dark'
          const chosen = isDark ? prefs.theme === t.key : prefs.lightTheme === t.key
          const live = chosen && (prefs.mode === 'auto' || prefs.mode === (isDark ? 'dark' : 'light'))
          const accent = 'accent' in t ? ACCENTS[(t as (typeof THEMES)[number]).accent].hex : null
          return (
            <button key={t.key} type="button" aria-pressed={chosen}
              onMouseEnter={() => preview(t.key, tab)} onFocus={() => preview(t.key, tab)} onBlur={unpreview}
              onClick={() => { saved.current = null; set(isDark ? { theme: t.key as typeof prefs.theme, accent: (t as (typeof THEMES)[number]).accent, ...(prefs.wallpaper === 'none' ? { accentHex: null } : {}), ...(prefs.mode === 'light' ? { mode: 'dark' as const } : {}) } : { lightTheme: t.key as typeof prefs.lightTheme, ...(prefs.mode === 'dark' ? { mode: 'light' as const } : {}) }) }}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition-colors ${chosen ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : 'border-line hover:border-muted/60'}`}>
              <span className="relative flex h-12 w-full overflow-hidden rounded-md ring-1 ring-line" style={{ background: t.swatch[0] }}>
                <span className="absolute bottom-1.5 left-1.5 h-5 w-10 rounded shadow-sm" style={{ background: t.swatch[1] }} />
                <span className="absolute left-1.5 top-2 h-1 w-8 rounded" style={{ background: t.swatch[2], opacity: .85 }} />
                {accent && <span className="absolute bottom-2 right-2 h-3 w-3 rounded-full" style={{ background: accent }} />}
              </span>
              <span className="flex w-full items-center gap-1 text-[13px] font-medium">{t.label}{live && <Check size={13} className="ml-auto text-accent" />}</span>
              <span className="-mt-1 text-[11px] text-muted">{t.note}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[12px] text-faint">{prefs.mode === 'auto' ? `Auto uses ${THEMES.find((t) => t.key === prefs.theme)?.label} at night and ${LIGHT_THEMES.find((t) => t.key === prefs.lightTheme)?.label} by day.` : 'Hover a theme to preview it.'}</p>
    </div>
  )
}

export function SettingsDialog({ onClose, noteCount, onImport, onExport, onTemplates, onWelcome }: { onClose: () => void; noteCount: number; onImport: () => void; onExport: () => void; onTemplates: () => void; onWelcome: () => void }) {
  const { prefs, set } = usePrefs()
  const [usage, setUsage] = useState('')
  const [msg, setMsg] = useState('')
  const [pass, setPass] = useState<null | boolean>(null)
  const [dialog, setDialog] = useState(false)
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB`)).catch(() => {})
    hasPasscode().then(setPass)
  }, [])
  return (
    <Modal title="Settings" onClose={onClose}>
      <Row label="Your name">
        <input aria-label="Your name" value={prefs.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Zain Iqbal" autoComplete="name"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[15px] outline-none focus:border-accent" />
        <p className="mt-1 text-[12px] text-faint">Used for the greeting, templates ({'{{name}}'}) and links you share. Optional.</p>
      </Row>
      <Row label="Appearance">
        <Segmented value={prefs.mode} onChange={(mode) => set({ mode })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'auto', label: 'Auto' }]} />
        <p className="mt-1.5 text-[12px] text-faint">{prefs.mode === 'auto' ? 'Follows your device: light by day, dark when your phone or laptop switches to dark.' : prefs.mode === 'light' ? 'Muted, off-white paper — easy on the eyes in daylight.' : 'Low-glare dark themes.'}</p>
      </Row>
      <Row label="Theme">
        <ThemePicker />
      </Row>
      <Row label="Accent">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
            <button key={k} type="button" title={ACCENTS[k].label} aria-label={ACCENTS[k].label} onClick={() => set({ accent: k, accentHex: null })}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110" style={{ background: ACCENTS[k].hex, boxShadow: prefs.accent === k && !prefs.accentHex ? `0 0 0 2px var(--color-pop), 0 0 0 4px ${ACCENTS[k].hex}` : undefined }}>
              {prefs.accent === k && !prefs.accentHex && <Check size={15} className="text-on-accent" strokeWidth={3} />}
            </button>
          ))}
        </div>
        {prefs.accentHex && (
          <p className="mt-1.5 flex items-center gap-2 text-[12px] text-faint"><span className="h-3 w-3 rounded-full" style={{ background: prefs.accentHex }} /> Using an accent from your wallpaper — pick a swatch to change it.</p>
        )}
        {!prefs.accentHex && <p className="mt-1.5 text-[12px] text-faint">Picking a theme sets its matching accent; change it any time.</p>}
      </Row>
      <Row label="Wallpaper">
        <WallpaperPicker />
      </Row>
      <Row label="Look">
        <div className="space-y-2">
          <Segmented value={prefs.titleFont} onChange={(titleFont) => set({ titleFont })} options={[{ value: 'serif', label: <span className="font-display">Serif titles</span> }, { value: 'sans', label: 'Sans titles' }]} />
          <Segmented value={prefs.cardStyle} onChange={(cardStyle) => set({ cardStyle })} options={[{ value: 'vivid', label: 'Vivid cards' }, { value: 'subtle', label: 'Subtle cards' }]} />
          <Segmented value={prefs.density} onChange={(density) => set({ density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </div>
      </Row>
      <Row label="AI">
        <div className="space-y-2">
          <Switch label={<span>AI features <span className="text-muted">· uses your own free Groq key</span></span>} checked={prefs.ai === true} onChange={(ai) => set({ ai })} />
          <p className="text-[12px] leading-5 text-faint">{prefs.ai ? 'Turns recordings into notes and meeting minutes, and adds AI options (explain, summarise, tidy) to menus. Nothing is sent anywhere until you choose one.' : 'Off: Folio never sends anything anywhere. Voice memos are kept as audio notes. Turn this on for transcripts, meeting minutes and AI options in menus.'}</p>
          {prefs.ai && <div className="pt-1"><VoicePanel /></div>}
        </div>
      </Row>
      <Row label="Quick capture">
        <QuickCapturePanel />
      </Row>
      {isIOS && !isStandalone() && (
        <Row label="On iPhone & iPad">
          <p className="text-[12.5px] leading-5 text-muted">Add Folio to your Home Screen (Share → Add to Home Screen). It opens full screen, and Safari won’t clear your notes after a week without a visit. Notes in Safari and on the Home Screen are kept separately, so export a backup from Safari first and import it in the Home Screen app.</p>
        </Row>
      )}
      <Row label="Effects">
        <div className="space-y-2">
          <Segmented value={prefs.candlelight} onChange={(candlelight) => set({ candlelight })} options={[{ value: 'auto', label: 'Candlelight in evenings' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Off' }]} />
          <p className="text-[12px] text-faint">Warms the colours and cuts blue light from 7 pm, fading back by 7 am.</p>
          <Switch label="Film grain" checked={prefs.grain} onChange={(grain) => set({ grain })} />
        </div>
      </Row>

      <Row label="Locked notes">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDialog(true)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2">
            <KeyRound size={16} /> {pass ? 'Passcode is set' : 'Create passcode'}
          </button>
          {pass && <button type="button" onClick={() => { setSessionPasscode(null); setMsg('Locked notes are locked again.') }} className="rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2">Lock now</button>}
        </div>
      </Row>

      <Row label={`Backups · ${noteCount} notes${usage ? ` · ${usage}` : ''}`}>
        <BackupPanel onMessage={setMsg} />
      </Row>
      {msg && <p className="mb-3 text-[13px] text-ink-2">{msg}</p>}

      <Row label="Storage on this device">
        <StoragePanel />
      </Row>

      <Row label="Templates">
        <button type="button" onClick={onTemplates} className="flex w-full items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><LayoutTemplate size={16} /> Manage templates…</button>
      </Row>
      <Row label="Export & import">
        <div className="flex gap-2">
          <button type="button" onClick={onExport} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><FileDown size={16} /> Export notes…</button>
          <button type="button" onClick={() => { onClose(); onImport() }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><FileUp size={16} /> Import Markdown…</button>
        </div>
        <p className="mt-1.5 text-[12px] text-faint">Markdown, Word, web page or text — for one note, a selection or everything.</p>
      </Row>
      <Row label="Share between devices">
        <p className="mb-2 text-[12.5px] leading-5 text-muted">Notes travel inside a link, encrypted with a code — or, with <b className="text-ink-2">Beam</b>, as QR codes from one screen to another camera. No server, no account. To share just a few, select them and tap Share.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => { onClose(); sendNotes('all') }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Send size={16} /> Share all</button>
          <button type="button" onClick={() => { onClose(); receiveParcel() }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Link2 size={16} /> Open a link</button>
          <button type="button" onClick={() => { onClose(); scanBeam() }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><QrCode size={16} /> Receive</button>
        </div>
      </Row>
      <Row label="About">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="mr-auto text-ink-2">Folio56 <span className="tabular-nums text-muted">{__APP_VERSION__}</span></span>
          <button type="button" onClick={() => { onClose(); onWelcome() }} className="rounded-lg bg-wash px-3 py-2 hover:bg-wash-2">Show the welcome guide</button>
          <a href="/welcome" target="_blank" rel="noopener" className="rounded-lg bg-wash px-3 py-2 hover:bg-wash-2">About Folio56 ↗</a>
        </div>
        <UpdateRow />
      </Row>
      {dialog && <PasscodeDialog mode={pass ? 'enter' : 'set'} onCancel={() => setDialog(false)} onDone={() => { setDialog(false); setPass(true); setMsg('Passcode ready. Locked notes open for this session.') }} />}
    </Modal>
  )
}

/** V6.3: check for a new version by hand, and install it when one is waiting. */
function UpdateRow() {
  const state = useUpdateState()
  const [news, setNews] = useState(false)
  const note = { idle: '', checking: 'Checking…', current: 'You have the latest version.', offline: 'Can’t check while offline. Folio keeps working.', unsupported: 'Updates install when you reload this page.', ready: 'A new version is ready.' }[state]
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
      <span role="status" className={`mr-auto ${state === 'ready' ? 'font-medium text-accent-ink' : 'text-muted'}`}>{note}</span>
      <button type="button" onClick={() => setNews(true)} className="rounded-lg px-3 py-2 text-ink-2 hover:bg-wash">What’s new</button>
      {state === 'ready' || state === 'unsupported'
        ? <button type="button" onClick={() => applyUpdate()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 font-medium text-on-accent"><RefreshCw size={14} /> {state === 'ready' ? 'Update now' : 'Reload'}</button>
        : <button type="button" disabled={state === 'checking'} onClick={() => checkForUpdate()} className="flex items-center gap-1.5 rounded-lg bg-wash px-3 py-2 hover:bg-wash-2 disabled:opacity-60"><RefreshCw size={14} className={state === 'checking' ? 'animate-spin' : ''} /> Check for updates</button>}
      {news && <WhatsNewDialog onClose={() => setNews(false)} />}
    </div>
  )
}
