import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'

export type ThemeKey = 'charcoal' | 'espresso' | 'moss' | 'arctic' | 'dusk' | 'midnight' | 'oled'
export type LightThemeKey = 'paper' | 'mist'
export type Mode = 'dark' | 'light' | 'auto'
export type AccentKey = 'sky' | 'lavender' | 'teal' | 'sage' | 'amber' | 'peach' | 'rose'

export interface Prefs {
  /** dark theme */
  theme: ThemeKey
  /** muted light theme (V5.6) */
  lightTheme: LightThemeKey
  /** dark, light, or follow the device */
  mode: Mode
  accent: AccentKey
  titleFont: 'serif' | 'sans'
  name: string
  cardStyle: 'vivid' | 'subtle'
  density: 'comfortable' | 'compact'
  layout: 'grid' | 'list'
  sort: 'custom' | 'edited' | 'created' | 'title'
  font: 'sans' | 'serif' | 'mono'
  textSize: 'sm' | 'md' | 'lg'
  width: 'narrow' | 'wide'
  typewriter: boolean
  showCounts: boolean
  candlelight: 'auto' | 'on' | 'off'
  grain: boolean
  todayCollapsed: boolean
  /** 'none', a built-in wallpaper id, or 'custom' (your own picture, stored on this device). */
  wallpaper: string
  wpDim: number
  wpBlur: number
  wpGlass: number
  /** Accent picked from the wallpaper; overrides `accent` until a swatch is chosen. */
  accentHex: string | null
}

/** Dark-only, low-glare themes. Each suggests an accent that suits it. */
export const THEMES: { key: ThemeKey; label: string; note: string; accent: AccentKey; swatch: [string, string, string] }[] = [
  { key: 'charcoal', label: 'Charcoal', note: 'Soft neutral grey', accent: 'sky', swatch: ['#141416', '#1f1f23', '#ececec'] },
  { key: 'espresso', label: 'Espresso', note: 'Warm coffee browns', accent: 'amber', swatch: ['#1a1512', '#2a221c', '#efe6dc'] },
  { key: 'moss', label: 'Moss', note: 'Calm forest greens', accent: 'sage', swatch: ['#151a16', '#222a23', '#e4e8dc'] },
  { key: 'arctic', label: 'Arctic', note: 'Cool slate blues', accent: 'teal', swatch: ['#242933', '#323846', '#eceff4'] },
  { key: 'dusk', label: 'Dusk', note: 'Muted plum & rose', accent: 'rose', swatch: ['#191724', '#252336', '#e0def4'] },
  { key: 'midnight', label: 'Midnight', note: 'Deep navy', accent: 'lavender', swatch: ['#070b14', '#152034', '#e6ecf7'] },
  { key: 'oled', label: 'OLED black', note: 'True black, max contrast', accent: 'sky', swatch: ['#000000', '#121212', '#ffffff'] },
]

/** Muted light themes: off-white paper, never pure white; soft ink instead of black. */
export const LIGHT_THEMES: { key: LightThemeKey; label: string; note: string; swatch: [string, string, string] }[] = [
  { key: 'paper', label: 'Paper', note: 'Warm off-white, soft ink', swatch: ['#f2efe7', '#f9f7f2', '#2b2823'] },
  { key: 'mist', label: 'Mist', note: 'Cool grey-blue, calm', swatch: ['#edf0f3', '#f7f8fa', '#222831'] },
]

/** Soft, slightly desaturated accents that don't glare on dark backgrounds. */
export const ACCENTS: Record<AccentKey, { label: string; hex: string }> = {
  sky: { label: 'Sky', hex: '#7aa9ff' },
  lavender: { label: 'Lavender', hex: '#b59cff' },
  teal: { label: 'Teal', hex: '#5fcfc0' },
  sage: { label: 'Sage', hex: '#9fcf86' },
  amber: { label: 'Amber', hex: '#f0b35e' },
  peach: { label: 'Peach', hex: '#f59b7c' },
  rose: { label: 'Rose', hex: '#ee8fb0' },
}

const DEFAULTS: Prefs = {
  theme: 'charcoal', lightTheme: 'paper', mode: 'dark', accent: 'sky', titleFont: 'serif', name: '',
  cardStyle: 'vivid', density: 'comfortable', layout: 'grid', sort: 'custom',
  font: 'sans', textSize: 'md', width: 'narrow', typewriter: false, showCounts: true, candlelight: 'auto', grain: true, todayCollapsed: false,
  wallpaper: 'none', wpDim: 0.5, wpBlur: 0, wpGlass: 0.72, accentHex: null,
}
const KEY = 'folio.prefs'

// Older versions had light themes and other names — map them onto the new dark set.
const LEGACY_THEME: Record<string, ThemeKey> = { dark: 'charcoal', system: 'charcoal', light: 'charcoal', paper: 'espresso', contrast: 'oled' }
const LEGACY_ACCENT: Record<string, AccentKey> = { blue: 'sky', violet: 'lavender', green: 'sage' }

function load(): Prefs {
  try {
    const raw = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    if (!THEMES.some((t) => t.key === raw.theme)) raw.theme = LEGACY_THEME[raw.theme] ?? 'charcoal'
    if (!LIGHT_THEMES.some((t) => t.key === raw.lightTheme)) raw.lightTheme = 'paper'
    if (!['dark', 'light', 'auto'].includes(raw.mode)) raw.mode = 'dark'
    if (!(raw.accent in ACCENTS)) raw.accent = LEGACY_ACCENT[raw.accent] ?? 'sky'
    return raw
  } catch { return DEFAULTS }
}

const Ctx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void; dark: boolean; theme: string }>({ prefs: DEFAULTS, set: () => {}, dark: true, theme: 'charcoal' })

const prefersLight = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)
  const [sysLight, setSysLight] = useState(prefersLight)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)'); if (!mq) return
    const on = () => setSysLight(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const light = prefs.mode === 'light' || (prefs.mode === 'auto' && sysLight)
  const theme = light ? prefs.lightTheme : prefs.theme
  // Layout effect so the theme is on <html> before children (e.g. the wallpaper) read computed colours.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.mode = light ? 'light' : 'dark'
    root.dataset.titlefont = prefs.titleFont
    const accent = prefs.accentHex ?? (ACCENTS[prefs.accent] ?? ACCENTS.sky).hex
    root.style.setProperty('--color-accent', accent)
    // On light paper the soft accents are too pale for text and links: use a deeper ink of the same hue.
    root.style.setProperty('--color-accent-ink', light ? `color-mix(in oklab, ${accent} 55%, #1b1b1b)` : accent)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (getComputedStyle(root).getPropertyValue('--color-canvas-solid').trim() || getComputedStyle(root).getPropertyValue('--color-canvas').trim()) || '#141416')
  }, [theme, light, prefs.accent, prefs.accentHex, prefs.titleFont])
  const set = (p: Partial<Prefs>) => setPrefs((cur) => {
    const next = { ...cur, ...p }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  return <Ctx.Provider value={{ prefs, set, dark: !light, theme }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePrefs = () => useContext(Ctx)

export function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late'
}
