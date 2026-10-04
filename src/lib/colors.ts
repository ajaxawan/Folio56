import type { ColorKey } from '../types'

// Google Keep palettes. Dark ones are toned ~12% toward the card colour so a wall of notes isn't loud.
const DARK: Record<ColorKey, string> = {
  default: '#202124', coral: '#77172e', peach: '#692b17', sand: '#7c4a03', mint: '#264d3b', sage: '#0c625d',
  fog: '#256377', storm: '#284255', dusk: '#472e5b', blossom: '#6c394f', clay: '#4b443a',
}
const LIGHT: Record<ColorKey, string> = {
  default: '#ffffff', coral: '#faafa8', peach: '#f39f76', sand: '#fff8b8', mint: '#e2f6d3', sage: '#b4ddd3',
  fog: '#d4e4ed', storm: '#aeccdc', dusk: '#d3bfdb', blossom: '#f6e2dd', clay: '#e9e3d4',
}
export const COLOR_NAMES: Record<ColorKey, string> = {
  default: 'Default', coral: 'Coral', peach: 'Peach', sand: 'Sand', mint: 'Mint', sage: 'Sage',
  fog: 'Fog', storm: 'Storm', dusk: 'Dusk', blossom: 'Blossom', clay: 'Clay',
}
export const COLOR_KEYS = Object.keys(DARK) as ColorKey[]

export const swatch = (k: ColorKey, dark: boolean) => (dark ? DARK : LIGHT)[k] ?? (dark ? DARK : LIGHT).default
/** A saturated dot colour that reads on any theme (labels, palette dots). */
export const dot = (k: ColorKey | undefined) => (!k || k === 'default' ? 'var(--color-muted)' : DARK[k] === DARK.default ? DARK[k] : `color-mix(in oklab, ${LIGHT[k]} 45%, ${DARK[k]})`)

/** Card / editor surface for a note colour. "subtle" = neutral card with a tint + coloured edge. */
export function surface(k: ColorKey, dark: boolean, style: 'vivid' | 'subtle') {
  const c = swatch(k, dark)
  if (k === 'default') return { background: 'var(--color-card)', borderColor: 'var(--color-line)', accent: 'transparent' }
  if (style === 'vivid' && !dark) {
    // light mode: Keep's pastels, softened into the paper so a wall of notes stays calm
    return { background: `linear-gradient(160deg, color-mix(in oklab, ${c} 62%, var(--color-card)) 0%, color-mix(in oklab, ${c} 42%, var(--color-card)) 100%)`, borderColor: `color-mix(in oklab, ${c} 55%, var(--color-line))`, accent: c }
  }
  if (style === 'vivid') {
    // soft gradient wash instead of a flat fill
    const bg = `linear-gradient(160deg, color-mix(in oklab, ${c} 94%, white 6%) 0%, color-mix(in oklab, ${c} 78%, var(--color-card)) 100%)`
    void dark
    return { background: bg, borderColor: 'transparent', accent: c }
  }
  const edge = dark ? LIGHT[k] : DARK[k]
  return { background: `color-mix(in oklab, ${c} ${dark ? 34 : 42}%, var(--color-card))`, borderColor: 'var(--color-line)', accent: edge }
}

// Cover presets (stored on a note as "g:<key>")
export const COVERS: Record<string, string> = {
  dawn: 'linear-gradient(120deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)',
  ocean: 'linear-gradient(120deg, #2b5876 0%, #4e4376 100%)',
  aurora: 'linear-gradient(120deg, #0f9b8e 0%, #3a7bd5 60%, #6a3093 100%)',
  sand: 'linear-gradient(120deg, #e6c79c 0%, #c79081 100%)',
  forest: 'linear-gradient(120deg, #134e5e 0%, #71b280 100%)',
  dusk: 'linear-gradient(120deg, #41295a 0%, #2f0743 100%)',
  solar: 'linear-gradient(120deg, #f7971e 0%, #ffd200 100%)',
  slate: 'linear-gradient(120deg, #232526 0%, #414345 100%)',
  mesh: 'radial-gradient(at 20% 30%, #6a82fb 0, transparent 50%), radial-gradient(at 80% 20%, #fc5c7d 0, transparent 50%), radial-gradient(at 50% 90%, #22c1c3 0, transparent 55%), #1b1b2f',
}
export const coverCss = (cover?: string | null) => !cover ? null : cover.startsWith('g:') ? COVERS[cover.slice(2)] ?? null : `center / cover no-repeat url("${cover}")`

export const EMOJI = ['📝', '💡', '📌', '✅', '🗓️', '☀️', '🌙', '⭐', '🔥', '🚀', '🎯', '📚', '🧠', '🛠️', '⚙️', '🧪', '🐞', '📊', '🗺️', '🌍', '☕', '🍃', '🎨', '🎵', '💬', '❤️', '🏠', '✈️', '💼', '💰', '🔒', '📁', '🔋', '🌊', '⚡', '🌱', '🧾', '📷', '🎁', '🧩']
