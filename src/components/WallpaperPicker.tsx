import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ImagePlus, Pipette, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { pickFile } from '../lib/image'
import { usePrefs } from '../lib/prefs'
import { accentFrom, prepareImage, WALLPAPERS, wallpaperUrl } from '../lib/wallpapers'

function Tile({ active, label, bg, onClick, children }: { active: boolean; label: string; bg?: string | null; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={`Wallpaper: ${label}`} aria-pressed={active}
      className={`relative aspect-video w-full overflow-hidden rounded-lg border text-left transition-all ${active ? 'border-accent ring-2 ring-accent/50' : 'border-line hover:border-muted/60'}`}
      style={{ background: bg ? `${bg} center / cover no-repeat` : 'var(--color-canvas-solid, var(--color-canvas))' }}>
      {children}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10.5px] font-medium text-white/90">{label}</span>
      {active && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent"><Check size={11} strokeWidth={3} /></span>}
    </button>
  )
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 cursor-pointer" aria-label={label} />
      <span className="w-10 text-right tabular-nums text-faint">{fmt(value)}</span>
    </label>
  )
}

/** Settings → Wallpaper. Everything stays on this device, so each device can have its own. */
export function WallpaperPicker() {
  const { prefs, set } = usePrefs()
  const custom = useLiveQuery(() => db.meta.get('wallpaperImage'), [])
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const b = custom?.value as Blob | undefined
    if (!b) { setCustomUrl(null); return }
    const u = URL.createObjectURL(b); setCustomUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [custom])

  const upload = async () => {
    const f = await pickFile('image/*'); if (!f) return
    setBusy(true)
    try {
      const blob = await prepareImage(f)
      await db.meta.put({ key: 'wallpaperImage', value: blob })
      set({ wallpaper: 'custom', accentHex: await accentFrom(blob) })
    } finally { setBusy(false) }
  }
  const removeCustom = async () => {
    await db.meta.delete('wallpaperImage')
    if (prefs.wallpaper === 'custom') set({ wallpaper: 'none', accentHex: null })
  }
  const matchAccent = async () => {
    if (prefs.wallpaper === 'custom' && custom?.value) set({ accentHex: await accentFrom(custom.value as Blob) })
    else { const w = WALLPAPERS.find((x) => x.id === prefs.wallpaper); if (w) set({ accentHex: w.accent }) }
  }
  const on = prefs.wallpaper !== 'none' && (prefs.wallpaper !== 'custom' || !!customUrl)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <Tile label="None" active={prefs.wallpaper === 'none'} onClick={() => set({ wallpaper: 'none', accentHex: null })} />
        {WALLPAPERS.map((w) => (
          <Tile key={w.id} label={w.label} bg={wallpaperUrl(w.id)} active={prefs.wallpaper === w.id} onClick={() => set({ wallpaper: w.id, accentHex: w.accent })} />
        ))}
        {customUrl && (
          <div className="group relative">
            <Tile label="Your picture" bg={`url("${customUrl}")`} active={prefs.wallpaper === 'custom'} onClick={async () => set({ wallpaper: 'custom', accentHex: await accentFrom(custom!.value as Blob) })} />
            <button type="button" aria-label="Remove your picture" title="Remove your picture" onClick={() => void removeCustom()}
              className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 coarse:opacity-100"><Trash2 size={11} /></button>
          </div>
        )}
        <button type="button" onClick={upload} disabled={busy}
          className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[11.5px] text-muted hover:border-accent hover:text-ink disabled:opacity-60">
          <ImagePlus size={18} /> {busy ? 'Preparing…' : customUrl ? 'Replace picture' : 'Your own picture'}
        </button>
      </div>
      {on && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <Slider label="Dim" value={prefs.wpDim} min={0.15} max={0.9} step={0.05} onChange={(wpDim) => set({ wpDim })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Blur" value={prefs.wpBlur} min={0} max={24} step={1} onChange={(wpBlur) => set({ wpBlur })} fmt={(v) => `${v}px`} />
          <Slider label="Cards" value={prefs.wpGlass} min={0.4} max={1} step={0.02} onChange={(wpGlass) => set({ wpGlass })} fmt={(v) => (v >= 0.99 ? 'solid' : `${Math.round(v * 100)}%`)} />
          <div className="flex items-center justify-between pt-1">
            <p className="text-[12px] text-faint">Saved on this device only — each device can have its own.</p>
            <button type="button" onClick={matchAccent} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-wash px-2.5 py-1.5 text-[12.5px] hover:bg-wash-2">
              <Pipette size={13} /> Match accent
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
