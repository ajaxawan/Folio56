// V6.3: draw QR codes (always dark on white, with a quiet zone — what cameras read best) and read
// them back, with the browser's own detector when it has one and jsQR in a worker when it doesn't.
import QRCode from 'qrcode'

/** Draws `text` as a QR code filling a square canvas `px` CSS pixels wide. */
export function drawQr(canvas: HTMLCanvasElement, text: string, px: number, level: 'L' | 'M' | 'Q' = 'M') {
  const q = QRCode.create(text, { errorCorrectionLevel: level })
  const size = q.modules.size, quiet = 3, cells = size + quiet * 2
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  // whole device pixels per module: crisp edges read best
  const scale = Math.max(2, Math.floor((px * dpr) / cells))
  const side = cells * scale
  if (canvas.width !== side) { canvas.width = side; canvas.height = side }
  canvas.style.width = canvas.style.height = `${Math.round(side / dpr)}px`
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, side, side)
  g.fillStyle = '#000'
  const data = q.modules.data
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale)
  return q.version
}

type Reader = (img: ImageData) => Promise<string | null>

interface Detector { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } } }

let reader: Promise<Reader> | null = null
/** One shared QR reader for the session. */
export function qrReader(): Promise<Reader> {
  reader ??= (async () => {
    const BD = window.BarcodeDetector
    const formats: string[] = (await BD?.getSupportedFormats?.().catch(() => [] as string[])) ?? []
    if (BD && formats.includes('qr_code')) {
      const d = new BD({ formats: ['qr_code'] })
      return async (img) => (await d.detect(img).catch(() => []))[0]?.rawValue ?? null
    }
    const w = new Worker(new URL('./qrWorker.ts', import.meta.url), { type: 'module' })
    let id = 0
    const waits = new Map<number, (t: string | null) => void>()
    w.onmessage = (e: MessageEvent<{ id: number; text: string | null }>) => { waits.get(e.data.id)?.(e.data.text); waits.delete(e.data.id) }
    return (img) => new Promise((res) => { const n = ++id; waits.set(n, res); w.postMessage({ id: n, data: img.data, w: img.width, h: img.height }, [img.data.buffer]) })
  })()
  return reader
}

/** Reads a QR code from a picture file (a screenshot or a photo of one). */
export async function readQrFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file)
  const read = await qrReader()
  for (const max of [1200, 800, 2000]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k))
    const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, c.width, c.height)
    const t = await read(g.getImageData(0, 0, c.width, c.height))
    if (t) return t
  }
  return null
}
