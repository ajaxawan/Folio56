import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { usePrefs } from '../lib/prefs'
import { wallpaperUrl } from '../lib/wallpapers'

/** 0 → 1 warmth by clock: ramps up 19:00–21:00, full overnight, ramps down 05:00–07:00. */
export function candleStrength(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= 21 || h < 5) return 1
  if (h >= 19) return (h - 19) / 2
  if (h < 7) return 1 - (h - 5) / 2
  return 0
}

/** Film grain + evening "candlelight" warmth, drawn as two non-interactive overlays. */
export function Atmosphere() {
  const { prefs } = usePrefs()
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 5 * 60 * 1000); return () => clearInterval(t) }, [])
  void tick
  const warmth = prefs.candlelight === 'on' ? 1 : prefs.candlelight === 'off' ? 0 : candleStrength()
  useEffect(() => { document.documentElement.dataset.candle = warmth > 0.5 ? 'on' : 'off' }, [warmth])
  return (
    <>
      {warmth > 0 && <div aria-hidden className="candle-overlay" style={{ opacity: 0.85 * warmth }} />}
      {prefs.grain && <div aria-hidden className="grain-overlay" />}
    </>
  )
}

/**
 * Wallpaper behind the whole app (per device, like a desktop wallpaper).
 * Surfaces turn translucent so it shows through; a veil keeps text readable.
 */
export function Wallpaper() {
  const { prefs, theme } = usePrefs()
  const custom = useLiveQuery(() => (prefs.wallpaper === 'custom' ? db.meta.get('wallpaperImage') : undefined), [prefs.wallpaper])
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  useEffect(() => {
    const blob = custom?.value as Blob | undefined
    if (!blob) { setCustomUrl(null); return }
    const u = URL.createObjectURL(blob); setCustomUrl(`url("${u}")`)
    return () => URL.revokeObjectURL(u)
  }, [custom])

  const image = prefs.wallpaper === 'custom' ? customUrl : prefs.wallpaper !== 'none' ? wallpaperUrl(prefs.wallpaper) : null
  const active = !!image

  useEffect(() => {
    const root = document.documentElement
    const keys = ['--color-canvas', '--color-card', '--color-side', '--color-surface', '--color-raised', '--color-canvas-solid']
    keys.forEach((k) => root.style.removeProperty(k))
    if (!active) { delete root.dataset.wallpaper; return }
    root.dataset.wallpaper = 'on'
    const cs = getComputedStyle(root)
    const get = (k: string) => cs.getPropertyValue(k).trim()
    const g = Math.round(prefs.wpGlass * 100)
    const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${Math.max(0, Math.min(100, pct))}%, transparent)`
    root.style.setProperty('--color-canvas-solid', get('--color-canvas'))
    root.style.setProperty('--color-canvas', mix(get('--color-canvas'), 35))
    root.style.setProperty('--color-card', mix(get('--color-card'), g))
    root.style.setProperty('--color-side', mix(get('--color-side'), g - 10))
    root.style.setProperty('--color-surface', mix(get('--color-surface'), g + 12))
    root.style.setProperty('--color-raised', mix(get('--color-raised'), g + 15))
  }, [active, theme, prefs.wpGlass])

  if (!image) return null
  const blur = prefs.wpBlur
  return (
    <div aria-hidden className="wallpaper">
      <div className="wallpaper-img" style={{ backgroundImage: image, filter: blur ? `blur(${blur}px)` : undefined, inset: blur ? -blur * 2 : 0 }} />
      <div className="wallpaper-veil" style={{ opacity: prefs.wpDim }} />
    </div>
  )
}
