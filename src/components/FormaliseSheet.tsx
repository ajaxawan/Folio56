import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getVoiceSettings, STYLES, tooShort } from '../lib/voice'
import type { MemoStyle } from '../types'
import { Sheet } from './ui'

/** "Formalise with AI": pick what to turn the page (or its recording) into. */
export function FormaliseSheet({ fromRecording, getText, onRun, onClose, onSettings }: {
  fromRecording: boolean; getText: () => Promise<string>; onRun: (style: MemoStyle) => void; onClose: () => void; onSettings: () => void
}) {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { getVoiceSettings().then((s) => setHasKey(!!s.key)) }, [])
  const styles = STYLES.filter((s) => fromRecording || s.value !== 'transcript')
  const pick = async (style: MemoStyle) => {
    if (!fromRecording && tooShort(await getText())) { setMsg('There isn’t enough text on this page yet — write or paste your rough notes first.'); return }
    onClose(); onRun(style)
  }
  return (
    <Sheet label="Formalise with AI" onClose={onClose}>
      <div className="mb-1 flex items-center gap-2 text-[17px] font-semibold"><Sparkles size={18} className="text-accent" /> Formalise with AI</div>
      <p className="mb-3 text-[13px] leading-5 text-muted">
        {fromRecording ? 'Rewrite this page from its recording’s transcript.' : 'Turn the rough notes on this page into a clean write-up. Your original text is kept below it, folded away.'}
        {' '}The current version stays in history.
      </p>
      {hasKey === false ? (
        <div className="rounded-2xl bg-wash p-3 text-[13px] leading-5 text-ink-2">
          This uses Groq’s free API with your own key. <button type="button" onClick={() => { onClose(); onSettings() }} className="font-medium text-accent">Add a key in Settings</button>.
        </div>
      ) : (
        <div className="space-y-1.5">
          {styles.map((s) => (
            <button key={s.value} type="button" onClick={() => pick(s.value)} className="flex w-full flex-col rounded-2xl border border-line px-4 py-3 text-left hover:border-accent active:scale-[.99]">
              <span className="text-[15px] font-medium">{s.label}</span><span className="text-[12.5px] text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-[13px] text-star">{msg}</p>}
      <p className="mt-3 text-[11.5px] leading-4 text-faint">Sends this page’s text to Groq for this one request. Nothing else leaves your device.</p>
    </Sheet>
  )
}
