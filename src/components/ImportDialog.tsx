import { BlockNoteView, darkDefaultTheme, lightDefaultTheme } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, ClipboardPaste, Code2, FileText, FolderOpen, Image as ImageIcon, ListChecks, Table2, Tag, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dot, swatch } from '../lib/colors'
import { db } from '../lib/db'
import { importDocs, isImageFile, isMarkdownFile, parseMarkdown, relPath, resolveImages, type ImportOptions, type ParsedDoc } from '../lib/markdown'
import { editorExtensions, normalizeCode, schema } from '../lib/editorSchema'
import { usePrefs } from '../lib/prefs'
import type { ColorKey, Note } from '../types'
import { ColorPicker } from './ColorPicker'
import { LabelPicker } from './LabelPicker'
import { IconButton, Popover, Segmented } from './ui'

interface Raw { text: string; name: string; path: string }

export default function ImportDialog({ initialFiles, defaultLabelIds = [], onClose, onDone }: { initialFiles?: File[]; defaultLabelIds?: string[]; onClose: () => void; onDone: (notes: Note[]) => void }) {
  const { dark } = usePrefs()
  const [raws, setRaws] = useState<Raw[]>([])
  const [images, setImages] = useState<Map<string, File>>(new Map())
  const [tab, setTab] = useState<'files' | 'paste'>('files')
  const [paste, setPaste] = useState('')
  const [pasteName, setPasteName] = useState('')
  const [sel, setSel] = useState(0)
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const [opts, setOpts] = useState<ImportOptions>({ titleFrom: 'heading', keepFolders: true, parentId: null, labelIds: defaultLabelIds, color: null, remoteImages: 'link' })
  const [menu, setMenu] = useState<null | 'label' | 'color'>(null)
  const [busy, setBusy] = useState<null | number>(null)
  const [done, setDone] = useState<Note[] | null>(null)
  const [drag, setDrag] = useState(false)
  const folderInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pages = useLiveQuery(() => db.notes.filter((n) => n.trashedAt === null && !n.locked).toArray(), []) ?? []
  const labels = useLiveQuery(() => db.labels.toArray(), []) ?? []

  const addFiles = async (files: File[]) => {
    const imgs = new Map(images)
    const next: Raw[] = [...raws]
    for (const f of files) {
      if (isImageFile(f)) imgs.set(relPath(f), f)
      else if (isMarkdownFile(f)) { const p = relPath(f); next.push({ text: await f.text(), name: f.name, path: p.includes('/') ? p : '' }) }
    }
    next.sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name))
    setImages(imgs); setRaws(next)
  }
  useEffect(() => { if (initialFiles?.length) addFiles(initialFiles) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const docs: ParsedDoc[] = useMemo(() => raws.map((r) => parseMarkdown(r.text, r.name, r.path, opts)), [raws, opts.titleFrom, opts.remoteImages]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasFolders = raws.some((r) => r.path.split('/').length > 2)
  const chosen = docs.filter((_, i) => !skip.has(i))
  const current = docs[sel]

  const run = async () => {
    setBusy(0)
    const created = await importDocs(chosen, images, opts, (n) => setBusy(n))
    setBusy(null); setDone(created)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const items = [...e.dataTransfer.items]
    const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]
    if (entries.some((en) => en.isDirectory)) addFiles(await readEntries(entries))
    else addFiles([...e.dataTransfer.files])
  }

  return (
    <div className="animate-fade fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-label="Import Markdown" className="animate-pop flex h-full w-full max-w-5xl flex-col overflow-hidden border-line bg-pop text-ink shadow-2xl sm:h-[86vh] sm:rounded-2xl sm:border">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <Upload size={18} className="text-accent" />
          <div className="flex-1">
            <h2 className="font-title text-[18px] font-semibold">Import Markdown</h2>
            <p className="text-[12.5px] text-muted">From Claude, ChatGPT, Obsidian, Cherry Studio or any .md file. Stays on this device.</p>
          </div>
          <IconButton size="sm" label="Close" onClick={onClose}><X size={18} /></IconButton>
        </header>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle2 size={44} className="text-accent" />
            <p className="font-title text-[22px] font-semibold">Imported {done.length} {done.length === 1 ? 'note' : 'notes'}</p>
            <p className="max-w-sm text-[13.5px] text-muted">Headings, tables, code, checklists and quotes kept their formatting.{chosen.some((d) => d.missingImages.length) ? ' Some images were not found and are marked in the notes.' : ''}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setDone(null); setRaws([]); setSkip(new Set()); setSel(0) }} className="rounded-lg px-4 py-2 text-[14px] hover:bg-wash">Import more</button>
              <button type="button" onClick={() => onDone(done)} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent">{done.length === 1 ? 'Open note' : 'Done'}</button>
            </div>
          </div>
        ) : raws.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <div className="mb-4 w-64"><Segmented value={tab} onChange={setTab} options={[{ value: 'files', label: 'Files or folder' }, { value: 'paste', label: 'Paste' }]} /></div>
            {tab === 'files' ? (
              <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
                className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : 'border-line'}`}>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-wash"><FileText size={30} className="text-accent" /></div>
                <div>
                  <p className="font-title text-[20px] font-semibold">Drop .md files or a whole folder</p>
                  <p className="mt-1 text-[13.5px] text-muted">Front matter, the first # heading, tables, code, checklists, callouts and images in the folder are all kept.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent"><FileText size={16} /> Choose files</button>
                  <button type="button" onClick={() => folderInput.current?.click()} className="flex items-center gap-2 rounded-lg bg-wash px-4 py-2.5 text-[14px] hover:bg-wash-2"><FolderOpen size={16} /> Choose folder</button>
                </div>
                <input ref={fileInput} type="file" multiple accept=".md,.markdown,.mdown,.txt,text/markdown,image/*" hidden onChange={(e) => e.target.files && addFiles([...e.target.files])} />
                {/* @ts-expect-error non-standard but widely supported */}
                <input ref={folderInput} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => e.target.files && addFiles([...e.target.files])} />
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3">
                <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Title (optional — otherwise the first # heading)"
                  className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent" />
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Paste Markdown here, e.g. a whole reply copied from Claude…'}
                  className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-canvas p-3 font-mono text-[13px] leading-5 outline-none focus:border-accent" />
                <div className="flex justify-end">
                  <button type="button" disabled={!paste.trim()} onClick={() => setRaws([{ text: pasteName.trim() ? `---\ntitle: ${JSON.stringify(pasteName.trim())}\n---\n${paste}` : paste, name: 'Pasted note.md', path: '' }])}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent disabled:opacity-40"><ClipboardPaste size={16} /> Preview</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* options */}
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[13px]">
              <label className="flex items-center gap-2 text-muted">Title from
                <select value={opts.titleFrom} onChange={(e) => setOpts({ ...opts, titleFrom: e.target.value as 'heading' | 'filename' })} className="rounded-md border border-line bg-canvas px-2 py-1 text-ink">
                  <option value="heading">First # heading</option><option value="filename">File name</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-muted">Put in
                <select value={opts.parentId ?? ''} onChange={(e) => setOpts({ ...opts, parentId: e.target.value || null })} className="max-w-48 rounded-md border border-line bg-canvas px-2 py-1 text-ink">
                  <option value="">Notes (top level)</option>
                  {pages.sort((a, b) => a.title.localeCompare(b.title)).map((p) => <option key={p.id} value={p.id}>Inside: {p.icon ? p.icon + ' ' : ''}{p.title || 'Untitled'}</option>)}
                </select>
              </label>
              {hasFolders && (
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={opts.keepFolders} onChange={(e) => setOpts({ ...opts, keepFolders: e.target.checked })} className="accent-[var(--color-accent)]" /> Sub-folders → pages</label>
              )}
              <div className="relative">
                <button type="button" onClick={() => setMenu(menu === 'label' ? null : 'label')} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 hover:bg-wash">
                  <Tag size={13} /> {opts.labelIds.length ? labels.filter((l) => opts.labelIds.includes(l.id)).map((l) => l.name).join(', ') : 'Add label'}
                </button>
                <Popover open={menu === 'label'} onClose={() => setMenu(null)} className="left-0 top-9"><LabelPicker title="Label imported notes" selected={opts.labelIds} onChange={(labelIds) => setOpts({ ...opts, labelIds })} /></Popover>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setMenu(menu === 'color' ? null : 'color')} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 hover:bg-wash">
                  <span className="h-3 w-3 rounded-full border border-line" style={{ background: swatch(opts.color ?? 'default', dark) }} /> Colour
                </button>
                <Popover open={menu === 'color'} onClose={() => setMenu(null)} className="left-0 top-9"><ColorPicker value={opts.color ?? 'default'} onChange={(c: ColorKey) => setOpts({ ...opts, color: c === 'default' ? null : c })} /></Popover>
              </div>
              <label className="flex items-center gap-1.5" title="Images hosted online would load from the internet when you open the note">
                <input type="checkbox" checked={opts.remoteImages === 'keep'} onChange={(e) => setOpts({ ...opts, remoteImages: e.target.checked ? 'keep' : 'link' })} className="accent-[var(--color-accent)]" /> Load web images
              </label>
            </div>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              {/* file list */}
              <div className="max-h-48 shrink-0 overflow-y-auto border-b border-line p-2 sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r">
                <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-[12px] text-muted">
                  <span>{chosen.length} of {docs.length} selected</span>
                  <button type="button" onClick={() => { setRaws([]); setSkip(new Set()); setSel(0) }} className="hover:text-ink">Clear</button>
                </div>
                {docs.map((d, i) => (
                  <div key={i} onClick={() => setSel(i)} className={`mb-0.5 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 ${i === sel ? 'bg-wash-2' : 'hover:bg-wash'}`}>
                    <input type="checkbox" checked={!skip.has(i)} onClick={(e) => e.stopPropagation()} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} className="mt-1 accent-[var(--color-accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium">{d.icon ? d.icon + ' ' : ''}{d.title}</div>
                      {d.path && <div className="truncate text-[11px] text-faint">{d.path}</div>}
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
                        <span>{d.words} words</span>
                        {d.stats.tables > 0 && <span className="inline-flex items-center gap-0.5"><Table2 size={11} />{d.stats.tables}</span>}
                        {d.stats.code > 0 && <span className="inline-flex items-center gap-0.5"><Code2 size={11} />{d.stats.code}</span>}
                        {d.stats.tasks > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks size={11} />{d.stats.tasks}</span>}
                        {d.stats.images > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon size={11} />{d.stats.images}</span>}
                      </div>
                      {d.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-wash px-1.5 text-[10.5px] text-ink-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot(labels.find((l) => l.name.toLowerCase() === t.toLowerCase())?.color) }} />{t}</span>)}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {/* preview */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {current && <Preview key={`${sel}:${opts.titleFrom}:${opts.remoteImages}`} doc={current} images={images} dark={dark} />}
              </div>
            </div>

            <footer className="flex items-center gap-3 border-t border-line px-5 py-3">
              <p className="flex-1 text-[12.5px] text-muted">{busy !== null ? `Importing ${busy} / ${chosen.length}…` : hasFolders && opts.keepFolders ? 'Folders inside the picked folder become pages that contain their notes.' : 'Tags in front matter become labels. Relative images from the folder are embedded.'}</p>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] hover:bg-wash">Cancel</button>
              <button type="button" disabled={!chosen.length || busy !== null} onClick={run} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50">
                Import {chosen.length} {chosen.length === 1 ? 'note' : 'notes'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function Preview({ doc, images, dark }: { doc: ParsedDoc; images: Map<string, File>; dark: boolean }) {
  const [resolved, setResolved] = useState<ParsedDoc | null>(null)
  useEffect(() => { resolveImages(structuredClone(doc), images).then(setResolved) }, [doc, images])
  if (!resolved) return null
  return <PreviewBody doc={resolved} dark={dark} />
}

function PreviewBody({ doc, dark }: { doc: ParsedDoc; dark: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({ schema, extensions: editorExtensions, initialContent: (doc.blocks.length ? normalizeCode(doc.blocks) : undefined) as any })
  const base = dark ? darkDefaultTheme : lightDefaultTheme
  return (
    <div className="folio-editor mx-auto max-w-[760px] px-0 py-6">
      <div className="px-[26px] sm:px-[54px]">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-faint">Preview</div>
        <h1 className="font-title mb-2 text-[32px] font-bold leading-tight">{doc.icon ? doc.icon + ' ' : ''}{doc.title}</h1>
        {doc.missingImages.length > 0 && (
          <p className="mb-3 flex items-center gap-1.5 text-[12.5px] text-amber-600 dark:text-warn"><AlertTriangle size={14} /> {doc.missingImages.length} image(s) not found — pick the whole folder to include them.</p>
        )}
      </div>
      <BlockNoteView editor={editor} editable={false} theme={{ ...base, colors: { ...base.colors, editor: { text: 'var(--color-ink)', background: 'transparent' }, menu: { text: 'var(--color-ink)', background: 'var(--color-pop)' } } }} />
    </div>
  )
}

/** Walk dropped folders (drag & drop) into a flat File list with webkitRelativePath-like paths. */
async function readEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = []
  const walk = async (entry: FileSystemEntry, path: string) => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name })
      out.push(f)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      let batch: FileSystemEntry[] = []
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        for (const e of batch) await walk(e, `${path}${entry.name}/`)
      } while (batch.length)
    }
  }
  for (const e of entries) await walk(e, '')
  return out
}
