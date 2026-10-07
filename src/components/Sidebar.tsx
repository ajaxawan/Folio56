import { Archive, BookOpen, BookOpenText, CheckSquare, FileText, Lightbulb, Lock, MoreHorizontal, PanelLeftClose, Plus, Search, Settings, SquarePen, Sun, Trash2, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { createLabel } from '../lib/db'
import { LabelMenu, labelColor } from './LabelMenu'
import { Wordmark } from './Brand'
import type { Label, Note, View } from '../types'
import { initials } from '../lib/device'
import { backupStatus, useLastBackup } from '../lib/backup'

function Item({ icon, children, active, onClick, count }: { icon: React.ReactNode; children: React.ReactNode; active?: boolean; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors coarse:py-2.5 ${active ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] font-medium text-ink before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-accent' : 'text-ink-2 hover:bg-wash hover:text-ink'}`}>
      <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {count ? <span className="rounded-full bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] px-1.5 text-[11px] font-medium text-accent">{count}</span> : null}
    </button>
  )
}

export function Sidebar({ view, setView, labels, labelCounts, recents, openTasks, onNew, onToday, onSearch, onOpen, onSettings, onCollapse, name, noteCount, mobile }: {
  view: View; setView: (v: View) => void; labels: Label[]; labelCounts: Record<string, number>; recents: Note[]; openTasks: number
  onNew: () => void; onToday: () => void; onSearch: () => void; onOpen: (id: string) => void; onSettings: () => void; onCollapse: () => void
  name: string; noteCount: number; mobile?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const status = backupStatus(useLastBackup(), noteCount)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const is = (k: View['kind'], labelId?: string) => view.kind === k && (!labelId || (view.kind === 'label' && view.labelId === labelId))
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <aside className={`flex h-full flex-col bg-side pt-[env(safe-area-inset-top)] ${mobile ? 'w-full' : 'glass w-[264px]'}`}>
      <div className="flex h-14 items-center justify-between pl-4 pr-2">
        <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink">
          <Wordmark size={23} />
        </span>
        <button type="button" title={mobile ? 'Close menu' : 'Close sidebar'} aria-label={mobile ? 'Close menu' : 'Close sidebar'} onClick={onCollapse}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-wash hover:text-ink">
          {mobile ? <X size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="px-2 pb-2">
        <button type="button" onClick={onSearch}
          className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-canvas/40 px-2.5 py-2 text-left text-[13.5px] text-muted transition-colors hover:border-accent/60 hover:text-ink">
          <Search size={16} /> <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded border border-line px-1.5 text-[10.5px] coarse:hidden">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </div>

      <nav className="space-y-0.5 px-2">
        <Item icon={<SquarePen size={18} />} onClick={onNew}>New note</Item>
        <Item icon={<Sun size={18} />} onClick={onToday}>Today</Item>
        <div className="h-2" />
        <Item icon={<Lightbulb size={18} />} active={is('notes')} onClick={() => setView({ kind: 'notes' })}>Notes</Item>
        <Item icon={<FileText size={18} />} active={is('pages')} onClick={() => setView({ kind: 'pages' })}>Pages</Item>
        <Item icon={<BookOpen size={18} />} active={is('journal')} onClick={() => setView({ kind: 'journal' })}>Journal</Item>
        <Item icon={<BookOpenText size={18} />} active={is('margins')} onClick={() => setView({ kind: 'margins' })}>Margins</Item>
        <Item icon={<CheckSquare size={18} />} active={is('tasks') || is('review')} onClick={() => setView({ kind: 'tasks' })} count={openTasks}>Tasks</Item>
        <Item icon={<Archive size={18} />} active={is('archive')} onClick={() => setView({ kind: 'archive' })}>Archive</Item>
        <Item icon={<Trash2 size={18} />} active={is('trash')} onClick={() => setView({ kind: 'trash' })}>Trash</Item>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="mt-5 flex items-center justify-between px-2.5 pb-1">
          <span className="text-[12px] font-medium text-muted">Labels</span>
          <button type="button" onClick={() => setEditing(!editing)} title="New label" aria-label="New label" className="rounded p-1 text-muted hover:text-accent"><Plus size={15} /></button>
        </div>
        {editing && (
          <form onSubmit={async (e) => { e.preventDefault(); if (newLabel.trim()) { const l = await createLabel(newLabel); setNewLabel(''); setEditing(false); setView({ kind: 'label', labelId: l.id }) } }} className="px-1 pb-1">
            <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onBlur={() => !newLabel && setEditing(false)} placeholder="New label name, Enter to add"
              onKeyDown={(e) => { if (e.key === 'Escape') { setNewLabel(''); setEditing(false) } }}
              className="w-full rounded-lg border border-accent/60 bg-canvas px-2.5 py-1.5 text-[13px] outline-none placeholder:text-faint" />
          </form>
        )}
        {labels.map((l) => {
          const active = is('label', l.id)
          return (
            <div key={l.id} className="group relative">
              <button type="button" onClick={() => setView({ kind: 'label', labelId: l.id })} title={l.name}
                className={`relative flex w-full items-center gap-3 rounded-lg py-1.5 pl-3 pr-9 text-left text-[13.5px] transition-colors ${active ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] font-medium text-ink' : 'text-ink-2 hover:bg-wash hover:text-ink'}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: labelColor(l) }} />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="text-[11px] text-faint group-hover:opacity-0">{labelCounts[l.id] ?? 0}</span>
              </button>
              <button type="button" aria-label={`Options for ${l.name}`} onClick={() => setMenuFor(menuFor === l.id ? null : l.id)}
                className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-wash-2 hover:text-ink ${menuFor === l.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100 coarse:opacity-100'}`}>
                <MoreHorizontal size={15} />
              </button>
              <LabelMenu label={l} open={menuFor === l.id} onClose={() => setMenuFor(null)} className="left-8 top-8" onDeleted={() => active && setView({ kind: 'notes' })} />
            </div>
          )
        })}
        {!labels.length && !editing && <button type="button" onClick={() => setEditing(true)} className="px-2.5 py-1 text-left text-[13px] text-faint hover:text-accent">+ Add your first label</button>}

        {recents.length > 0 && (
          <>
            <div className="mt-5 px-2.5 pb-1 text-[12px] font-medium text-muted">Recents</div>
            {recents.map((n) => (
              <button key={n.id} type="button" onClick={() => onOpen(n.id)}
                className="flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-ink-2 hover:bg-wash hover:text-ink">
                {n.locked ? <Lock size={12} className="shrink-0 text-muted" /> : n.icon ? <span className="shrink-0 text-[13px]">{n.icon}</span> : null}
                <span className="truncate">{n.title || n.preview.replace(/[\u0001\u0002\u0003]/g, '').split('\n')[0] || n.checklist[0]?.text || 'Untitled'}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="border-t border-line p-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        <button type="button" onClick={onSettings} aria-label={`Settings${name ? ` — ${name}` : ''}`} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-wash">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-on-accent">{initials(name) || <UserRound size={16} />}</span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[14px] ${name ? 'text-ink' : 'text-muted'}`}>{name || 'Add your name'}</span>
            {status.text && <span className={`flex items-center gap-1.5 text-[12px] ${status.late ? 'text-ink-2' : 'text-muted'}`}>{status.late && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}{status.text}</span>}
          </span>
          <Settings size={17} className="text-muted" />
        </button>
      </div>
    </aside>
  )
}
