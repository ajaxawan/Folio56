import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FREE_MODELS, getVoiceSettings, saveVoiceSettings, testKey, VOICE_DEFAULTS, type VoiceSettings } from '../lib/voice'
import { Segmented, Switch } from './ui'

const LANGS: [string, string][] = [['', 'Detect automatically'], ['en', 'English'], ['ur', 'Urdu'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['pa', 'Punjabi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['zh', 'Chinese']]
const field = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent'

/** Settings → Voice & AI. Off until a key is added; the key never leaves this device except to Groq. */
export function VoicePanel() {
  const [s, setS] = useState<VoiceSettings>(VOICE_DEFAULTS)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { getVoiceSettings(true).then((v) => { setS(v); setKey(v.key) }) }, [])
  const set = (p: Partial<VoiceSettings>) => { setS((x) => ({ ...x, ...p })); saveVoiceSettings(p) }
  const check = async () => {
    const k = key.trim(); if (!k) { set({ key: '' }); setMsg('Key removed. Recordings will be saved as audio only.'); return }
    setMsg('Checking the key…')
    try {
      const models = await testKey(k); set({ key: k })
      const free = FREE_MODELS.filter((m) => models.includes(m.id)).map((m) => m.label)
      setMsg(`Key works ✓ ${models.some((m) => m.includes('whisper')) ? 'Speech-to-text is available. ' : ''}${free.length ? `Models: ${free.join(', ')}.` : ''}`)
    } catch (e) { setMsg((e as Error).message) }
  }
  const custom = !FREE_MODELS.some((m) => m.id === s.llm)
  const chosen = FREE_MODELS.find((m) => m.id === s.llm)
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-5 text-muted">
        Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-accent underline">console.groq.com</a> (no card needed).
        Audio or text goes to Groq only when you ask for a write-up.
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
      <label className="block text-[12px] text-muted">Main model
        <select value={custom ? '__custom' : s.llm} onChange={(e) => set({ llm: e.target.value === '__custom' ? '' : e.target.value })} className={`${field} mt-1`}>
          {FREE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note.toLowerCase()}{m.preview ? ' (preview)' : ''}</option>)}<option value="__custom">Another Groq model…</option>
        </select>
        {custom && <input aria-label="Model id" value={s.llm} onChange={(e) => set({ llm: e.target.value.trim() })} placeholder="model id from console.groq.com" className={`${field} mt-1.5 font-mono`} />}
        {chosen?.preview && <span className="mt-1 block text-[11.5px] leading-4 text-faint">Preview models can be changed or retired by Groq at short notice; Folio56 switches to GPT-OSS 120B if that happens.</span>}
      </label>
      <div>
        <Switch label="Let the other free models help when this one is busy" checked={s.spread !== false} onChange={(spread) => set({ spread })} />
        <p className="text-[11.5px] leading-4 text-faint">Each free model has its own per-minute allowance. With this on, presentations are designed by several models at once and you rarely wait. Scanned PDFs are always read by Qwen 3.8, the free model that can see.</p>
      </div>
      <Switch label="Keep the audio in the note after the write-up" checked={s.keepAudio} onChange={(keepAudio) => set({ keepAudio })} />
    </div>
  )
}
