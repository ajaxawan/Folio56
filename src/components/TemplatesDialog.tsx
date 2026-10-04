import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { allTemplates, db } from '../lib/db'
import { plainText } from '../lib/preview'
import type { Template } from '../types'
import { Modal } from './ui'

export function TemplatesDialog({ onPick, onClose }: { onPick: (t: Template) => void; onClose: () => void }) {
  const templates = useLiveQuery(allTemplates, []) ?? []
  return (
    <Modal title="New from template" onClose={onClose} width="max-w-2xl">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="group relative">
            <button type="button" onClick={() => onPick(t)}
              className="flex h-full w-full flex-col items-start rounded-xl border border-line bg-card p-4 text-left transition hover:border-accent">
              <span className="mb-2 text-[22px]">{t.emoji}</span>
              <span className="text-[15px] font-semibold">{t.name}</span>
              <span className="mt-1 line-clamp-2 text-[12.5px] text-muted">{plainText(t.content).split('\n').filter(Boolean).join(' · ') || 'Blank'}</span>
            </button>
            {!t.builtin && (
              <button type="button" aria-label="Delete template" onClick={() => db.templates.delete(t.id)}
                className="absolute right-2 top-2 rounded-full p-1.5 text-muted opacity-0 hover:bg-wash hover:text-red-500 group-hover:opacity-100"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-faint">Tip: open any note → ⋯ → Save as template to add your own.</p>
    </Modal>
  )
}
