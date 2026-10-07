import { CornerDownLeft, FileText, Lock, Search } from 'lucide-react'
import { isPhone } from '../lib/mobile'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { swatch } from '../lib/colors'
import { friendlyDate } from '../lib/device'
import { usePrefs } from '../lib/prefs'
import type { Note } from '../types'
import { searchNotes, snippetFor, syncIndex } from '../lib/search'

export interface Command { id: string; label: string; icon: ReactNode; hint?: string; keywords?: string; run: () => void }

type Item = { kind: 'cmd'; cmd: Command } | { kind: 'note'; note: Note }

export function CommandPalette({ notes, commands, onOpen, onClose }: { notes: Note[]; commands: Command[]; onOpen: (id: string) => void; onClose: () => void }) {
  const { dark } = usePrefs()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const phone = isPhone()

  // Full-text, typo-tolerant, ranked search (built once, then kept in step with your notes).
  const [ready, setReady] = useState(0)
  useEffect(() => { let dead = false; syncIndex(notes).then(() => { if (!dead) setReady((r) => r + 1) }); return () => { dead = true } }, [notes])
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const { items, terms } = useMemo(() => {
    const s = q.trim().toLowerCase()
    const words = s.split(/\s+/).filter(Boolean)
    const match = (h: string) => words.every((w) => h.includes(w))
    const cmds = commands.filter((c) => !s || match(`${c.label} ${c.keywords ?? ''}`.toLowerCase())).slice(0, s ? 6 : 8)
    let found: Note[]
    let terms = new Map<string, string[]>()
    if (s) {
      const hits = searchNotes(s, 30)
      terms = new Map(hits.map((h) => [h.id, h.terms]))
      found = hits.map((h) => byId.get(h.id)).filter((n): n is Note => !!n && n.trashedAt === null)
    } else found = notes.filter((n) => n.trashedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
    // An action whose name starts with what you typed ("export…", "new from template") comes first,
    // unless a note is literally titled that.
    const cmdFirst = !!s && cmds.some((c) => c.label.toLowerCase().startsWith(s)) && !found.some((n) => (n.title || '').toLowerCase().includes(s))
    const items: Item[] = s && !cmdFirst
      ? [...found.map((note) => ({ kind: 'note' as const, note })), ...cmds.map((cmd) => ({ kind: 'cmd' as const, cmd }))]
      : [...cmds.map((cmd) => ({ kind: 'cmd' as const, cmd })), ...found.map((note) => ({ kind: 'note' as const, note }))]
    return { items, terms }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, byId, commands, ready])

  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const run = (it: Item) => { onClose(); if (it.kind === 'cmd') it.cmd.run(); else onOpen(it.note.id) }
  const snippet = (n: Note) => {
    if (n.locked) return 'Locked'
    const text = (n.preview || n.checklist.map((c) => c.text).join(' · ')).replace(/[\u0001\u0002\u0003]/g, '')
    if (!q.trim()) return text.slice(0, 110)
    return snippetFor(n, terms.get(n.id) ?? [], text.slice(0, 110))
  }
  const firstNote = items.findIndex((i) => i.kind === 'note')
  const firstCmd = items.findIndex((i) => i.kind === 'cmd')

  return (
    <div className={`animate-fade fixed inset-0 z-[60] flex items-start justify-center bg-scrim ${phone ? '' : 'p-3 pt-[9vh]'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Command menu" className={`w-full max-w-xl overflow-hidden bg-pop text-ink shadow-2xl ${phone ? 'flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[var(--kb,0px)]' : 'animate-pop rounded-2xl border border-line'}`}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes or type a command…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, items.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)) }
              if (e.key === 'Enter' && items[sel]) run(items[sel])
            }}
            className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
          <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-muted sm:block">Esc</kbd>
          {phone && <button type="button" onClick={onClose} className="-mr-1 rounded-lg px-2 py-2 text-[15px] font-medium text-accent">Cancel</button>}
        </div>
        <div ref={listRef} className={`overflow-y-auto overscroll-contain p-1.5 ${phone ? 'min-h-0 flex-1' : 'max-h-[60vh]'}`}>
          {items.map((it, i) => (
            <div key={it.kind === 'cmd' ? it.cmd.id : it.note.id}>
              {i === firstCmd && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">Actions</div>}
              {i === firstNote && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">{q ? 'Notes' : 'Recent'}</div>}
              <button type="button" data-i={i} onMouseMove={() => setSel(i)} onClick={() => run(it)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === sel ? 'bg-wash-2' : ''}`}>
                {it.kind === 'cmd' ? (
                  <>
                    <span className="text-muted">{it.cmd.icon}</span>
                    <span className="flex-1 text-[14px]">{it.cmd.label}</span>
                    {it.cmd.hint && <kbd className="coarse:hidden rounded border border-line px-1.5 text-[11px] text-muted">{it.cmd.hint}</kbd>}
                    {i === sel && <CornerDownLeft size={14} className="text-faint coarse:hidden" />}
                  </>
                ) : (
                  <>
                    {it.note.icon ? <span className="w-3.5 shrink-0 text-center text-[14px]">{it.note.icon}</span> : <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line" style={{ background: swatch(it.note.color, dark) }} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {it.note.parentId && <FileText size={13} className="text-muted" />}
                        {it.note.locked && <Lock size={12} className="text-muted" />}
                        <span className="truncate text-[14px]">{it.note.title || 'Untitled'}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-faint">{friendlyDate(it.note.updatedAt)}</span>
                      </span>
                      <span className="line-clamp-1 text-[12.5px] text-muted">{snippet(it.note)}</span>
                    </span>
                  </>
                )}
              </button>
            </div>
          ))}
          {!items.length && <p className="px-3 py-8 text-center text-[14px] text-muted">Nothing matches "{q}"</p>}
        </div>
      </div>
    </div>
  )
}
