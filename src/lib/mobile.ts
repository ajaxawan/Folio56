// Phone helpers: platform checks, the on-screen keyboard, and "phone layout" detection.
import { useEffect, useState } from 'react'

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
/** Opened from the Home Screen (installed), not a Safari tab. */
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const PHONE = '(max-width: 639px)'
export const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches

/** True while the screen is phone-sized. */
export function usePhone() {
  const [phone, setPhone] = useState(isPhone)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE); if (!mq) return
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * Tracks the on-screen keyboard through the visual viewport. Sets on <html>:
 *  data-kb="open" while it's up, and --kb = how much of the screen it covers (px).
 * iOS doesn't resize the page for the keyboard, so fixed toolbars use --kb to sit just above it.
 */
export function watchKeyboard() {
  const vv = window.visualViewport
  if (!vv) return () => {}
  const root = document.documentElement
  let raf = 0
  const update = () => {
    raf = 0
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    const open = covered > 120 && !!document.activeElement && (document.activeElement as HTMLElement).matches?.('input, textarea, [contenteditable="true"], [contenteditable="true"] *')
    root.style.setProperty('--kb', `${open ? covered : 0}px`)
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
    if (open) root.dataset.kb = 'open'; else delete root.dataset.kb
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
  vv.addEventListener('resize', schedule); vv.addEventListener('scroll', schedule)
  document.addEventListener('focusin', schedule); document.addEventListener('focusout', () => setTimeout(schedule, 60))
  update()
  return () => { vv.removeEventListener('resize', schedule); vv.removeEventListener('scroll', schedule); document.removeEventListener('focusin', schedule) }
}

/** React hook: is the keyboard up? */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const mo = new MutationObserver(() => setOpen(root.dataset.kb === 'open'))
    mo.observe(root, { attributes: true, attributeFilter: ['data-kb'] })
    return () => mo.disconnect()
  }, [])
  return open
}

/**
 * iOS Safari zooms the page when an input with text smaller than 16px is focused.
 * Capping the zoom level stops that; iOS still lets people pinch-zoom.
 * (Only on iOS — on Android the same setting would block pinch-zoom.)
 */
export function stopInputZoomOnIOS() {
  if (!isIOS) return
  const m = document.querySelector('meta[name=viewport]')
  if (m && !/maximum-scale/.test(m.getAttribute('content') ?? '')) m.setAttribute('content', `${m.getAttribute('content')}, maximum-scale=1`)
}
