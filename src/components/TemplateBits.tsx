import { LayoutTemplate } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { EMOJI } from '../lib/colors'
import { ALL_CATEGORIES, AUTO_HELP, MY, templateFromNote, updateTemplate } from '../lib/templateKit'
import { toast } from '../lib/toast'
import type { Note, Template } from '../types'
import { Modal, Switch } from './ui'

const PICKS = ['📄', '🗓️', '🤝', '🧭', '🗂️', '📊', '⚖️', '📘', '🐞', '🧩', '🚨', '🚀', '📅', '🎯', '✈️', '🔎', '📚', '✍️', '💡', '✅', '☀️', ...EMOJI.slice(0, 8)]
const uniq = [...new Set(PICKS)]

/** Note menu → Save as template: name it, file it, choose what comes along. */
export function SaveTemplateDialog({ note, pages, onClose }: { note: Note; pages: number; onClose: () => void }) {
  const [name, setName] = useState(note.title || 'My template')
  const [emoji, setEmoji] = useState(note.icon || '📄')
  const [category, setCategory] = useState(MY)
  const [description, setDescription] = useState('')
  const [includePages, setIncludePages] = useState(pages > 0)
  const [keepLook, setKeepLook] = useState(true)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const t = await templateFromNote(note.id, { name, emoji, category, description, includePages, keepLook })
      toast(`Saved “${t.name}” to your templates`)
      onClose()
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }
  return (
    <Modal title="Save as template" onClose={onClose} width="max-w-lg">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted">Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" className="rounded-lg border border-line bg-canvas px-3 py-2 text-[15px] text-ink outline-none focus:border-accent" />
        </label>
        <div className="flex flex-col gap-1 text-[12.5px] text-muted">Icon in the gallery
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Template icon">
            {uniq.map((e) => <button key={e} type="button" role="radio" aria-checked={emoji === e} onClick={() => setEmoji(e)} className={`flex h-8 w-8 items-center justify-center rounded-lg text-[17px] ${emoji === e ? 'bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] ring-1 ring-accent' : 'hover:bg-wash'}`}>{e}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] text-ink outline-none focus:border-accent">
              {[MY, ...ALL_CATEGORIES.filter((c) => c !== MY)].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it’s for (optional)" aria-label="Description" className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] text-ink outline-none focus:border-accent" />
          </label>
        </div>
        <div className="rounded-xl border border-line px-3 py-1">
          {pages > 0 && <Switch label={<span className="text-[13.5px]">Include its {pages} {pages === 1 ? 'page' : 'pages'} inside</span>} checked={includePages} onChange={setIncludePages} />}
          <Switch label={<span className="text-[13.5px]">Keep its look <span className="text-muted">· colour, cover, icon, paper, labels</span></span>} checked={keepLook} onChange={setKeepLook} />
        </div>
        <p className="text-[12px] leading-5 text-faint">
          Tip: after saving, edit the template and type {AUTO_HELP.slice(0, 3).map(([k]) => k).join(', ')} or a question like <code className="rounded bg-wash px-1 text-ink-2">{'{{Client}}'}</code> — Folio fills them in each time you use it.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-muted hover:bg-wash">Cancel</button>
          <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50">Save template</button>
        </div>
      </form>
    </Modal>
  )
}

/** Shown across the top of a template while you edit it in the editor. */
export function TemplateDraftBar({ templateId, isRoot, onDone, onDiscard }: { templateId: string; isRoot: boolean; onDone: () => void; onDiscard: () => void }) {
  const t = useLiveQuery(() => db.templates.get(templateId), [templateId]) as Template | undefined
  const [name, setName] = useState('')
  useEffect(() => { if (t) setName(t.name) }, [t?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null
  return (
    <div role="region" aria-label="Editing a template" className="tpl-banner no-print flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-[13px]">
      <LayoutTemplate size={16} className="shrink-0 text-accent" />
      <span className="text-ink-2">Editing template</span>
      {isRoot ? (
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== t.name && updateTemplate(t.id, { name: name.trim() })} aria-label="Template name"
          className="min-w-0 max-w-[260px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-ink outline-none hover:border-line focus:border-accent" />
      ) : <b className="font-medium text-ink">{t.name}</b>}
      <span className="hidden text-faint lg:inline">Type <code className="rounded bg-wash px-1">{'{{date}}'}</code> or <code className="rounded bg-wash px-1">{'{{Question}}'}</code> to fill in later</span>
      <span className="ml-auto flex gap-1.5">
        <button type="button" onClick={onDiscard} className="rounded-lg px-2.5 py-1 text-muted hover:bg-wash hover:text-ink">Discard changes</button>
        <button type="button" onClick={onDone} className="rounded-lg bg-accent px-3 py-1 font-medium text-on-accent">Save template</button>
      </span>
    </div>
  )
}
