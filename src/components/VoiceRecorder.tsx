import { Check, KeyRound, Mic, Pause, Play, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isIOS, isPhone } from '../lib/mobile'
import { SegmentRecorder } from '../lib/recorder'
import { useAI } from '../lib/prefs'
import { getVoiceSettings, saveJournalEntry, saveRecording, saveVoiceSettings, STYLES, testKey } from '../lib/voice'
import type { MemoStyle } from '../types'
import { SeriesPicker } from './SeriesSheet'

const clock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}` }

/** Full-screen (phone) / centred (desktop) recorder. Saves a note with the audio, then writes it up. */
export function VoiceRecorder({ labelIds, onClose, onSaved, journal }: { labelIds: string[]; onClose: () => void; onSaved: (id: string) => void; journal?: boolean }) {
  const rec = useRef<SegmentRecorder | null>(null)
  const [, force] = useState(0)
  const ai = useAI()
  const [style, setStyle] = useState<MemoStyle>('minutes')
  const [series, setSeries] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const audio = useRef<{ ctx: AudioContext; an: AnalyserNode; raf: number } | null>(null)
  const wake = useRef<{ release: () => Promise<void> } | null>(null)
  const phone = isPhone()

  useEffect(() => { getVoiceSettings().then((s) => { setStyle(s.style); setHasKey(!!s.key) }) }, [])
  // tick the clock
  useEffect(() => { const t = window.setInterval(() => force((x) => x + 1), 250); return () => window.clearInterval(t) }, [])
  // leaving without saving: release the mic
  useEffect(() => () => { rec.current?.discard(); stopMeter(); void wake.current?.release().catch(() => {}) }, [])

  const r = rec.current
  const state = r?.state ?? 'idle'
  const live = state === 'recording' || state === 'paused'

  const meter = (stream: MediaStream) => {
    stopMeter()
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC(); ctx.resume?.().catch(() => {}); const an = ctx.createAnalyser(); an.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(an)
    const data = new Uint8Array(an.fftSize)
    const bars: number[] = Array(48).fill(0)
    const draw = () => {
      const c = canvas.current
      if (c) {
        an.getByteTimeDomainData(data)
        let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128)
        bars.push(rec.current?.state === 'recording' ? Math.min(1, peak * 2.2) : 0); bars.shift()
        const g = c.getContext('2d')!; const w = c.width, h = c.height
        g.clearRect(0, 0, w, h)
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#7aa9ff'
        const bw = w / bars.length
        bars.forEach((b, i) => {
          const bh = Math.max(3 * devicePixelRatio, b * h * 0.9)
          g.fillStyle = accent; g.globalAlpha = 0.35 + 0.65 * (i / bars.length)
          const x = i * bw + bw * 0.2, y = (h - bh) / 2
          g.beginPath(); g.roundRect?.(x, y, bw * 0.6, bh, bw * 0.3); if (!g.roundRect) g.rect(x, y, bw * 0.6, bh); g.fill()
        })
      }
      audio.current!.raf = requestAnimationFrame(draw)
    }
    audio.current = { ctx, an, raf: requestAnimationFrame(draw) }
  }
  const stopMeter = () => { if (audio.current) { cancelAnimationFrame(audio.current.raf); audio.current.ctx.close().catch(() => {}); audio.current = null } }
  const keepAwake = async () => { try { wake.current = await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* not allowed */ } }

  const start = async () => {
    setError('')
    const sr = new SegmentRecorder(); sr.onChange = () => force((x) => x + 1)
    try {
      await sr.start()
      rec.current = sr
      if (sr.stream) meter(sr.stream)
      keepAwake()
      saveVoiceSettings({ style })
    } catch (e) {
      const n = (e as Error).name
      setError(n === 'NotAllowedError' ? (isIOS ? 'Microphone access is off. In Safari, tap “aA” → Website Settings → Microphone → Allow, then try again.' : 'Microphone access was blocked. Allow it in the browser’s site settings, then try again.') : (e as Error).message)
    }
  }
  const resumeAfterInterrupt = async () => {
    try { await rec.current!.continue(); if (rec.current!.stream) meter(rec.current!.stream); keepAwake() } catch (e) { setError((e as Error).message) }
  }
  // Coming back to Folio after iOS paused things: re-take the screen lock.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible' && rec.current?.state === 'recording') keepAwake() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  const finish = async () => {
    if (!rec.current) return
    setSaving(true)
    const secs = rec.current.elapsed
    const parts = await rec.current.stop()
    stopMeter(); void wake.current?.release().catch(() => {})
    if (!parts.length || secs < 1) { setSaving(false); setError('Nothing was recorded.'); rec.current = null; return }
    if (journal) { const d = await saveJournalEntry(parts, secs, setProgress); onSaved(d.id); return }
    const note = await saveRecording(parts, secs, style, labelIds, !ai || style === 'transcript' ? null : series)
    onSaved(note.id)
  }
  const discard = () => {
    if (live && rec.current!.elapsed > 5 && !confirm('Discard this recording?')) return
    rec.current?.discard(); stopMeter(); onClose()
  }
  const saveKey = async () => {
    const k = keyText.trim(); if (!k) return
    setKeyMsg('Checking…')
    try { await testKey(k); await saveVoiceSettings({ key: k }); setHasKey(true); setKeyOpen(false); setKeyMsg('') } catch (e) { setKeyMsg((e as Error).message) }
  }

  const body = (
    <div role="dialog" aria-modal="true" aria-label="Voice memo"
      className={`flex flex-col bg-pop text-ink ${phone ? 'animate-sheet h-full w-full pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),16px)]' : 'animate-pop w-full max-w-md rounded-3xl border border-line p-2 shadow-2xl'}`}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.14em] text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${state === 'recording' ? 'rec-pulse bg-red-500' : state === 'paused' ? 'bg-amber-400' : 'bg-wash-2'}`} />
          {state === 'recording' ? 'Recording' : state === 'paused' ? 'Paused' : state === 'interrupted' ? 'Interrupted' : journal ? 'Today’s journal' : 'Voice memo'}
        </span>
        <button type="button" aria-label="Close" onClick={discard} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-wash"><X size={20} /></button>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 ${phone ? '[justify-content:safe_center] py-2' : 'pb-4 pt-2'}`}>
        <div className="font-mono text-[56px] font-light tabular-nums tracking-tight" aria-live="off">{clock(r?.elapsed ?? 0)}</div>
        <canvas ref={canvas} width={720} height={160} className={`mt-2 h-20 w-full max-w-sm transition-opacity ${live ? 'opacity-100' : 'opacity-30'}`} aria-hidden />

        {state === 'idle' && (
          <>
            {journal && <p className="mt-4 max-w-xs text-center text-[14px] leading-6 text-ink-2">{ai ? 'Talk about your day. Folio writes it up in your own voice and adds it to today’s note — to-dos become tasks.' : 'Talk about your day. The recording is added to today’s note.'}</p>}
            {!ai && !journal && <p className="mt-4 max-w-xs text-center text-[14px] leading-6 text-ink-2">The recording is saved as an audio note you can play back, title and put in a notebook.</p>}
            <div className={`mt-4 w-full max-w-sm space-y-1.5 ${journal || !ai ? 'hidden' : ''}`} role="radiogroup" aria-label="What to make from it">
              {STYLES.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={style === s.value} onClick={() => setStyle(s.value)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${style === s.value ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'border-line hover:border-muted/60'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${style === s.value ? 'border-accent' : 'border-muted'}`}>{style === s.value && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
                  <span><span className="block text-[14.5px] font-medium">{s.label}</span><span className="block text-[12px] text-muted">{s.hint}</span></span>
                </button>
              ))}
            </div>
            {ai && style === 'minutes' && !journal && (
              <div className="mt-3 w-full max-w-sm">
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[.08em] text-faint">Recurring meeting?</div>
                <SeriesPicker value={series} onChange={setSeries} />
                {series && <p className="mt-1.5 text-[12px] leading-4 text-muted">Folio will check last time's open action items against this meeting.</p>}
              </div>
            )}
            {ai && hasKey === false && (
              <div className="mt-3 w-full max-w-sm rounded-2xl bg-wash p-3 text-[12.5px] leading-5 text-muted">
                {!keyOpen ? (
                  <>Without a Groq key, Folio keeps the audio only. <button type="button" onClick={() => setKeyOpen(true)} className="font-medium text-accent">Add a free key</button> to get the write-up.</>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); saveKey() }} className="space-y-2">
                    <p>Make a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-accent underline">console.groq.com/keys</a> (no card needed), then paste it here. It stays on this device.</p>
                    <div className="flex gap-2">
                      <input aria-label="Groq API key" value={keyText} onChange={(e) => setKeyText(e.target.value)} placeholder="gsk_…" autoComplete="off" spellCheck={false}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent" />
                      <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-on-accent"><KeyRound size={14} /> Save</button>
                    </div>
                    {keyMsg && <p className="text-ink-2">{keyMsg}</p>}
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {state === 'interrupted' && (
          <p className="mt-4 max-w-sm text-center text-[14px] leading-6 text-ink-2">The recording stopped when Folio left the screen. What you recorded is safe — carry on, or save it now.</p>
        )}
        {live && isIOS && <p className="mt-4 max-w-xs text-center text-[12.5px] leading-5 text-faint">Keep Folio open. iPhone stops recording if you lock the screen or switch apps.</p>}
        {error && <p role="alert" className="mt-4 max-w-sm rounded-xl bg-red-500/10 px-3 py-2 text-center text-[13px] leading-5 text-danger">{error}</p>}
      </div>

      <div className="flex items-center justify-center gap-6 px-5 pb-3 pt-4">
        {state === 'idle' && (
          <button type="button" onClick={start} aria-label="Start recording" className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-900/40 ring-4 ring-red-500/20 transition-transform active:scale-90"><Mic size={32} /></button>
        )}
        {(live || state === 'interrupted') && (
          <>
            <button type="button" onClick={discard} aria-label="Discard" className="flex h-14 w-14 items-center justify-center rounded-full bg-wash text-ink-2 active:scale-90"><Trash2 size={21} /></button>
            {state === 'interrupted'
              ? <button type="button" onClick={resumeAfterInterrupt} aria-label="Continue recording" className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-red-500 text-white shadow-xl active:scale-90"><Mic size={30} /></button>
              : <button type="button" onClick={() => (state === 'recording' ? r!.pause() : r!.resume())} aria-label={state === 'recording' ? 'Pause' : 'Resume'}
                  className={`flex h-[76px] w-[76px] items-center justify-center rounded-full text-white shadow-xl active:scale-90 ${state === 'recording' ? 'rec-pulse bg-red-500' : 'bg-amber-500'}`}>{state === 'recording' ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}</button>}
            <button type="button" onClick={finish} disabled={saving} aria-label="Save recording" className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent active:scale-90 disabled:opacity-60"><Check size={24} strokeWidth={2.6} /></button>
          </>
        )}
      </div>
      {(live || state === 'interrupted') && <p className="pb-2 text-center text-[12px] text-faint">{saving ? (progress || 'Saving…') : journal ? 'Tap ✓ to add it to today' : !ai ? 'Tap ✓ to save the recording' : `Tap ✓ to save · ${STYLES.find((s) => s.value === style)?.label}`}</p>}
    </div>
  )

  return createPortal(
    <div className={`animate-fade fixed inset-0 z-[75] flex bg-scrim ${phone ? '' : 'items-center justify-center p-4'}`}>{body}</div>,
    document.body,
  )
}
