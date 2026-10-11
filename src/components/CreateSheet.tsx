import { CheckSquare, FileText, Image as ImageIcon, LayoutTemplate, Mic, Presentation, QrCode, SquarePen, Sun } from 'lucide-react'
import { Sheet } from './ui'
import { useAI } from '../lib/prefs'

/** What the big + button offers on phones: one tap to any kind of new note. */
export function CreateSheet({ onClose, onNote, onPage, onList, onVoice, onPhoto, onTemplate, onToday, onReceive, onDeck }: {
  onClose: () => void; onNote: () => void; onPage: () => void; onList: () => void; onVoice: () => void; onPhoto: () => void; onTemplate: () => void; onToday: () => void; onReceive: () => void; onDeck: () => void
}) {
  const ai = useAI()
  const go = (fn: () => void) => () => { onClose(); fn() }
  const Tile = ({ icon, label, sub, onClick, tone }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; tone?: string }) => (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/70 p-3 text-left transition-transform active:scale-[.97]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tone ?? 'color-mix(in srgb, var(--color-accent) 16%, transparent)', color: tone ? '#fff' : 'var(--color-accent)' }}>{icon}</span>
      <span className="min-w-0"><span className="block text-[15px] font-medium text-ink">{label}</span><span className="block truncate text-[12px] text-muted">{sub}</span></span>
    </button>
  )
  return (
    <Sheet label="Create" onClose={onClose}>
      <button type="button" onClick={go(onVoice)} className="mb-3 flex w-full items-center gap-4 rounded-2xl bg-[linear-gradient(135deg,color-mix(in_srgb,#ef4444_22%,var(--color-surface)),var(--color-surface))] p-4 text-left ring-1 ring-red-400/25 active:scale-[.98]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-900/40"><Mic size={22} /></span>
        <span><span className="block text-[16px] font-semibold">Voice memo</span><span className="block text-[12.5px] text-muted">{ai ? 'Record, then turn it into notes or meeting minutes' : 'Record an audio note'}</span></span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={<SquarePen size={20} />} label="Note" sub="A quick card" onClick={go(onNote)} />
        <Tile icon={<FileText size={20} />} label="Page" sub="Long, with pages inside" onClick={go(onPage)} />
        <Tile icon={<CheckSquare size={20} />} label="Checklist" sub="Tasks & lists" onClick={go(onList)} />
        <Tile icon={<ImageIcon size={20} />} label="Photo" sub="Camera or library" onClick={go(onPhoto)} />
        <Tile icon={<LayoutTemplate size={20} />} label="Template" sub="Meeting, plan…" onClick={go(onTemplate)} />
        <Tile icon={<Sun size={20} />} label="Today" sub="Daily note" onClick={go(onToday)} />
        <Tile icon={<Presentation size={20} />} label="Presentation" sub={ai ? 'From a note or PDF, with AI' : 'From a note or PDF'} onClick={go(onDeck)} />
        <Tile icon={<QrCode size={20} />} label="Receive" sub="Scan a Beam or open a link" onClick={go(onReceive)} />
      </div>
    </Sheet>
  )
}
