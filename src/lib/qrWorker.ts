// Reads QR codes off the main thread for browsers without a built-in barcode detector.
import jsQR from 'jsqr'

self.onmessage = (e: MessageEvent<{ id: number; data: Uint8ClampedArray; w: number; h: number }>) => {
  const { id, data, w, h } = e.data
  let text: string | null = null
  try { text = jsQR(data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null } catch { /* unreadable frame */ }
  ;(self as unknown as Worker).postMessage({ id, text })
}
