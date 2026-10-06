import { Archive, BookOpen, BookOpenText, CheckSquare, FileText, Lightbulb, Menu, Plus, Search, Settings, SquarePen, Sun, Trash2 } from 'lucide-react'
import type { View } from '../types'

type Go = (v: View) => void

// Defined once at module level (not inside render) so buttons aren't re-created on every render.
const Btn = ({ label, active, onClick, children, badge }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode; badge?: number }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick}
    className={`relative flex h-12 w-12 flex-col items-center justify-center rounded-xl transition-colors ${active ? 'bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-accent' : 'text-muted hover:bg-wash hover:text-ink'}`}>
    {children}
    {badge ? <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-on-accent">{badge}</span> : null}
  </button>
)

const Tab = ({ label, active, onClick, children, badge }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode; badge?: number }) => (
  <button type="button" onClick={onClick} aria-label={label}
    className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-2 text-[11px] font-medium active:opacity-70 ${active ? 'text-accent-ink' : 'text-muted'}`}>
    <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${active ? 'bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]' : ''}`}>{children}</span>
    {label}
    {badge ? <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 text-on-accent">{badge}</span> : null}
  </button>
)


/** Slim icon sidebar for tablets in landscape (768–1023px). */
export function Rail({ view, setView, onNew, onToday, onSearch, onSettings, onExpand, openTasks }: {
  view: View; setView: Go; onNew: () => void; onToday: () => void; onSearch: () => void; onSettings: () => void; onExpand: () => void; openTasks: number
}) {
  return (
    <aside className="flex h-full w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line/60 bg-side py-3 pt-[max(env(safe-area-inset-top),12px)]">
      <Btn label="Menu" onClick={onExpand}><Menu size={21} /></Btn>
      <button type="button" aria-label="New note" title="New note" onClick={onNew} className="my-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-lg shadow-black/30 active:scale-95"><SquarePen size={21} /></button>
      <Btn label="Today" onClick={onToday}><Sun size={21} /></Btn>
      <Btn label="Search" onClick={onSearch}><Search size={21} /></Btn>
      <div className="my-1 h-px w-8 bg-line" />
      <Btn label="Notes" active={!['pages', 'tasks', 'archive', 'trash', 'journal', 'margins'].includes(view.kind)} onClick={() => setView({ kind: 'notes' })}><Lightbulb size={21} /></Btn>
      <Btn label="Pages" active={view.kind === 'pages'} onClick={() => setView({ kind: 'pages' })}><FileText size={21} /></Btn>
      <Btn label="Journal" active={view.kind === 'journal'} onClick={() => setView({ kind: 'journal' })}><BookOpen size={21} /></Btn>
      <Btn label="Margins — read a PDF" active={view.kind === 'margins'} onClick={() => setView({ kind: 'margins' })}><BookOpenText size={21} /></Btn>
      <Btn label="Tasks" active={view.kind === 'tasks'} onClick={() => setView({ kind: 'tasks' })} badge={openTasks}><CheckSquare size={21} /></Btn>
      <Btn label="Archive" active={view.kind === 'archive'} onClick={() => setView({ kind: 'archive' })}><Archive size={21} /></Btn>
      <Btn label="Trash" active={view.kind === 'trash'} onClick={() => setView({ kind: 'trash' })}><Trash2 size={21} /></Btn>
      <div className="flex-1" />
      <Btn label="Settings" onClick={onSettings}><Settings size={21} /></Btn>
    </aside>
  )
}

/** Bottom tab bar for phones and tablets in portrait (< 768px). The middle button opens the create sheet. */
export function BottomBar({ view, setView, onCreate, openTasks }: { view: View; setView: Go; onCreate: () => void; openTasks: number }) {
  return (
    <nav className="hide-on-kb z-30 flex shrink-0 items-stretch border-t border-line/70 bg-side/90 px-1 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur-xl">
      <Tab label="Notes" active={!['pages', 'tasks', 'archive', 'trash', 'journal', 'margins'].includes(view.kind)} onClick={() => setView({ kind: 'notes' })}><Lightbulb size={21} /></Tab>
      <Tab label="Pages" active={view.kind === 'pages'} onClick={() => setView({ kind: 'pages' })}><FileText size={21} /></Tab>
      <div className="flex flex-1 items-center justify-center">
        <button type="button" aria-label="Create" onClick={onCreate} className="-mt-6 flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-accent text-on-accent shadow-xl shadow-black/50 ring-4 ring-canvas transition-transform active:scale-90"><Plus size={28} strokeWidth={2.4} /></button>
      </div>
      <Tab label="Tasks" active={view.kind === 'tasks'} onClick={() => setView({ kind: 'tasks' })} badge={openTasks}><CheckSquare size={21} /></Tab>
      <Tab label="Journal" active={view.kind === 'journal'} onClick={() => setView({ kind: 'journal' })}><BookOpen size={21} /></Tab>
    </nav>
  )
}
