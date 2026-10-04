import { useLiveQuery } from 'dexie-react-hooks'
import { History, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { db } from '../lib/db'
import { plainText } from '../lib/preview'
import type { Version } from '../types'
import { IconButton } from './ui'

export function HistoryPanel({ noteId, locked, onRestore, onClose, onSaveNow }: { noteId: string; locked: boolean; onRestore: (v: Version) => void; onClose: () => void; onSaveNow: () => void }) {
  const versions = useLiveQuery(() => db.versions.where('noteId').equals(noteId).reverse().sortBy('at'), [noteId]) ?? []
  const [sel, setSel] = useState<Version | null>(null)
  return (
    <aside className="animate-slidein flex h-full w-full flex-col border-l border-line bg-side sm:w-80">
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        <History size={16} className="text-muted" />
        <span className="flex-1 text-[14px] font-medium">Version history</span>
        <IconButton size="sm" label="Close history" onClick={onClose}><X size={17} /></IconButton>
      </div>
      {locked ? (
        <p className="p-4 text-[13px] leading-5 text-muted">History is off for locked notes so no readable copy is kept.</p>
      ) : (
        <>
          <div className="p-3"><button type="button" onClick={onSaveNow} className="w-full rounded-lg bg-wash py-2 text-[13px] hover:bg-wash-2">Save a version now</button></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {versions.map((v) => (
              <button key={v.id} type="button" onClick={() => setSel(sel?.id === v.id ? null : v)}
                className={`mb-0.5 block w-full rounded-lg px-3 py-2 text-left ${sel?.id === v.id ? 'bg-wash-2' : 'hover:bg-wash'}`}>
                <div className="text-[13px] text-ink">{new Date(v.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="text-[12px] text-muted">{v.words} words{v.title ? ` · ${v.title}` : ''}</div>
                {sel?.id === v.id && (
                  <div className="mt-2">
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-canvas/60 p-2 text-[12px] leading-5 text-ink-2">{plainText(v.content).slice(0, 1500) || 'Empty'}</p>
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onRestore(v) }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"><RotateCcw size={13} /> Restore this version</span>
                  </div>
                )}
              </button>
            ))}
            {!versions.length && <p className="px-3 py-6 text-center text-[13px] text-muted">Versions are saved automatically every few minutes while you write and when you close the note.</p>}
          </div>
        </>
      )}
    </aside>
  )
}
