// Built-in wallpapers, drawn as SVG in the browser: no downloads, crisp at any size,
// and the same seed always gives the same picture. Each suggests a matching accent.

export interface Wallpaper { id: string; label: string; accent: string; svg: () => string }

const W = 1920, H = 1080
const wrap = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const f = (n: number) => n.toFixed(1)

function stars(r: () => number, n: number, maxY = H, color = '#fff') {
  let s = ''
  for (let i = 0; i < n; i++) {
    const size = r() < 0.92 ? r() * 1.1 + 0.3 : r() * 1.6 + 1.1
    s += `<circle cx="${f(r() * W)}" cy="${f(r() * maxY)}" r="${f(size)}" fill="${color}" opacity="${f(0.25 + r() * 0.6)}"/>`
  }
  return s
}

/** Midpoint-displacement ridge line → closed polygon down to the bottom edge. */
function ridge(r: () => number, base: number, rough: number) {
  let pts = [base + (r() - 0.5) * rough, base + (r() - 0.5) * rough]
  let amp = rough
  while (pts.length < 257) {
    const next: number[] = []
    for (let i = 0; i < pts.length - 1; i++) next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * amp)
    next.push(pts[pts.length - 1]); pts = next; amp *= 0.55
  }
  const step = W / (pts.length - 1)
  return `M0 ${H} ` + pts.map((y, i) => `L${f(i * step)} ${f(y)}`).join(' ') + ` L${W} ${H} Z`
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'aurora', label: 'Aurora', accent: '#5fcfc0',
    svg: () => {
      const r = rng(11)
      return wrap(
        `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b14"/><stop offset="1" stop-color="#0b1320"/></linearGradient><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="55"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#g)"/>${stars(r, 260, 700)}
        <g filter="url(#b)" fill="none" stroke-linecap="round">
          <path d="M-100 520 C 300 260, 700 620, 1100 330 S 1800 240, 2050 420" stroke="#1fe0a8" stroke-width="150" opacity=".55"/>
          <path d="M-100 380 C 400 180, 800 480, 1250 250 S 1850 160, 2050 300" stroke="#7b5cff" stroke-width="170" opacity=".35"/>
          <path d="M200 640 C 600 480, 1000 700, 1500 470 S 1900 520, 2100 600" stroke="#1fb5ff" stroke-width="120" opacity=".3"/>
        </g>
        <rect y="760" width="${W}" height="320" fill="#03070c" opacity=".55"/>
        <path d="${ridge(rng(4), 900, 160)}" fill="#04080d"/>`)
    },
  },
  {
    id: 'ridges', label: 'Dusk ridges', accent: '#f59b7c',
    svg: () => {
      const cols = ['#5b2c4a', '#45213d', '#321a31', '#211324', '#140c17']
      const layers = cols.map((c, i) => `<path d="${ridge(rng(20 + i), 560 + i * 95, 260 - i * 30)}" fill="${c}"/>`).join('')
      return wrap(
        `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140d24"/><stop offset=".55" stop-color="#4a2345"/><stop offset="1" stop-color="#c0605a"/></linearGradient>
         <radialGradient id="sun"><stop offset="0" stop-color="#ffd2a8"/><stop offset=".35" stop-color="#ff9d7a" stop-opacity=".55"/><stop offset="1" stop-color="#ff9d7a" stop-opacity="0"/></radialGradient>`,
        `<rect width="${W}" height="${H}" fill="url(#s)"/>${stars(rng(5), 140, 380)}
         <circle cx="1280" cy="560" r="420" fill="url(#sun)"/><circle cx="1280" cy="560" r="70" fill="#ffd9b8" opacity=".9"/>${layers}`)
    },
  },
  {
    id: 'topo', label: 'Topography', accent: '#9fcf86',
    svg: () => {
      const r = rng(7)
      let lines = ''
      const peaks = [[420, 380], [1450, 300], [1100, 860], [180, 980], [1800, 900]]
      for (const [cx, cy] of peaks) {
        const ph = [r() * 6.3, r() * 6.3, r() * 6.3]
        for (let k = 1; k <= 16; k++) {
          const rad = k * 34 + r() * 6
          let d = ''
          for (let i = 0; i <= 120; i++) {
            const a = (i / 120) * Math.PI * 2
            const m = 1 + 0.16 * Math.sin(3 * a + ph[0]) + 0.08 * Math.sin(5 * a + ph[1]) + 0.05 * Math.sin(2 * a + ph[2] + k * 0.15)
            d += `${i ? 'L' : 'M'}${f(cx + Math.cos(a) * rad * m * 1.25)} ${f(cy + Math.sin(a) * rad * m)}`
          }
          const major = k % 5 === 0
          lines += `<path d="${d}Z" fill="none" stroke="#9fcf86" stroke-width="${major ? 2.2 : 1.1}" opacity="${major ? 0.32 : 0.16}"/>`
        }
      }
      return wrap(
        `<radialGradient id="v" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#16211b"/><stop offset="1" stop-color="#0a100c"/></radialGradient>`,
        `<rect width="${W}" height="${H}" fill="url(#v)"/>${lines}`)
    },
  },
  {
    id: 'nebula', label: 'Nebula', accent: '#b59cff',
    svg: () => wrap(
      `<radialGradient id="g" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#120f2e"/><stop offset="1" stop-color="#05040f"/></radialGradient><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="80"/></filter>`,
      `<rect width="${W}" height="${H}" fill="url(#g)"/>
       <g filter="url(#b)"><ellipse cx="760" cy="480" rx="420" ry="220" fill="#8a3ffc" opacity=".45"/><ellipse cx="1120" cy="560" rx="380" ry="200" fill="#ff4f9a" opacity=".3"/><ellipse cx="980" cy="420" rx="300" ry="160" fill="#3aa0ff" opacity=".35"/></g>
       ${stars(rng(9), 520)}`),
  },
  {
    id: 'dunes', label: 'Dunes', accent: '#f0b35e',
    svg: () => {
      const layers = ['#6e3b22', '#562e1c', '#412317', '#2c1811', '#1a0f0b'].map((c, i) => {
        const y = 560 + i * 105, p = i * 1.7
        let d = `M0 ${H} L0 ${y}`
        for (let x = 0; x <= W; x += 40) d += ` L${x} ${f(y + Math.sin(x / 310 + p) * 38 + Math.sin(x / 120 + p * 2) * 10)}`
        return `<path d="${d} L${W} ${H} Z" fill="${c}"/>`
      }).join('')
      return wrap(
        `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#110c0a"/><stop offset=".7" stop-color="#4a2a16"/><stop offset="1" stop-color="#b8692e"/></linearGradient>`,
        `<rect width="${W}" height="${H}" fill="url(#s)"/>${stars(rng(3), 90, 340, '#ffe6c8')}<circle cx="520" cy="520" r="46" fill="#ffd9a0" opacity=".85"/>${layers}`)
    },
  },
  {
    id: 'tide', label: 'Deep tide', accent: '#7aa9ff',
    svg: () => {
      let waves = ''
      for (let i = 0; i < 22; i++) {
        const y = 300 + i * 36
        let d = `M-20 ${y}`
        for (let x = 0; x <= W + 40; x += 30) d += ` L${x} ${f(y + Math.sin(x / (220 + i * 9) + i * 0.7) * (18 + i * 1.6))}`
        waves += `<path d="${d}" fill="none" stroke="#7aa9ff" stroke-width="1.3" opacity="${f(0.06 + i * 0.012)}"/>`
      }
      return wrap(
        `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a16"/><stop offset="1" stop-color="#0b1a33"/></linearGradient>`,
        `<rect width="${W}" height="${H}" fill="url(#g)"/>${waves}`)
    },
  },
  {
    id: 'bokeh', label: 'Bokeh', accent: '#ee8fb0',
    svg: () => {
      const r = rng(21)
      const cols = ['#ff8fb1', '#ffb36b', '#c38bff', '#ff6f91']
      let dots = ''
      for (let i = 0; i < 46; i++) dots += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(30 + r() * 110)}" fill="${cols[i % 4]}" opacity="${f(0.05 + r() * 0.16)}"/>`
      return wrap(
        `<radialGradient id="g" cx=".3" cy=".3" r="1"><stop offset="0" stop-color="#1d0f19"/><stop offset="1" stop-color="#0b0609"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="14"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${dots}</g>`)
    },
  },
]

