// Microphone recording in self-contained pieces.
// Every few minutes a fresh MediaRecorder takes over (started before the old one stops, so no
// words fall in the gap). Each piece is a complete audio file: small enough to send on its own,
// and if iOS cuts the recording short (screen locked, app switched), everything up to that
// moment is already safe.

const SEGMENT_MS = 5 * 60 * 1000

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)
  const order = safari
    ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return order.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? ''
}

export type RecState = 'idle' | 'recording' | 'paused' | 'interrupted' | 'stopped'

export class SegmentRecorder {
  stream: MediaStream | null = null
  segments: Blob[] = []
  state: RecState = 'idle'
  private rec: MediaRecorder | null = null
  private mime = pickMime()
  private timer = 0
  private startedAt = 0
  private elapsedBefore = 0
  private pending: Promise<void>[] = []
  onChange: () => void = () => {}

  /** Seconds recorded so far (pauses excluded). */
  get elapsed() { return this.elapsedBefore + (this.state === 'recording' ? (Date.now() - this.startedAt) / 1000 : 0) }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t record audio. On iPhone, open Folio in Safari.')
    if (typeof MediaRecorder === 'undefined') throw new Error('This browser can’t record audio.')
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    // iOS ends the microphone track when Folio goes to the background.
    this.stream.getAudioTracks().forEach((t) => { t.onended = () => { if (this.state === 'recording' || this.state === 'paused') this.interrupt() } })
    this.begin()
    this.startedAt = Date.now()
    this.state = 'recording'
    this.timer = window.setInterval(() => this.rotate(), SEGMENT_MS)
    this.onChange()
  }

  private begin() {
    if (!this.stream) return
    const rec = new MediaRecorder(this.stream, { ...(this.mime ? { mimeType: this.mime } : {}), audioBitsPerSecond: 48000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    this.pending.push(new Promise<void>((done) => {
      rec.onstop = () => { if (chunks.length) this.segments.push(new Blob(chunks, { type: rec.mimeType || this.mime || 'audio/mp4' })); done() }
    }))
    rec.start(1000)
    this.rec = rec
  }

  /** Hand over to a fresh recorder (the new one starts first, so nothing is lost in between). */
  private rotate() {
    if (this.state !== 'recording' || !this.rec) return
    const old = this.rec
    this.begin()
    try { old.stop() } catch { /* already stopped */ }
  }

  pause() { if (this.rec?.state === 'recording') { this.rec.pause(); this.elapsedBefore = this.elapsed; this.state = 'paused'; this.onChange() } }
  resume() { if (this.rec?.state === 'paused') { this.rec.resume(); this.startedAt = Date.now(); this.state = 'recording'; this.onChange() } }

  private interrupt() {
    this.elapsedBefore = this.elapsed
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop() } catch { /* ignore */ }
    this.rec = null
    window.clearInterval(this.timer)
    this.releaseMic()
    this.state = 'interrupted'
    this.onChange()
  }

  /** Carry on after an interruption: a new piece joins the same memo. */
  async continue() {
    const before = this.elapsedBefore
    await this.start()
    this.elapsedBefore = before
  }

  /** Finish and return every piece, in order. */
  async stop(): Promise<Blob[]> {
    window.clearInterval(this.timer)
    if (this.state === 'recording' || this.state === 'paused') this.elapsedBefore = this.elapsed
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop() } catch { /* ignore */ }
    this.rec = null
    await Promise.all(this.pending)
    this.releaseMic()
    this.state = 'stopped'
    this.onChange()
    return this.segments
  }

  discard() {
    window.clearInterval(this.timer)
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop() } catch { /* ignore */ }
    this.releaseMic()
    this.segments = []
    this.state = 'stopped'
  }

  private releaseMic() { this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop() }); this.stream = null }
}
