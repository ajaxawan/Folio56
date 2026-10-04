import { Check, Download, FileDown, FileUp, KeyRound, Link2, Send, Upload } from 'lucide-react'
import { receiveParcel, sendNotes } from '../lib/parcelBus'
import { useEffect, useState } from 'react'
import { exportAll, hasPasscode, importAll } from '../lib/db'
import { setSessionPasscode } from '../lib/crypto'
import { pickFile } from '../lib/image'
import { ACCENTS, LIGHT_THEMES, THEMES, usePrefs, type AccentKey } from '../lib/prefs'
import { PasscodeDialog } from './PasscodeDialog'
import { WallpaperPicker } from './WallpaperPicker'
import { StoragePanel } from './StoragePanel'
import { VoicePanel } from './VoicePanel'
import { QuickCapturePanel } from './QuickCapturePanel'
import { isIOS, isStandalone } from '../lib/mobile'
import { Modal, Row, Segmented, Switch } from './ui'

export function SettingsDialog({ deviceName, onRename, onClose, noteCount, onImport }: { deviceName: string; onRename: (n: string) => void; onClose: () => void; noteCount: number; onImport: () => void }) {
  const { prefs, set } = usePrefs()
  const [name, setName] = useState(deviceName)
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
      <Row label="Appearance">
        <Segmented value={prefs.mode} onChange={(mode) => set({ mode })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'auto', label: 'Auto' }]} />
        <p className="mt-1.5 text-[12px] text-faint">{prefs.mode === 'auto' ? 'Follows your device: light by day, dark when your phone or laptop switches to dark.' : prefs.mode === 'light' ? 'Muted, off-white paper — easy on the eyes in daylight.' : 'Low-glare dark themes.'}</p>
      </Row>
      <Row label="Light theme">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LIGHT_THEMES.map((t) => (
            <button key={t.key} type="button" onClick={() => set({ lightTheme: t.key, ...(prefs.mode === 'dark' ? { mode: 'light' as const } : {}) })}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition-colors ${prefs.lightTheme === t.key && prefs.mode !== 'dark' ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : 'border-line hover:border-muted/60'}`}>
              <span className="relative flex h-12 w-full overflow-hidden rounded-md ring-1 ring-line" style={{ background: t.swatch[0] }}>
                <span className="absolute bottom-1.5 left-1.5 h-5 w-10 rounded shadow-sm" style={{ background: t.swatch[1] }} />
                <span className="absolute left-1.5 top-2 h-1 w-8 rounded" style={{ background: t.swatch[2], opacity: .8 }} />
              </span>
              <span className="text-[13px] font-medium">{t.label}</span>
              <span className="-mt-1 text-[11px] text-muted">{t.note}</span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Dark theme">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button key={t.key} type="button" onClick={() => set({ theme: t.key, accent: t.accent, ...(prefs.wallpaper === 'none' ? { accentHex: null } : {}), ...(prefs.mode === 'light' ? { mode: 'dark' as const } : {}) })}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition-colors ${prefs.theme === t.key && prefs.mode !== 'light' ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : 'border-line hover:border-muted/60'}`}>
              <span className="relative flex h-12 w-full overflow-hidden rounded-md ring-1 ring-line" style={{ background: t.swatch[0] }}>
                <span className="absolute bottom-1.5 left-1.5 h-5 w-10 rounded" style={{ background: t.swatch[1] }} />
                <span className="absolute left-1.5 top-2 h-1 w-8 rounded" style={{ background: t.swatch[2], opacity: .85 }} />
                <span className="absolute bottom-2 right-2 h-3 w-3 rounded-full" style={{ background: ACCENTS[t.accent].hex }} />
              </span>
              <span className="text-[13px] font-medium">{t.label}</span>
              <span className="-mt-1 text-[11px] text-muted">{t.note}</span>
            </button>
          ))}
        </div>
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
      <Row label="Atmosphere">
        <div className="space-y-2">
          <Segmented value={prefs.candlelight} onChange={(candlelight) => set({ candlelight })} options={[{ value: 'auto', label: 'Candlelight in evenings' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Off' }]} />
          <p className="text-[12px] text-faint">Warms the colours and cuts blue light from 7 pm, fading back by 7 am.</p>
          <Switch label="Film grain" checked={prefs.grain} onChange={(grain) => set({ grain })} />
        </div>
      </Row>
      <Row label="Look">
        <div className="space-y-2">
          <Segmented value={prefs.titleFont} onChange={(titleFont) => set({ titleFont })} options={[{ value: 'serif', label: <span className="font-display">Serif titles</span> }, { value: 'sans', label: 'Sans titles' }]} />
          <Segmented value={prefs.cardStyle} onChange={(cardStyle) => set({ cardStyle })} options={[{ value: 'vivid', label: 'Vivid cards' }, { value: 'subtle', label: 'Subtle cards' }]} />
          <Segmented value={prefs.density} onChange={(density) => set({ density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </div>
      </Row>
      <Row label="Voice & AI">
        <VoicePanel />
      </Row>
      <Row label="Quick capture">
        <QuickCapturePanel />
      </Row>
      {isIOS && !isStandalone() && (
        <Row label="On iPhone & iPad">
          <p className="text-[12.5px] leading-5 text-muted">Add Folio to your Home Screen (Share → Add to Home Screen). It opens full screen, and Safari won’t clear your notes after a week without a visit. Notes in Safari and on the Home Screen are kept separately, so export a backup from Safari first and import it in the Home Screen app.</p>
        </Row>
      )}
      <Row label="Your name (for the greeting)">
        <input aria-label="Your name" value={prefs.name} onChange={(e) => set({ name: e.target.value })} placeholder="Optional"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[15px] outline-none focus:border-accent" />
      </Row>

      <Row label="This device">
        <input aria-label="Device name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && onRename(name.trim())}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[15px] outline-none focus:border-accent" />
        <p className="mt-1 text-[12px] text-faint">Shown to your other devices when pairing.</p>
      </Row>

      <Row label="Locked notes">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDialog(true)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2">
            <KeyRound size={16} /> {pass ? 'Passcode is set' : 'Create passcode'}
          </button>
          {pass && <button type="button" onClick={() => { setSessionPasscode(null); setMsg('Locked notes are locked again.') }} className="rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2">Lock now</button>}
        </div>
      </Row>

      <Row label={`Your data · ${noteCount} notes${usage ? ` · ${usage}` : ''}`}>
        <p className="mb-2 text-[12.5px] leading-5 text-muted">Notes live only in this browser on this device. Nothing is uploaded. Export a backup now and then.</p>
        <div className="flex gap-2">
          <button type="button" onClick={exportAll} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Download size={16} /> Export all</button>
          <button type="button" onClick={async () => {
            const f = await pickFile('application/json,.json'); if (!f) return
            try { const n = await importAll(f); setMsg(`Imported ${n} notes.`) } catch (e) { setMsg((e as Error).message) }
          }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Upload size={16} /> Import</button>
        </div>
      </Row>
      {msg && <p className="mb-3 text-[13px] text-ink-2">{msg}</p>}

      <Row label="Storage on this device">
        <StoragePanel />
      </Row>

      <Row label="Markdown">
        <div className="flex gap-2">
          <button type="button" onClick={() => { onClose(); onImport() }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><FileUp size={16} /> Import .md</button>
          <button type="button" onClick={async () => { const { exportAllMarkdown } = await import('../lib/markdown'); const n = await exportAllMarkdown(); setMsg(`Exported ${n} notes as Markdown.`) }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><FileDown size={16} /> Export .md (zip)</button>
        </div>
      </Row>
      <Row label="Share between devices">
        <p className="mb-2 text-[12.5px] leading-5 text-muted">Notes travel inside a link, encrypted with a code. No server, no account. To share just a few, select them and tap Share.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => { onClose(); sendNotes('all') }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Send size={16} /> Share all</button>
          <button type="button" onClick={() => { onClose(); receiveParcel() }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2"><Link2 size={16} /> Open a link</button>
        </div>
      </Row>
      {dialog && <PasscodeDialog mode={pass ? 'enter' : 'set'} onCancel={() => setDialog(false)} onDone={() => { setDialog(false); setPass(true); setMsg('Passcode ready. Locked notes open for this session.') }} />}
    </Modal>
  )
}
