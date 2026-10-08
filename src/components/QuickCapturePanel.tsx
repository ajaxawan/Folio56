import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { isIOS } from '../lib/mobile'
import { APP_PATH } from '../lib/paths'

/** Settings → Quick capture: links that open Folio straight into recording, a new note or a task. */
export function QuickCapturePanel() {
  const base = location.origin + APP_PATH.replace(/\/$/, '')
  const links: [string, string][] = [
    ['Record a voice memo', `${base}/?record=memo`],
    ['Speak today’s journal', `${base}/?record=journal`],
    ['New note', `${base}/?new=`],
    ['Add a task (text after =)', `${base}/?task=`],
    ['Open Tasks, ready to add', `${base}/?view=tasks&add=1`],
  ]
  const [copied, setCopied] = useState('')
  const copy = async (u: string) => { try { await navigator.clipboard.writeText(u) } catch { /* ignore */ } setCopied(u); setTimeout(() => setCopied(''), 1500) }
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] leading-5 text-muted">
        On Android, Windows and Mac, long-press (or right-click) the installed Folio icon for Voice memo, New note, Add a task and Journal.
        These links do the same from anywhere — a bookmark, a Shortcuts action, a home-screen button.
      </p>
      <ul className="overflow-hidden rounded-xl border border-line">
        {links.map(([label, url]) => (
          <li key={url} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
            <div className="min-w-0 flex-1"><div className="text-[13.5px]">{label}</div><div className="truncate font-mono text-[11.5px] text-faint">{url}</div></div>
            <button type="button" aria-label={`Copy link: ${label}`} onClick={() => copy(url)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-wash hover:text-ink">{copied === url ? <Check size={16} className="text-accent" /> : <Copy size={16} />}</button>
          </li>
        ))}
      </ul>
      {isIOS && (
        <p className="text-[12px] leading-5 text-faint">
          iPhone: in the Shortcuts app, make a shortcut with “Open URLs” and one of these links, then put it on the Action Button, Back Tap (Settings → Accessibility → Touch → Back Tap) or Control Centre.
          iOS opens these links in Safari, so they use the notes stored in Safari — not the Home Screen app’s.
        </p>
      )}
    </div>
  )
}
