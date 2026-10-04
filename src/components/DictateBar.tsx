import { Check, Loader2, Mic, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SegmentRecorder } from '../lib/recorder'
import { dictate, markdownToBlocks } from '../lib/voice'

/* eslint-disable @typescript-eslint/no-explicit-any */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Speak into the page you're writing: a small recording pill above the keyboard.
 * Stop → the words are transcribed (and tidied, if on) and inserted where the cursor was.
 */
export function DictateBar({ editor, onClose }: { editor: any; onClose: () => void }) {
  const rec = useRef<SegmentRecorder | null>(null)
  const anchor = useRef<any>(null)
  const [, tick] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [tidy, setTidy] = useState(() => { try { return localStorage.getItem('folio.dictateTidy') !== '0' } catch { return true } })

  useEffect(() => {
    try { anchor.current = editor.getTextCursorPosition().block } catch { anchor.current = null }
    const r = new SegmentRecorder(); r.onChange = () => tick((x) => x + 1)
    rec.current = r
    r.start().catch((e) => setError(e.name === 'NotAllowedError' ? 'Microphone access is off for this site.' : e.message))
    const t = window.setInterval(() => tick((x) => x + 1), 300)
    return () => { window.clearInterval(t); if (rec.current?.state !== 'stopped') rec.current?.discard() }
  }, [editor])

  const finish = async () => {
    const r = rec.current; if (!r) return
    const parts = await r.stop()
    if (!parts.length) { setError('Nothing was recorded.'); return }
    try {
      const md = await dictate(parts, tidy, setBusy)
      const blocks = await markdownToBlocks(md)
      const at = anchor.current && editor.getBlock(anchor.current.id) ? editor.getBlock(anchor.current.id) : editor.document[editor.document.length - 1]
      const isEmpty = at && at.type === 'paragraph' && (!at.content || at.content.length === 0)
      if (isEmpty) editor.replaceBlocks([at], blocks); else editor.insertBlocks(blocks, at, 'after')
      onClose()
    } catch (e) { setBusy(''); setError((e as Error).message) }
  }
  const setT = (v: boolean) => { setTidy(v); try { localStorage.setItem('folio.dictateTidy', v ? '1' : '0') } catch { /* ignore */ } }
  const r = rec.current
  const live = r?.state === 'recording'

  return createPortal(
    <div className="fixed inset-x-0 bottom-[calc(var(--kb,0px)+env(safe-area-inset-bottom)+14px)] z-[72] flex justify-center px-3" role="dialog" aria-label="Dictation">
      <div className="animate-pop flex w-full max-w-md items-center gap-2 rounded-full border border-line bg-raised/95 py-1.5 pl-3 pr-1.5 shadow-2xl backdrop-blur-xl">
        {error ? (
          <span className="min-w-0 flex-1 truncate text-[13px] text-danger">{error}</span>
        ) : busy ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] text-ink-2"><Loader2 size={16} className="animate-spin text-accent" />{busy}</span>
        ) : (
          <>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? 'rec-pulse bg-red-500' : 'bg-wash-2'}`} />
            <span className="font-mono text-[15px] tabular-nums">{clock(r?.elapsed ?? 0)}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{live ? 'Listening…' : 'Starting…'}</span>
            <button type="button" aria-pressed={tidy} onClick={() => setT(!tidy)} title="Tidy punctuation and filler words"
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] ${tidy ? 'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] text-accent' : 'text-muted'}`}><Sparkles size={13} /> Tidy</button>
          </>
        )}
        <button type="button" aria-label="Cancel dictation" onClick={() => { rec.current?.discard(); onClose() }} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-wash"><X size={18} /></button>
        {!error && !busy && <button type="button" aria-label="Insert dictation" onClick={finish} disabled={!live} className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-50"><Check size={19} strokeWidth={2.6} /></button>}
        {error && <button type="button" aria-label="Try again" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-wash"><Mic size={17} /></button>}
      </div>
    </div>, document.body)
}
