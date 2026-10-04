import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getVoiceSettings, saveVoiceSettings, testKey, VOICE_DEFAULTS, type VoiceSettings } from '../lib/voice'
import { Segmented, Switch } from './ui'

const LANGS: [string, string][] = [['', 'Detect automatically'], ['en', 'English'], ['ur', 'Urdu'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['pa', 'Punjabi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['zh', 'Chinese']]
const LLMS: [string, string][] = [['openai/gpt-oss-120b', 'GPT-OSS 120B — best write-ups'], ['openai/gpt-oss-20b', 'GPT-OSS 20B — faster']]
const field = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent'

/** Settings → Voice & AI. Off until a key is added; the key never leaves this device except to Groq. */
export function VoicePanel() {
  const [s, setS] = useState<VoiceSettings>(VOICE_DEFAULTS)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { getVoiceSettings().then((v) => { setS(v); setKey(v.key) }) }, [])
  const set = (p: Partial<VoiceSettings>) => { setS((x) => ({ ...x, ...p })); saveVoiceSettings(p) }
  const check = async () => {
    const k = key.trim(); if (!k) { set({ key: '' }); setMsg('Key removed. Recordings will be saved as audio only.'); return }
    setMsg('Checking the key…')
    try { const models = await testKey(k); set({ key: k }); setMsg(`Key works ✓ ${models.some((m) => m.includes('whisper')) ? 'Speech-to-text is available.' : ''}`) } catch (e) { setMsg((e as Error).message) }
  }
  const custom = !LLMS.some(([v]) => v === s.llm)
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-5 text-muted">
        Record voice memos and meetings, then turn them — or any rough notes — into clean Markdown and meeting minutes.
        Uses <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-accent underline">Groq’s free API</a> with your own key (no card needed).
        Audio or text goes to Groq only when you ask for a write-up; everything else stays on this device.
      </p>
      <div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input aria-label="Groq API key" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your Groq key (gsk_…)" autoComplete="off" spellCheck={false} className={`${field} pr-10 font-mono`} />
            <button type="button" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
          <button type="button" onClick={check} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-wash px-3 text-[13.5px] hover:bg-wash-2"><KeyRound size={15} /> {s.key && key.trim() === s.key ? 'Test' : 'Save'}</button>
        </div>
        {msg && <p className="mt-1.5 text-[12.5px] text-ink-2">{msg}</p>}
        {!s.key && !msg && <p className="mt-1.5 text-[12px] text-faint">Without a key you can still record — Folio keeps the audio, and you can write it up later.</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-muted">Spoken language
          <select value={s.language} onChange={(e) => set({ language: e.target.value })} className={`${field} mt-1`}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="text-[12px] text-muted">Write-up language
          <select value={s.output} onChange={(e) => set({ output: e.target.value as VoiceSettings['output'] })} className={`${field} mt-1`}><option value="same">Same as spoken</option><option value="en">Always English</option></select>
        </label>
      </div>
      <div>
        <div className="mb-1 text-[12px] text-muted">Transcription</div>
        <Segmented value={s.stt} onChange={(stt) => set({ stt })} options={[{ value: 'whisper-large-v3', label: 'Most accurate' }, { value: 'whisper-large-v3-turbo', label: 'Fastest' }]} />
      </div>
      <label className="block text-[12px] text-muted">Writing model
        <select value={custom ? '__custom' : s.llm} onChange={(e) => set({ llm: e.target.value === '__custom' ? '' : e.target.value })} className={`${field} mt-1`}>
          {LLMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="__custom">Another Groq model…</option>
        </select>
        {custom && <input aria-label="Model id" value={s.llm} onChange={(e) => set({ llm: e.target.value.trim() })} placeholder="model id from console.groq.com" className={`${field} mt-1.5 font-mono`} />}
      </label>
      <Switch label="Keep the audio in the note after the write-up" checked={s.keepAudio} onChange={(keepAudio) => set({ keepAudio })} />
    </div>
  )
}
