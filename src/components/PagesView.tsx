import { ChevronRight, FilePlus2, FileText, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createNote } from '../lib/db'
import { friendlyDate } from '../lib/device'
import type { Note } from '../types'

/** Notion-style page tree of everything that isn't trashed. */
export function PagesView({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [limit, setLimit] = useState(150)
  // One pass to build the tree (was a full scan per row — slow with thousands of pages).
  const { live, roots, children } = useMemo(() => {
    const live = notes.filter((n) => n.trashedAt === null)
    const ids = new Set(live.map((n) => n.id))
    const children = new Map<string, Note[]>()
    const roots: Note[] = []
    for (const n of live) {
      if (n.parentId && ids.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
      else roots.push(n)
    }
    roots.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const list of children.values()) list.sort((a, b) => a.createdAt - b.createdAt)
    return { live, roots, children }
  }, [notes])
  const kids = (id: string) => children.get(id) ?? []

  const Row = ({ n, depth }: { n: Note; depth: number }) => {
    const ch = kids(n.id)
    const isOpen = !!open[n.id]
    return (
      <>
        <div className="group flex items-center rounded-lg pr-3 hover:bg-wash" style={{ paddingLeft: 6 + depth * 22 }}>
          <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => setOpen({ ...open, [n.id]: !isOpen })}
            className={`flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-wash ${ch.length ? '' : 'invisible'}`}>
            <ChevronRight size={15} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          <button type="button" onClick={() => onOpen(n.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left coarse:py-3">
            {n.locked ? <Lock size={16} className="shrink-0 text-muted" /> : n.icon ? <span className="w-[17px] shrink-0 text-center text-[15px]">{n.icon}</span> : <FileText size={17} className="shrink-0 text-muted" />}
            <span className="truncate text-[15px] text-ink">{n.title || n.preview.replace(/[\u0001\u0002\u0003]/g, '').split('\n')[0] || 'Untitled'}</span>
            {ch.length > 0 && <span className="shrink-0 text-[12px] text-faint">{ch.length}</span>}
            {n.archived && <span className="shrink-0 rounded bg-wash px-1.5 text-[11px] text-muted">archived</span>}
          </button>
          <span className="hidden shrink-0 text-[12px] text-faint sm:block">{n.words ? `${n.words} words · ` : ''}{friendlyDate(n.updatedAt)}</span>
        </div>
        {isOpen && ch.map((c) => <Row key={c.id} n={c} depth={depth + 1} />)}
      </>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-end justify-between px-1">
        <div>
          <h1 className="font-title text-[30px] font-bold tracking-tight">Pages</h1>
          <p className="text-[13px] text-muted">{live.length} pages, nested like Notion</p>
        </div>
        <button type="button" onClick={async () => { const n = await createNote(); onOpen(n.id) }}
          className="flex items-center gap-2 rounded-full bg-raised px-3.5 py-2 text-[13px] text-ink hover:bg-wash-2"><FilePlus2 size={15} /> New page</button>
      </div>
      {roots.length ? roots.slice(0, limit).map((n) => <Row key={n.id} n={n} depth={0} />) : <p className="px-3 py-10 text-center text-muted">No pages yet.</p>}
      {roots.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 300)} className="mx-auto my-6 block rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 hover:border-accent/60">
          Show more ({roots.length - limit} more pages)
        </button>
      )}
    </div>
  )
}
