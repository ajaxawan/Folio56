import { Check, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { COLOR_KEYS, COLOR_NAMES, dot } from '../lib/colors'
import { db, deleteLabel } from '../lib/db'
import type { Label } from '../types'
import { MenuItem, Popover } from './ui'

/** Rename / colour / delete for one notebook (stored as a label). Used in the sidebar and on the label page. */
export function LabelMenu({ label, open, onClose, onDeleted, className = '' }: { label: Label; open: boolean; onClose: () => void; onDeleted?: () => void; className?: string }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(label.name)
  const [confirm, setConfirm] = useState(false)
  const close = () => { setRenaming(false); setConfirm(false); onClose() }
  const save = async () => { if (name.trim() && name.trim() !== label.name) await db.labels.update(label.id, { name: name.trim() }); close() }
  return (
    <Popover open={open} onClose={close} className={`w-56 ${className}`}>
      {renaming ? (
        <form onSubmit={(e) => { e.preventDefault(); save() }} className="p-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
            className="w-full rounded-md border border-accent bg-canvas px-2.5 py-1.5 text-[13.5px] outline-none" />
        </form>
      ) : (
        <MenuItem icon={<Pencil size={15} />} onClick={() => { setName(label.name); setRenaming(true) }}>Rename</MenuItem>
      )}
      <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">Colour</div>
      <div className="grid grid-cols-6 gap-1.5 px-2 pb-2">
        {COLOR_KEYS.map((k) => (
          <button key={k} type="button" title={k === 'default' ? 'Automatic' : COLOR_NAMES[k]} aria-label={k === 'default' ? 'Automatic' : COLOR_NAMES[k]} onClick={() => db.labels.update(label.id, { color: k })}
            className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-line transition-transform hover:scale-110" style={{ background: k === 'default' ? labelColor({ ...label, color: undefined }) : dot(k) }}>
            {(label.color ?? 'default') === k && <Check size={12} strokeWidth={3} className="text-on-accent" />}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-line" />
      {confirm ? (
        <div className="p-2 text-[12.5px]">
          <p className="mb-2 text-muted">Delete "{label.name}"? Its notes and pages stay; they just leave this notebook.</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-md bg-wash py-1.5 hover:bg-wash-2">Cancel</button>
            <button type="button" onClick={async () => { await deleteLabel(label.id); close(); onDeleted?.() }} className="flex-1 rounded-md bg-red-500/80 py-1.5 text-white hover:bg-red-500">Delete</button>
          </div>
        </div>
      ) : (
        <MenuItem danger icon={<Trash2 size={15} />} onClick={() => setConfirm(true)}>Delete notebook</MenuItem>
      )}
    </Popover>
  )
}

// Labels without a chosen colour each get their own soft colour (stable per label), so the
// board shows its groups at a glance. Picking a colour in the label menu overrides it.
const AUTO = ['#7aa9ff', '#5fcfc0', '#f0b35e', '#ee8fb0', '#b59cff', '#9fcf86', '#f59b7c', '#6fc3ec', '#d9c46c']
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
// Labels take colours in order (A→Z), so the first nine are always different from each other.
const order = new Map<string, number>()
export function registerLabels(ls: Label[]) { order.clear(); ls.forEach((l, i) => order.set(l.id, i)) }
/** Colour used to paint a label everywhere. */
export const labelColor = (l?: Label) => (!l ? 'var(--color-accent)' : !l.color || l.color === 'default' ? AUTO[(order.get(l.id) ?? hash(l.id)) % AUTO.length] : dot(l.color))
