// V6.4 motion: one set of timings for the whole app, and the few bigger moments built on it.
//
// Three levels (Settings → Appearance → Motion):
//   calm   — the default: smooth, noticeable, never bouncy
//   lively — the same moves with a little more spring and travel
//   still  — almost nothing moves (chosen for you when the device asks to reduce motion)
// The level lives on <html data-motion>, and CSS (index.css, "motion system") reads it.
//
// Rules this file keeps: only transform and opacity animate (cheap for the GPU, no layout work),
// nothing moves while you type, and every animation is short enough never to be in the way.

export type MotionLevel = 'calm' | 'lively' | 'still'

export const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** The level in use right now. */
export const motion = (): MotionLevel => (document.documentElement.dataset.motion as MotionLevel) || (reduceMotion() ? 'still' : 'calm')
export const still = () => motion() === 'still'
/** Time scale for animations done in script (matches --t in CSS). */
export const tScale = () => (motion() === 'lively' ? 1.12 : 1)

// Spring curves (critically damped-ish), sampled from a damped spring so they work in CSS and WAAPI.
export const SPRING = {
  calm: 'linear(0, 0.062, 0.2, 0.362, 0.519, 0.656, 0.766, 0.85, 0.911, 0.953, 0.98, 0.997, 1.006, 1.01, 1.011, 1.01, 1.009, 1.007, 1.005, 1.004, 1.003, 1.002, 1.001, 1.001, 1, 1, 1, 1, 1)',
  lively: 'linear(0, 0.077, 0.253, 0.464, 0.666, 0.834, 0.958, 1.038, 1.081, 1.095, 1.09, 1.074, 1.054, 1.035, 1.018, 1.006, 0.997, 0.993, 0.991, 0.991, 0.993, 0.995, 0.996, 0.998, 0.999, 1, 1.001, 1.001, 1)',
}
export const EASE_OUT = 'cubic-bezier(.22,.8,.24,1)'
export const EASE_IN = 'cubic-bezier(.45,0,.8,.35)'
const linearOk = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')
export const spring = () => (linearOk ? SPRING[motion() === 'lively' ? 'lively' : 'calm'] : EASE_OUT)

// ---------------------------------------------------------------- where the last tap was
/** Things that grow out of what you tapped (dialogs, the theme reveal) start from here. */
export const lastPointer = { x: -1, y: -1, at: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer.x = e.clientX; lastPointer.y = e.clientY; lastPointer.at = Date.now() }, { capture: true, passive: true })
}
export const recentTap = (ms = 900) => Date.now() - lastPointer.at < ms && lastPointer.x >= 0

// ---------------------------------------------------------------- view transitions
type VT = { finished: Promise<void>; ready: Promise<void> }
type Doc = Document & { startViewTransition?: (cb: () => void) => VT }

/**
 * Runs a DOM change as a view transition when motion is on (and the browser can), else just runs it.
 * `kind` picks the CSS for the transition: a sideways slide between views, or the theme reveal.
 */
export function viewTransition(change: () => void, kind?: 'forward' | 'back' | 'reveal'): VT | null {
  const doc = document as Doc
  if (!doc.startViewTransition || still() || document.visibilityState !== 'visible') { change(); return null }
  const root = document.documentElement
  if (kind) root.dataset.vt = kind; else delete root.dataset.vt
  if (kind === 'reveal') {
    const x = recentTap() ? lastPointer.x : innerWidth / 2, y = recentTap() ? lastPointer.y : innerHeight / 2
    root.style.setProperty('--rx', `${x}px`); root.style.setProperty('--ry', `${y}px`)
    root.style.setProperty('--rr', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`)
  }
  const vt = doc.startViewTransition(change)
  const done = () => { if (root.dataset.vt === kind) delete root.dataset.vt }
  vt.finished.finally(done)
  window.setTimeout(done, 1500) // never leave a stale direction behind
  return vt
}

// ---------------------------------------------------------------- moments
/**
 * A card leaving for Archive or Trash: a ghost of it shrinks and drifts towards that place in the
 * sidebar (or just sinks and fades on phones, where the sidebar is hidden). Resolves when it's gone.
 */
export function flyAway(card: Element | null, to: 'archive' | 'trash'): Promise<void> {
  if (!card || still()) return Promise.resolve()
  const from = card.getBoundingClientRect()
  if (!from.width) return Promise.resolve()
  const target = document.querySelector(`[data-nav="${to}"]`)?.getBoundingClientRect()
  const ghost = card.cloneNode(true) as HTMLElement
  Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: '0', zIndex: '70', pointerEvents: 'none', transformOrigin: 'center', willChange: 'transform, opacity' })
  ghost.removeAttribute('data-note'); ghost.setAttribute('aria-hidden', 'true')
  document.body.appendChild(ghost)
  ;(card as HTMLElement).style.visibility = 'hidden'
  const t = tScale()
  let frames: Keyframe[]
  if (target && target.width) {
    const dx = target.left + 20 - (from.left + from.width / 2), dy = target.top + target.height / 2 - (from.top + from.height / 2)
    frames = [
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 18}px) scale(.62)`, opacity: 0.95, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0.2, offset: 1 },
    ]
  } else {
    frames = [{ transform: 'none', opacity: 1 }, { transform: 'translateY(14px) scale(.9)', opacity: 0 }]
  }
  const a = ghost.animate(frames, { duration: (target ? 520 : 260) * t, easing: target ? 'cubic-bezier(.5,0,.3,1)' : EASE_IN, fill: 'forwards' })
  return a.finished.catch(() => {}).then(() => {
    ghost.remove(); (card as HTMLElement).style.visibility = ''
    // the place it landed gives a small nod
    const dest = document.querySelector(`[data-nav="${to}"]`)
    dest?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300 * t, easing: EASE_OUT })
  })
}

/** Several cards at once (a selection): they leave one after another, a beat apart. */
export function flyMany(ids: string[], to: 'archive' | 'trash') {
  if (still()) return
  ids.slice(0, 12).forEach((id, i) => {
    const el = document.querySelector(`[data-flip="${CSS.escape(id)}"]`)
    if (i === 0) void flyAway(el, to); else window.setTimeout(() => void flyAway(el, to), i * 45)
  })
}

/**
 * FLIP: cards that moved since the last layout glide from where they were. New ones fade up.
 * `before` holds layout positions inside `box` (which must be positioned), so scrolling doesn't matter.
 */
export function flipFrom(box: HTMLElement, before: Map<string, DOMRect>, selector = '[data-flip]', attr = 'data-flip') {
  const after = new Map<string, DOMRect>()
  box.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const id = el.getAttribute(attr)!
    // layout position (offsets ignore running transforms, so a glide in progress doesn't skew the next)
    let x = 0, y = 0
    for (let n: HTMLElement | null = el; n && n !== box; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; if (!n.offsetParent) break }
    const rel = new DOMRect(x, y, el.offsetWidth, el.offsetHeight)
    after.set(id, rel)
    if (still() || !before.size) return
    const old = before.get(id)
    if (!old) {
      el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260 * tScale(), easing: EASE_OUT })
      return
    }
    const dx = old.left - rel.left, dy = old.top - rel.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    // far jumps (off screen) just appear — gliding across the whole page is tiring to watch
    if (Math.abs(dy) > innerHeight) return
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380 * tScale(), easing: spring() })
  })
  return after
}
