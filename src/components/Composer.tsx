import { CheckSquare, Image as ImageIcon, LayoutTemplate, Mic, Palette, Pin, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { surface } from '../lib/colors'
import { createNote } from '../lib/db'
import { fileToDataUrl, pickFile } from '../lib/image'
import { putImage } from '../lib/blobs'
import { usePrefs } from '../lib/prefs'
import { checklistToBlocks, textToBlocks } from '../lib/preview'
import type { ColorKey, Note } from '../types'
import { ColorPicker } from './ColorPicker'
import { IconButton, Popover } from './ui'

/** The Keep "Take a note…" bar. Collapsed pill → expands into a quick note or list. */
export function Composer({ onOpen, labelId, onTemplates, onVoice }: { onOpen: (id: string) => void; labelId?: string; onTemplates: () => void; onVoice?: () => void }) {
  const { prefs, dark } = usePrefs()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'list'>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [items, setItems] = useState<string[]>([''])
  const [color, setColor] = useState<ColorKey>('default')
  const [pinned, setPinned] = useState(false)
  const [palette, setPalette] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const reset = () => { setOpen(false); setMode('text'); setTitle(''); setText(''); setItems(['']); setColor('default'); setPinned(false); setPalette(false) }

  const save = async () => {
    const content = mode === 'list' ? checklistToBlocks(items) : text.trim() ? textToBlocks(text) : []
    if (title.trim() || content.length) await createNote({ title: title.trim(), content, color, pinned, labels: labelId ? [labelId] : [] })
    reset()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-popover]')) save()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  })

  const quick = async (partial: Partial<Note>) => {
    const n = await createNote({ ...partial, labels: labelId ? [labelId] : [] })
    onOpen(n.id)
  }
  const addImage = async () => {
    const f = await pickFile(); if (!f) return
    const url = await putImage(await fileToDataUrl(f))
    await quick({ content: [{ type: 'image', props: { url, name: f.name } }, { type: 'paragraph' }] })
  }

  if (!open) {
    return (
      <div className="mx-auto flex w-full max-w-[600px] items-center rounded-full border border-line bg-surface pl-5 pr-1.5 transition-colors focus-within:border-accent hover:border-accent/50 [&_button:hover_svg]:text-accent">
        <button type="button" onClick={() => setOpen(true)} className="h-[52px] flex-1 text-left text-[15px] text-muted">Take a note…</button>
        <IconButton label="New list" onClick={() => { setMode('list'); setOpen(true) }}><CheckSquare size={20} /></IconButton>
        <IconButton label="From template" onClick={onTemplates}><LayoutTemplate size={20} /></IconButton>
        <IconButton label="Note with image" onClick={addImage}><ImageIcon size={20} /></IconButton>
        {onVoice && <IconButton label="Voice memo (V)" onClick={onVoice}><Mic size={20} /></IconButton>}
      </div>
    )
  }

  const s = surface(color, dark, prefs.cardStyle)
  return (
    <div ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); save() } }} className="animate-pop mx-auto w-full max-w-[600px] rounded-2xl border shadow-2xl shadow-black/30"
      style={{ background: s.background, borderColor: s.borderColor, boxShadow: prefs.cardStyle === 'subtle' && color !== 'default' ? `inset 3px 0 0 ${s.accent}` : undefined }}>
      <div className="flex items-start gap-2 px-4 pt-3">
        <input autoFocus={mode === 'list'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title"
          className="flex-1 bg-transparent py-1 text-[16px] font-semibold text-ink outline-none placeholder:text-muted" />
        <IconButton size="sm" label={pinned ? 'Unpin' : 'Pin'} active={pinned} onClick={() => setPinned(!pinned)}>
          <Pin size={17} className={pinned ? 'fill-current' : ''} />
        </IconButton>
      </div>
      {mode === 'text' ? (
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Take a note…" aria-label="Note text" rows={Math.min(12, Math.max(2, text.split('\n').length))}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
          className="block w-full resize-none bg-transparent px-4 py-2 text-[15px] leading-6 text-ink-2 outline-none placeholder:text-muted" />
      ) : (
        <div className="px-3 py-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <Square size={17} className="shrink-0 text-muted" />
              <input value={it} placeholder="List item" aria-label="List item" autoFocus={i === items.length - 1 && i > 0}
                onChange={(e) => { const next = [...items]; next[i] = e.target.value; if (i === items.length - 1 && e.target.value) next.push(''); setItems(next) }}
                className="flex-1 bg-transparent py-1 text-[15px] text-ink-2 outline-none placeholder:text-muted" />
              {it && <button type="button" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-muted hover:text-ink"><X size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 px-2 pb-2">
        <div className="relative">
          <IconButton size="sm" label="Background" onClick={() => setPalette(!palette)}><Palette size={18} /></IconButton>
          <Popover open={palette} onClose={() => setPalette(false)} className="left-0 top-10"><ColorPicker value={color} onChange={setColor} /></Popover>
        </div>
        <IconButton size="sm" label={mode === 'text' ? 'Show checkboxes' : 'Hide checkboxes'} onClick={() => {
          if (mode === 'text') { setItems([...text.split('\n').filter(Boolean), '']); setMode('list') }
          else { setText(items.filter(Boolean).join('\n')); setMode('text') }
        }}><CheckSquare size={18} /></IconButton>
        <div className="flex-1" />
        <button type="button" onClick={save} className="rounded-lg px-5 py-2 text-[14px] font-medium text-ink hover:bg-wash">Close</button>
      </div>
    </div>
  )
}
