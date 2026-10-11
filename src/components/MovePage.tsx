// V6.3: move a page (with everything inside it) under another page, or back to the top of Pages.
// A quick note moved inside a page becomes one of its pages.
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUpToLine, FileText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db, patchNote } from '../lib/db'
import { pageIds } from '../lib/kinds'
import { toast } from '../lib/toast'
import type { Note } from '../types'
import { Modal } from './ui'

export function MovePageDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const all = useLiveQuery(() => db.notes.filter((n) => n.trashedAt === null && !n.templateDraft).toArray(), [])
  const [q, setQ] = useState('')
  const { targets, path } = useMemo(() => {
    const list = all ?? []
    const byId = new Map(list.map((n) => [n.id, n]))
    // the page itself and everything inside it can't be where it goes
    const inside = new Set([note.id])
    let grew = true
    while (grew) { grew = false; for (const n of list) if (n.parentId && inside.has(n.parentId) && !inside.has(n.id)) { inside.add(n.id); grew = true } }
    const pages = pageIds(list)
    const path = (n: Note) => { const parts: string[] = []; let p = n.parentId, g = 0; while (p && g++ < 12) { const x = byId.get(p); if (!x) break; parts.unshift(x.title || 'Untitled'); p = x.parentId } return parts.join(' / ') }
    const targets = list.filter((n) => pages.has(n.id) && !inside.has(n.id) && !n.locked && !n.rav).sort((a, b) => b.updatedAt - a.updatedAt)
    return { targets, path }
  }, [all, note.id])
  const s = q.trim().toLowerCase()
  const shown = (s ? targets.filter((n) => (n.title || 'untitled').toLowerCase().includes(s)) : targets).slice(0, 60)
  const wasNote = !note.parentId && note.kind !== 'page'

  const move = async (parentId: string | null, name: string) => {
    const before = { parentId: note.parentId, kind: note.kind }
    await patchNote(note.id, { parentId, kind: 'page' })
    toast(parentId ? `Moved inside “${name}”${wasNote ? ' — it’s a page now' : ''}` : 'Moved to the top of Pages', () => patchNote(note.id, before))
    onClose()
  }

  return (
    <Modal title="Move to…" onClose={onClose}>
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 focus-within:border-accent">
        <Search size={15} className="text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" aria-label="Find a page" className="min-w-0 flex-1 bg-transparent py-2 text-[14px] outline-none" />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {note.parentId && !s && (
          <button type="button" onClick={() => move(null, '')} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[14px] hover:bg-wash">
            <ArrowUpToLine size={16} className="shrink-0 text-muted" /> Top of Pages
          </button>
        )}
        {shown.map((n) => (
          <button key={n.id} type="button" disabled={n.id === note.parentId} onClick={() => move(n.id, n.title || 'Untitled')}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-wash disabled:opacity-50">
            {n.icon ? <span className="w-4 shrink-0 text-center">{n.icon}</span> : <FileText size={16} className="shrink-0 text-muted" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{n.title || 'Untitled'}{n.id === note.parentId ? ' · here now' : ''}</span>
              {path(n) && <span className="block truncate text-[11.5px] text-faint">{path(n)}</span>}
            </span>
          </button>
        ))}
        {all && !shown.length && <p className="px-2 py-6 text-center text-[13.5px] text-muted">{s ? 'No page by that name.' : 'No other pages yet.'}</p>}
      </div>
    </Modal>
  )
}