const cache = new Map<string, string>()
export function wallpaperUrl(id: string) {
  if (!cache.has(id)) {
    const w = WALLPAPERS.find((x) => x.id === id)
    if (!w) return null
    cache.set(id, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(w.svg())}")`)
  }
  return cache.get(id)!
}

// ---------------- your own picture ----------------

/** Downscale to at most 2560 px on the long edge and re-encode, so a phone photo doesn't bloat storage. */
export async function prepareImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.86))
  return out ?? new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.86))
}

/** A soft, readable accent picked from the picture's most colourful hue. */
export async function accentFrom(src: Blob | string): Promise<string> {
  const img = new Image()
  img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  await img.decode()
  const c = document.createElement('canvas'); c.width = 64; c.height = 36
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, 64, 36)
  if (typeof src !== 'string') URL.revokeObjectURL(img.src)
  const px = ctx.getImageData(0, 0, 64, 36).data
  const bins = new Array(36).fill(0)
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, v] = hsv(px[i], px[i + 1], px[i + 2])
    if (s < 0.2 || v < 0.18) continue
    bins[Math.floor(h / 10) % 36] += s * v
  }
  const best = bins.indexOf(Math.max(...bins))
  if (bins[best] === 0) return '#9db4d6'
  return hslHex(best * 10 + 5, 0.72, 0.74)
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, max ? d / max : 0, max]
}
function hslHex(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const c = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0')
  return `#${c(0)}${c(8)}${c(4)}`
}
