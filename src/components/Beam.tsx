// V6.3 Folio Beam — notes from one screen to another camera, as QR codes. No server, no internet,
// no chat app in between. Small shares are one code any phone camera can open; bigger ones play as a
// short loop of codes that Folio on the other device reads with its camera.
import { Camera, ImageUp, Pause, Play, ScanLine } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BeamReceiver, beamSender, type BeamProgress } from '../lib/beam'
import { drawQr, qrReader, readQrFile } from '../lib/qr'
import { Segmented } from './ui'

/** Links up to this long fit in one code a phone camera reads easily. */
export const SINGLE_QR_MAX = 750
const SPEEDS = { steady: 5, fast: 9 } as const

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    const get = () => (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen').then((l) => { lock = l }).catch(() => {})
    get()
    const again = () => { if (document.visibilityState === 'visible') get() }
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); lock?.release().catch(() => {}) }
  }, [on])
}

const codeSize = () => Math.min(360, Math.max(220, window.innerWidth - 56))

// ---------------------------------------------------------------- sending

export function BeamSend({ bytes, link, hint }: { bytes: Uint8Array | null; link: string | null; hint?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const single = !!link && link.length <= SINGLE_QR_MAX
  const sender = useMemo(() => { try { return bytes && !single ? beamSender(bytes) : null } catch { return null } }, [bytes, single])
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('steady')
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  const tooBig = !!bytes && !single && !sender
  useWakeLock(!!(single || sender) && !paused)

  useEffect(() => { if (single && canvas.current && link) drawQr(canvas.current, link, codeSize(), 'L') }, [single, link])
  useEffect(() => {
    if (!sender || paused) return
    let s = step
    const tick = () => { if (canvas.current) drawQr(canvas.current, sender.frame(sender.order(s)), codeSize(), 'M'); s++; setStep(s) }
    tick()
    const t = window.setInterval(tick, 1000 / SPEEDS[speed])
    return () => window.clearInterval(t)
  }, [sender, speed, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!bytes) return <p className="text-[13px] text-muted">Packing…</p>
  if (tooBig) return <p className="text-[13.5px] text-warn">Too much to beam at once. Send fewer notes or leave the pictures out.</p>
  const seconds = sender ? Math.ceil(sender.n / SPEEDS[speed]) : 0
  return (
    <div className="space-y-3" data-testid="beam-send">
      <div className="flex justify-center">
        <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-line">
          <canvas ref={canvas} aria-label={single ? 'QR code with the link' : 'Folio Beam codes'} role="img" data-step={step} className="block [image-rendering:pixelated]" />
        </div>
      </div>
      {single ? (
        <p className="text-center text-[13px] leading-5 text-muted"><b className="text-ink">Scan with any phone camera</b> — it opens in Folio56. Or, in Folio on the other device, use <b className="text-ink">Receive with Beam</b>.</p>
      ) : sender && (
        <>
          <p className="text-center text-[13px] leading-5 text-muted">
            {hint ?? <>On the other device, open Folio56 and choose <b className="text-ink">Receive with Beam</b> (search, or the + menu on a phone). Point its camera here and hold still.</>}
          </p>
          {sender.n > 3 && <><div className="flex items-center gap-2">
            <div className="w-44"><Segmented value={speed} onChange={setSpeed} options={[{ value: 'steady', label: 'Steady' }, { value: 'fast', label: 'Fast' }]} /></div>
            <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'} className="rounded-lg bg-wash p-2 hover:bg-wash-2">{paused ? <Play size={15} /> : <Pause size={15} />}</button>
            <span className="ml-auto text-right text-[12px] tabular-nums text-faint">{sender.n} {sender.n === 1 ? 'code' : 'codes'} · about {seconds}s</span>
          </div>
          <p className="text-[12px] leading-[1.5] text-faint">Nothing is sent over the internet — the codes carry the notes. Missed a few? Keep pointing; any later code fills the gap.</p>
          </>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- receiving

export type BeamResult = { bytes: Uint8Array } | { link: string }

export function BeamScanner({ onResult }: { onResult: (r: BeamResult) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'starting' | 'scanning' | 'nocam'>('starting')
  const [why, setWhy] = useState('')
  const [prog, setProg] = useState<BeamProgress | null>(null)
  const [hint, setHint] = useState('')
  const rx = useRef(new BeamReceiver())
  const doneRef = useRef(false)
  const resultRef = useRef(onResult)
  useEffect(() => { resultRef.current = onResult })
  useWakeLock(state === 'scanning')

  const handle = (text: string | null) => {
    if (!text || doneRef.current) return
    const p = rx.current.add(text)
    if (p) {
      setProg(p); setHint('')
      if (p.done) { const b = rx.current.result(); if (b) { doneRef.current = true; resultRef.current({ bytes: b }) } }
      return
    }
    if (/#p=[A-Za-z0-9_.-]+/.test(text)) { doneRef.current = true; resultRef.current({ link: text }); return }
    setHint('That QR code isn’t from Folio56.')
  }

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stop = false, busy = false
    const c = document.createElement('canvas')
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use the camera here.')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = video.current!; v.srcObject = stream; await v.play().catch(() => {})
        setState('scanning')
        const read = await qrReader()
        const loop = async () => {
          if (stop) return
          raf = requestAnimationFrame(loop)
          if (busy || v.readyState < 2 || !v.videoWidth) return
          busy = true
          try {
            const k = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight))
            c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k)
            const g = c.getContext('2d', { willReadFrequently: true })!
            g.drawImage(v, 0, 0, c.width, c.height)
            const text = await read(g.getImageData(0, 0, c.width, c.height))
            // counters for tests and troubleshooting: frames looked at, codes read
            const d = root.current?.dataset; if (d) { d.tries = String(Number(d.tries ?? 0) + 1); if (text) d.reads = String(Number(d.reads ?? 0) + 1) }
            handle(text)
          } finally { busy = false }
        }
        loop()
      } catch (e) {
        const name = (e as Error).name
        setWhy(name === 'NotAllowedError' ? 'Camera access was turned down. Allow it in the browser’s site settings, or use a picture of the code.' : name === 'NotFoundError' ? 'No camera found on this device. You can use a picture of the code instead.' : (e as Error).message || 'The camera couldn’t start.')
        setState('nocam')
      }
    })()
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fromPicture = async (f: File) => {
    setHint('Reading the picture…')
    const t = await readQrFile(f).catch(() => null)
    if (!t) return setHint('No QR code found in that picture.')
    handle(t)
    if (t.startsWith('FB:') && !doneRef.current) setHint('That picture holds one Beam code of many — scan the moving codes with the camera instead.')
  }

  const pct = prog ? Math.round((prog.have / prog.n) * 100) : 0
  return (
    <div ref={root} className="space-y-3" data-testid="beam-scan" data-codes={prog?.codes ?? 0}>
      {state !== 'nocam' ? (
        <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,.25)]" />
          {state === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-[13px] text-white/80">Starting the camera…</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line px-4 py-6 text-center">
          <Camera size={26} className="text-muted" />
          <p className="text-[13.5px] text-ink-2">{why}</p>
        </div>
      )}
      <div role="status" aria-live="polite" className="space-y-1.5">
        {prog && !prog.done ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-wash"><div className="beam-fill h-full w-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${pct / 100})` }} /></div>
            <p className="text-center text-[13px] tabular-nums text-ink-2">Receiving · {prog.have} of {prog.n} · {pct}%</p>
          </>
        ) : (hint || state !== 'nocam') && (
          <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-muted"><ScanLine size={14} /> {hint || 'Point the camera at the code on the other screen.'}</p>
        )}
        {prog && !prog.done && hint && <p className="text-center text-[12px] text-faint">{hint}</p>}
      </div>
      <div className="flex justify-center">
        <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-lg bg-wash px-3 py-2 text-[13px] hover:bg-wash-2"><ImageUp size={15} /> Use a picture of a code</button>
        <input ref={file} type="file" accept="image/*" hidden aria-label="Picture of a QR code" onChange={(e) => { const f = e.target.files?.[0]; if (f) fromPicture(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
