import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { createLabel, db } from '../lib/db'
import { labelColor } from './LabelMenu'

export function LabelPicker({ selected, onChange, title = 'Label note' }: { selected: string[]; onChange: (ids: string[]) => void; title?: string }) {
  const labels = useLiveQuery(() => db.labels.orderBy('name').toArray(), []) ?? []
  const [q, setQ] = useState('')
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase())
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="w-60">
      <div className="px-2 pb-1 pt-1 text-[13px] font-medium text-ink">{title}</div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or create label"
        onKeyDown={async (e) => { if (e.key === 'Enter' && q.trim() && !exact) { const l = await createLabel(q); onChange([...selected, l.id]); setQ('') } }}
        className="mb-1 w-full rounded-md bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-faint" />
      <div className="max-h-56 overflow-y-auto">
        {filtered.map((l) => (
          <button key={l.id} type="button" onClick={() => toggle(l.id)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-wash">
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.includes(l.id) ? 'border-ink bg-ink text-canvas' : 'border-muted'}`}>
              {selected.includes(l.id) && <Check size={12} strokeWidth={3} />}
            </span>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labelColor(l) }} />
            <span className="truncate">{l.name}</span>
          </button>
        ))}
      </div>
      {q.trim() && !exact && (
        <button type="button" onClick={async () => { const l = await createLabel(q); onChange([...selected, l.id]); setQ('') }}
          className="mt-1 flex w-full items-center gap-2 border-t border-line px-2 pt-2 text-left text-[14px] hover:text-accent-ink">
          <Plus size={16} /> Create "{q.trim()}"
        </button>
      )}
    </div>
  )
}
