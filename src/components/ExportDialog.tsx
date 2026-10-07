import { ClipboardCopy, FileCode2, FileText, FileType2, Globe, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Format, Options, Scope } from '../lib/exporter'
import { toast } from '../lib/toast'
import { Modal, Segmented, Switch } from './ui'

const FORMATS: { k: Format; label: string; ext: string; note: string; icon: React.ReactNode }[] = [
  { k: 'docx', label: 'Word', ext: '.docx', note: 'Opens in Word, Google Docs and Pages', icon: <FileType2 size={20} /> },
  { k: 'pdf', label: 'PDF', ext: 'print', note: 'Print, or choose “Save as PDF”', icon: <Printer size={20} /> },
  { k: 'md', label: 'Markdown', ext: '.md', note: 'For Obsidian, GitHub and other apps', icon: <FileCode2 size={20} /> },
  { k: 'html', label: 'Web page', ext: '.html', note: 'One file, images inside — opens anywhere', icon: <Globe size={20} /> },
  { k: 'txt', label: 'Plain text', ext: '.txt', note: 'Just the words', icon: <FileText size={20} /> },
]
const LAST = 'folio.exportFormat'

/** Export one note, a selection or everything — pick a format, see what's included, download. */
export function ExportDialog({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const [format, setFormat] = useState<Format>(() => { try { return (localStorage.getItem(LAST) as Format) || 'docx' } catch { return 'docx' } })
  const [pages, setPages] = useState(true)
  const [details, setDetails] = useState(false)
  const [images, setImages] = useState(true)
  const [separate, setSeparate] = useState<boolean | null>(null)
  const [info, setInfo] = useState<{ notes: number; inside: number; images: number; locked: number; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const single = !('all' in scope) && scope.ids.length === 1

  const key = JSON.stringify(scope)
  useEffect(() => {
    let dead = false
    import('../lib/exporter').then(async (m) => {
      const g = await m.gather(scope, pages)
      if (!dead) setInfo({ notes: g.docs.length - g.inside, inside: g.inside, images: g.images, locked: g.locked, title: g.docs[0]?.note.title || 'Untitled' })
    })
    return () => { dead = true }
  }, [key, pages]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = info ? info.notes + info.inside : 0
  // Markdown and many notes → separate files by default; documents → one file by default
  const sep = separate ?? ((format === 'md' && total > 1 && 'all' in scope) || false)
  const canSeparate = total > 1 && format !== 'pdf'
  const run = async () => {
    setBusy(true)
    try { localStorage.setItem(LAST, format) } catch { /* ignore */ }
    try {
      const m = await import('../lib/exporter')
      const o: Options = { format, pages, details, images, separate: canSeparate && sep }
      const r = await m.runExport(scope, o)
      toast(r.message); onClose()
    } catch (e) { console.error(e); toast(`Export failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const copy = async (kind: 'formatted' | 'markdown') => {
    if (!single) return
    try { const m = await import('../lib/exporter'); await m.copyNote((scope as { ids: string[] }).ids[0], kind); toast(kind === 'formatted' ? 'Copied — paste into Word, Outlook, Teams or Docs' : 'Copied as Markdown'); onClose() } catch { toast('Couldn’t copy — try exporting instead') }
  }
  const title = 'all' in scope ? 'Export all notes' : single ? `Export “${info?.title ?? '…'}”` : `Export ${scope.ids.length} notes`
  const cur = FORMATS.find((f) => f.k === format)!
  return (
    <Modal title={title} onClose={onClose} width="max-w-xl">
      <div role="radiogroup" aria-label="Format" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <button key={f.k} type="button" role="radio" aria-checked={format === f.k} onClick={() => setFormat(f.k)}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${format === f.k ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'border-line hover:border-muted/60'}`}>
            <span className={format === f.k ? 'text-accent' : 'text-muted'}>{f.icon}</span>
            <span className="text-[14px] font-semibold">{f.label} <span className="font-normal text-muted">{f.ext}</span></span>
            <span className="text-[11.5px] leading-4 text-muted">{f.note}</span>
          </button>
        ))}
        {single && (
          <div className="flex flex-col gap-1 rounded-xl border border-dashed border-line p-3">
            <span className="text-muted"><ClipboardCopy size={20} /></span>
            <span className="text-[14px] font-semibold">Copy</span>
            <span className="flex flex-wrap gap-x-2 text-[12px]"><button type="button" onClick={() => copy('formatted')} className="text-accent-ink underline-offset-2 hover:underline">Formatted</button><button type="button" onClick={() => copy('markdown')} className="text-accent-ink underline-offset-2 hover:underline">Markdown</button></span>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-line px-3 py-1">
        {(info?.inside ?? 0) > 0 || !single ? <Switch label={<span className="text-[13.5px]">Include pages inside{info?.inside ? <span className="text-muted"> · {info.inside}</span> : ''}</span>} checked={pages} onChange={setPages} /> : null}
        {format !== 'txt' && <Switch label={<span className="text-[13.5px]">Include images{info?.images ? <span className="text-muted"> · {info.images}</span> : ''}</span>} checked={images} onChange={setImages} />}
        <Switch label={<span className="text-[13.5px]">Dates and labels <span className="text-muted">{format === 'md' ? '· as front matter' : '· under each title'}</span></span>} checked={details} onChange={setDetails} />
        {canSeparate && (
          <div className="py-1.5">
            <Segmented value={sep ? 'many' : 'one'} onChange={(v) => setSeparate(v === 'many')}
              options={[{ value: 'one', label: format === 'md' ? 'One Markdown file' : 'One document' }, { value: 'many', label: 'Separate files (.zip)' }]} />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">
          {info ? <>{total} {total === 1 ? 'note' : 'notes'}{info.inside ? ` (${info.inside} inside)` : ''}{info.locked ? ` · ${info.locked} locked left out` : ''}{format === 'pdf' ? ' · opens the print dialog' : ''}</> : 'Counting…'}
        </p>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-muted hover:bg-wash">Cancel</button>
        <button type="button" onClick={run} disabled={busy || !total} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50">
          {busy ? 'Exporting…' : format === 'pdf' ? 'Print…' : `Export ${cur.ext}`}
        </button>
      </div>
    </Modal>
  )
}
