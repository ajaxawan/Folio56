import { Layers, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { seriesNames } from '../lib/voice'
import { Sheet } from './ui'

/** Pick a series: chips for the ones in use, or type a new name. */
export function SeriesPicker({ value, onChange, suggestion }: { value: string | null; onChange: (v: string | null) => void; suggestion?: string }) {
  const [names, setNames] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState(suggestion ?? '')
  useEffect(() => { seriesNames().then(setNames) }, [])
  const all = value && !names.includes(value) ? [value, ...names] : names
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange(null)} className={`rounded-full border px-3 py-1.5 text-[13px] ${!value ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-muted'}`}>None</button>
      {all.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${value === n ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-ink-2 hover:border-accent/50'}`}>
          <Layers size={13} /><span className="truncate">{n}</span>
        </button>
      ))}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onChange(text.trim()); setAdding(false) } }} className="flex items-center gap-1">
          <input autoFocus aria-label="New series name" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Weekly site review"
            className="w-48 rounded-full border border-accent bg-canvas px-3 py-1.5 text-[13px] outline-none" />
          <button type="button" aria-label="Cancel" onClick={() => setAdding(false)} className="rounded-full p-1.5 text-muted"><X size={14} /></button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-[13px] text-muted hover:text-ink"><Plus size={13} /> New series</button>
      )}
    </div>
  )
}

/** Put notes into a series (stack) or take them out. */
export function SeriesSheet({ ids, onClose, suggestion }: { ids: string[]; onClose: () => void; suggestion?: string }) {
  const [value, setValue] = useState<string | null>(null)
  useEffect(() => { db.notes.get(ids[0]).then((n) => setValue(n?.series ?? (suggestion || null))) }, [ids, suggestion])
  const save = async () => { await db.notes.bulkUpdate(ids.map((key) => ({ key, changes: { series: value } }))); onClose() }
  return (
    <Sheet label="Series" onClose={onClose}>
      <div className="mb-1 flex items-center gap-2 text-[17px] font-semibold"><Layers size={18} className="text-accent" /> {ids.length > 1 ? `Stack ${ids.length} notes` : 'Series'}</div>
      <p className="mb-3 text-[13px] leading-5 text-muted">Notes in a series show as one stacked card on the board. For recorded meetings, Folio also checks what's still open from the last one.</p>
      <SeriesPicker value={value} onChange={setValue} suggestion={suggestion} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[14px] text-muted hover:bg-wash">Cancel</button>
        <button type="button" onClick={save} className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent">Save</button>
      </div>
    </Sheet>
  )
}
