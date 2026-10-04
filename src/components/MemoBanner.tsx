import { AlertTriangle, CheckCheck, KeyRound, Loader2, Mic, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { applyFollowUp, getVoiceSettings, isProcessing, processMemo, saveVoiceSettings, STYLES, testKey } from '../lib/voice'
import { patchNote } from '../lib/db'
import type { Note } from '../types'

/** Status strip at the top of a voice-memo page: working, needs a key, or failed (with retry). */
export function MemoBanner({ note }: { note: Note }) {
  const m = note.memo
  const [keyText, setKeyText] = useState('')
  const [msg, setMsg] = useState('')
  const [hasKey, setHasKey] = useState(true)
  useEffect(() => { getVoiceSettings().then((s) => setHasKey(!!s.key)) }, [m?.status])
  if (m?.status === 'done' && m.followUp && !m.followUp.applied) {
    const done = m.followUp.items.filter((i) => i.status === 'done')
    const open = m.followUp.items.filter((i) => i.status !== 'done')
    return (
      <div className="mx-[22px] mb-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 sm:mx-[54px]">
        <div className="flex items-center gap-2 text-[14px] font-medium text-ink"><CheckCheck size={17} className="text-success" /> Follow-up from “{m.followUp.fromTitle}”</div>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">
          {done.length ? `${done.length} of ${m.followUp.items.length} open ${m.followUp.items.length === 1 ? 'item sounds' : 'items sound'} done in this meeting.` : 'None of last meeting’s open items were reported done.'}
          {open.length ? ` ${open.length} still open — they stay in Tasks.` : ''}
        </p>
        {done.length > 0 && <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-2">{done.map((i) => <li key={i.index}>✓ {i.text}</li>)}</ul>}
        <div className="mt-2.5 flex gap-2">
          {done.length > 0 && <button type="button" onClick={() => applyFollowUp(note.id)} className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-[13px] font-medium text-white">Tick {done.length === 1 ? 'it' : `all ${done.length}`} off</button>}
          <button type="button" onClick={() => patchNote(note.id, { memo: { ...m, followUp: { ...m.followUp!, applied: true } } })} className="rounded-lg px-3 py-1.5 text-[13px] text-muted hover:bg-wash">Dismiss</button>
        </div>
      </div>
    )
  }
  if (!m || m.status === 'done') return null
  const working = (m.status === 'transcribing' || m.status === 'writing') && isProcessing(note.id)
  const stuck = (m.status === 'transcribing' || m.status === 'writing') && !isProcessing(note.id)
  const label = STYLES.find((s) => s.value === m.style)?.label ?? 'write-up'

  if (working) {
    return (
      <div role="status" className="mx-[22px] mb-3 flex items-center gap-3 rounded-2xl border border-accent/30 bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] px-4 py-3 sm:mx-[54px]">
        <Loader2 size={18} className="shrink-0 animate-spin text-accent" />
        <div className="min-w-0 text-[14px]">
          <div className="font-medium text-ink">{m.status === 'transcribing' ? 'Transcribing your recording' : `Writing the ${label.toLowerCase()}`}</div>
          <div className="truncate text-[12.5px] text-muted">{m.progress ?? 'This usually takes a few seconds.'} You can leave this page.</div>
        </div>
      </div>
    )
  }
  const retry = () => { setMsg(''); void processMemo(note.id) }
  if (m.status === 'recorded' && !hasKey) {
    return (
      <div className="mx-[22px] mb-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:mx-[54px]">
        <div className="flex items-center gap-2 text-[14px] font-medium"><Mic size={16} className="text-accent" /> Recording saved</div>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">Add your free Groq key to turn it into {label.toLowerCase()}. Get one at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-accent underline">console.groq.com/keys</a> — it stays on this device.</p>
        <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const k = keyText.trim(); if (!k) return; setMsg('Checking…'); try { await testKey(k); await saveVoiceSettings({ key: k }); setHasKey(true); setMsg(''); void processMemo(note.id) } catch (err) { setMsg((err as Error).message) } }}>
          <input aria-label="Groq API key" value={keyText} onChange={(e) => setKeyText(e.target.value)} placeholder="gsk_…" autoComplete="off" spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[13px] outline-none focus:border-accent" />
          <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-on-accent"><KeyRound size={14} /> Save</button>
        </form>
        {msg && <p className="mt-1.5 text-[12.5px] text-ink-2">{msg}</p>}
      </div>
    )
  }
  return (
    <div className={`mx-[22px] mb-3 flex items-start gap-3 rounded-2xl border px-4 py-3 sm:mx-[54px] ${m.status === 'error' ? 'border-red-400/30 bg-red-500/10' : 'border-line bg-surface'}`}>
      {m.status === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" /> : <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />}
      <div className="min-w-0 flex-1 text-[13.5px]">
        <div className="font-medium text-ink">{m.status === 'error' ? 'The write-up didn’t finish' : stuck ? 'The write-up was interrupted' : `Ready to write ${label.toLowerCase()}`}</div>
        {m.error && <div className="mt-0.5 text-[12.5px] leading-5 text-muted">{m.error}</div>}
        {m.transcript && m.status === 'error' && <div className="mt-0.5 text-[12px] text-faint">The transcript is saved, so trying again won’t re-upload the audio.</div>}
      </div>
      <button type="button" onClick={retry} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent"><RefreshCw size={14} /> {m.status === 'recorded' ? 'Start' : 'Try again'}</button>
    </div>
  )
}
