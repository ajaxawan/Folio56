import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { createLabel, db } from '../lib/db'
import { labelColor } from './LabelMenu'

/**
 * V6.2 notebooks (stored as labels). A note lives in one notebook — its home, the first id — and can
 * also be shown in others. Tapping a notebook moves the note there (its other notebooks stay);
 * "Also here" adds or removes an extra one.
 */
const moveHome = (ids: string[], to: string | null) => (to ? [to, ...ids.slice(1).filter((x) => x !== to)] : [])

export function NotebookPicker({ selected, onChange, title = 'Notebook', extras = true }: { selected: string[]; onChange: (ids: string[]) => void; title?: string; extras?: boolean }) {
  const labels = useLiveQuery(() => db.labels.orderBy('name').toArray(), []) ?? []
  const [q, setQ] = useState('')
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase())
  const home = selected[0] ?? null
  const create = async () => { const l = await createLabel(q); onChange(moveHome(selected, l.id)); setQ('') }
  const toggleExtra = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="w-64" role="group" aria-label={title}>
      <div className="px-2 pb-1 pt-1 text-[13px] font-medium text-ink">{title}</div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find or create a notebook" aria-label="Find or create a notebook"
        onKeyDown={async (e) => { if (e.key === 'Enter' && q.trim() && !exact) await create() }}
        className="mb-1 w-full rounded-md bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-faint" />
      <div className="max-h-60 overflow-y-auto">
        {!q && (
          <button type="button" onClick={() => onChange([])} aria-pressed={!home}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[14px] text-muted hover:bg-wash">
            <span className="flex h-4 w-4 items-center justify-center">{!home && <Check size={14} strokeWidth={3} className="text-accent" />}</span>
            No notebook
          </button>
        )}
        {filtered.map((l) => {
          const isHome = l.id === home
          const isExtra = !isHome && selected.includes(l.id)
          return (
            <div key={l.id} className="group flex items-center rounded-md hover:bg-wash">
              <button type="button" onClick={() => !isHome && onChange(moveHome(selected, l.id))} aria-pressed={isHome} title={isHome ? 'Its notebook' : `Move to ${l.name}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left text-[14px]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">{isHome && <Check size={14} strokeWidth={3} className="text-accent" />}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labelColor(l) }} />
                <span className="truncate">{l.name}</span>
              </button>
              {extras && !isHome && home && (
                <button type="button" onClick={() => toggleExtra(l.id)} aria-pressed={isExtra} aria-label={`Also show in ${l.name}`}
                  className={`mr-1 shrink-0 rounded-full px-2 py-0.5 text-[11.5px] ${isExtra ? 'bg-wash-2 text-ink-2' : 'text-faint opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100'}`}>
                  {isExtra ? '✓ Also here' : '+ Also here'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {q.trim() && !exact && (
        <button type="button" onClick={create}
          className="mt-1 flex w-full items-center gap-2 border-t border-line px-2 pt-2 text-left text-[14px] hover:text-accent-ink">
          <Plus size={16} /> New notebook “{q.trim()}”
        </button>
      )}
    </div>
  )
}
