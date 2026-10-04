import { Check, Copy, Mail, MessageCircle, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toChat, toEmail } from '../lib/message'
import { Segmented, Sheet, Switch } from './ui'

/** Copy a note as a chat message or an email — formatted for where it's going. */
export function CopySheet({ title, getMarkdown, hasFolded, onClose }: { title: string; getMarkdown: (includeFolded: boolean) => Promise<string>; hasFolded: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<'chat' | 'email'>('chat')
  const [folded, setFolded] = useState(false)
  const [md, setMd] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { getMarkdown(folded).then(setMd) }, [folded, getMarkdown])
  const chat = toChat(title, md)
  const mail = toEmail(title, md)
  const text = kind === 'chat' ? chat : `${mail.subject}\n\n${mail.body}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  const canShare = typeof navigator.share === 'function'
  return (
    <Sheet label="Copy as message" onClose={onClose} className="sm:max-w-lg">
      <div className="mb-3 text-[17px] font-semibold">Copy as message</div>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'chat', label: <span className="flex items-center justify-center gap-1.5"><MessageCircle size={15} /> WhatsApp / chat</span> }, { value: 'email', label: <span className="flex items-center justify-center gap-1.5"><Mail size={15} /> Email</span> }]} />
      {hasFolded && <div className="mt-2"><Switch label="Include transcript / original notes" checked={folded} onChange={setFolded} /></div>}
      <pre aria-label="Preview" className="mt-3 max-h-[42dvh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas/60 p-3 font-sans text-[13px] leading-5 text-ink-2">{text}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent">{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}</button>
        {canShare && <button type="button" onClick={() => navigator.share(kind === 'email' ? { title: mail.subject, text: mail.body } : { text: chat }).catch(() => {})} className="flex items-center justify-center gap-2 rounded-xl bg-wash px-4 py-2.5 text-[14px] hover:bg-wash-2"><Share2 size={16} /> Share…</button>}
        {kind === 'email' && <a href={`mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body.slice(0, 1800))}`} className="flex items-center justify-center gap-2 rounded-xl bg-wash px-4 py-2.5 text-[14px] hover:bg-wash-2"><Mail size={16} /> Open mail app</a>}
      </div>
    </Sheet>
  )
}
