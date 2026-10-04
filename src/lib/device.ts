const KEY = 'folio.deviceName'

export function getDeviceName(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return v
  } catch { /* storage unavailable */ }
  const ua = navigator.userAgent
  return /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Phone' : 'Tablet') : /iPad|iPhone/i.test(ua) ? 'iPhone' : 'Laptop'
}

export function setDeviceName(name: string) {
  try { localStorage.setItem(KEY, name) } catch { /* ignore */ }
}

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Today 3:40 PM · Yesterday · Mon · 12 Sep · 12 Sep 2025 */
export function friendlyDate(t: number) {
  const d = new Date(t); const now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff === 0) return 'Today ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}
