import { ArrowRight, ChevronRight, FilePlus2, FileText, FileUp, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createNote } from '../lib/db'
import { friendlyDate } from '../lib/device'
import { pageIds } from '../lib/kinds'
import type { Note } from '../types'

/** V6.2: the page tree holds pages only (quick notes live on the Notes board). */
export function PagesView({ notes, onOpen, onImport, labelId }: { notes: Note[]; onOpen: (id: string) => void; onImport?: () => void; labelId?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [limit, setLimit] = useState(150)
  // One pass to build the tree (was a full scan per row — slow with thousands of pages).
  const { live, roots, children } = useMemo(() => {
    const pages = pageIds(notes)
    const live = notes.filter((n) => n.trashedAt === null && pages.has(n.id))
    const ids = new Set(live.map((n) => n.id))
    const children = new Map<string, Note[]>()
    const roots: Note[] = []
    for (const n of live) {
      if (n.parentId && ids.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
      else if (!labelId || n.labels.includes(labelId)) roots.push(n)
    }
    roots.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const list of children.values()) list.sort((a, b) => a.createdAt - b.createdAt)
    return { live, roots, children }
  }, [notes, labelId])
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
          <p className="text-[13px] text-muted">{live.length === 1 ? '1 page' : `${live.length} pages`} · for longer writing you nest and organise</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onImport && <button type="button" onClick={onImport} className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-[13px] text-ink-2 hover:border-accent/50"><FileUp size={15} /> Import</button>}
          <button type="button" onClick={async () => { const n = await createNote({ kind: 'page', labels: labelId ? [labelId] : [] }); onOpen(n.id) }}
            className="flex items-center gap-2 rounded-full bg-raised px-3.5 py-2 text-[13px] text-ink hover:bg-wash-2"><FilePlus2 size={15} /> New page</button>
        </div>
      </div>
      {roots.length ? roots.slice(0, limit).map((n) => <Row key={n.id} n={n} depth={0} />) : (
        <div className="px-3 py-10 text-center text-muted">
          <p className="text-[15px] text-ink-2">No pages yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-[13.5px]">Pages are for things that grow — a project, a wiki, a book. Put pages inside pages. Quick notes stay on the Notes board.</p>
        </div>
      )}
      {roots.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 300)} className="mx-auto my-6 block rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 hover:border-accent/60">
          Show more ({roots.length - limit} more pages)
        </button>
      )}
    </div>
  )
}

/** V6.2: a row of page tiles — recent pages on the Notes board, or a notebook's pages. */
export function PageStrip({ pages, kids, title, onOpen, onAll }: { pages: Note[]; kids: Map<string, number>; title: string; onOpen: (id: string) => void; onAll?: () => void }) {
  if (!pages.length) return null
  return (
    <section aria-label={title} className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[12px] font-semibold uppercase tracking-[.1em] text-muted">{title}</h2>
        {onAll && <button type="button" onClick={onAll} className="flex items-center gap-1 rounded-full px-2 py-1 text-[12.5px] text-muted hover:bg-wash hover:text-ink">All pages <ArrowRight size={13} /></button>}
      </div>
      <div className="no-scrollbar grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 max-sm:-mx-3 max-sm:flex max-sm:snap-x max-sm:overflow-x-auto max-sm:scroll-px-3 max-sm:px-3">
        {pages.map((n) => (
          <button key={n.id} type="button" onClick={() => onOpen(n.id)}
            className="flex min-w-0 snap-start items-center gap-2.5 rounded-xl border max-sm:w-[62%] max-sm:shrink-0 border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-wash">
            {n.locked ? <Lock size={16} className="shrink-0 text-muted" /> : n.icon ? <span className="w-[18px] shrink-0 text-center text-[16px]">{n.icon}</span> : <FileText size={17} className="shrink-0 text-muted" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-ink">{n.title || 'Untitled'}</span>
              <span className="block truncate text-[11.5px] text-faint">{kids.get(n.id) ? `${kids.get(n.id)} inside · ` : ''}{friendlyDate(n.updatedAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
