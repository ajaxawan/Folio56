import { BlockNoteView, darkDefaultTheme, lightDefaultTheme, type Theme } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/mantine/style.css'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, ArrowLeft, Check, ChevronRight, Copy, Download, FilePlus2, FileText, History, LayoutTemplate,
  Image as ImageIcon, Layers, Lock, LockOpen, Maximize2, MessageCircle, Mic, Smile, Sparkles, Grid3x3, Minimize2, MoreHorizontal, Palette, Pin, Plus, Send, Sun, Tag, Trash2, Type,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COVERS, EMOJI, surface, swatch } from '../lib/colors'
import { inlineRefs, putImage, urlFor, useCoverCss } from '../lib/blobs'
import { labelColor } from './LabelMenu'
import { getSessionPasscode } from '../lib/crypto'
import {
  createNote, db, download, duplicateNote, hasPasscode, lockNote, patchNote, readLocked, saveAsTemplate,
  saveLockedContent, setTrashed, snapshot, unlockNote, updateNote,
} from '../lib/db'
import { editorExtensions, normalizeCode, schema } from '../lib/editorSchema'
import { fileToDataUrl, pickFile } from '../lib/image'
import { usePrefs } from '../lib/prefs'
import { derive } from '../lib/preview'
import type { Note, Version } from '../types'
import { ColorPicker } from './ColorPicker'
import { HistoryPanel } from './HistoryPanel'
import { LabelPicker } from './LabelPicker'
import { PasscodeDialog } from './PasscodeDialog'
import { IconButton, MenuItem, Popover, Segmented, Switch } from './ui'
import { sendNotes } from '../lib/parcelBus'
import { useKeyboardOpen, usePhone } from '../lib/mobile'
import { KeyboardBar } from './KeyboardBar'
import { MemoBanner } from './MemoBanner'
import { FormaliseSheet } from './FormaliseSheet'
import { CopySheet } from './CopySheet'
import { DictateBar } from './DictateBar'
import { SeriesSheet } from './SeriesSheet'
import { shareableBlocks } from '../lib/message'
import { formaliseText, isProcessing, processMemo } from '../lib/voice'

const makeTheme = (dark = true): Theme => ({
  ...(dark ? darkDefaultTheme : lightDefaultTheme),
  colors: {
    ...(dark ? darkDefaultTheme : lightDefaultTheme).colors,
    editor: { text: 'var(--color-ink)', background: 'transparent' },
    menu: { text: 'var(--color-ink)', background: 'var(--color-pop)' },
    tooltip: { text: 'var(--color-ink)', background: 'var(--color-raised)' },
    hovered: { text: 'var(--color-ink)', background: 'var(--color-wash-2)' },
    selected: { text: 'var(--color-on-accent)', background: 'var(--color-accent)' },
    disabled: { text: 'var(--color-faint)', background: 'var(--color-pop)' },
    border: 'var(--color-line)',
    shadow: dark ? 'rgba(0,0,0,.55)' : 'rgba(40,32,20,.16)',
    sideMenu: 'var(--color-faint)',
  },
  borderRadius: 8,
  fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
})

type Ask = null | { mode: 'set' | 'enter'; then: (p: string) => void }

/** What a host (Margins) can do with an embedded editor. */
export interface EditorApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  append: (blocks: any[]) => void
  markdown: () => Promise<string>
}

export function NoteEditor({ id, onClose, onNavigate, focus, setFocus, embedded, onReady }: {
  id: string; onClose: () => void; onNavigate: (id: string) => void; focus: boolean; setFocus: (v: boolean) => void
  /** Shown beside something else (the PDF in Margins): compact header, full width, Esc left to the host. */
  embedded?: boolean; onReady?: (api: EditorApi | null) => void
}) {
  const note = useLiveQuery(() => db.notes.get(id), [id])
  const [content, setContent] = useState<unknown[] | null>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [error, setError] = useState('')

  // Resolve content: plain notes directly, locked notes after passcode.
  const lockedNow = note?.locked
  useEffect(() => {
    setContent(null); setError('')
    if (!note) return
    if (!note.locked) return // plain notes read straight from the note (below), with no empty frame first
    const pass = getSessionPasscode()
    if (pass) readLocked(note, pass).then(setContent).catch(() => setError('Could not decrypt this note.'))
    else setAsk({ mode: 'enter', then: (p) => readLocked(note, p).then(setContent).catch(() => setError('Could not decrypt this note.')) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, lockedNow])

  if (note === undefined) return null
  // A plain note's editor is created from the note as it is at mount time; when Folio rewrites the
  // page (memo.v changes) the key changes and the editor is rebuilt from the new content.
  const initial = note && !note.locked ? (note.content ?? []) : content
  if (note === null || !note) return <div className="p-10 text-muted">This note no longer exists. <button className="text-accent-ink" onClick={onClose}>Go back</button></div>
  return (
    <>
      {initial ? (
        <EditorPage key={`${note.id}:${note.locked}:${note.memo?.v ?? 0}`} note={note} initial={initial} onClose={onClose} onNavigate={onNavigate} focus={focus} setFocus={setFocus} setAsk={setAsk} embedded={embedded} onReady={onReady} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
          <Lock size={36} />
          <p className="text-[15px]">{error || 'This note is locked'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] hover:bg-wash">Back</button>
            {!ask && <button type="button" onClick={() => setAsk({ mode: 'enter', then: (p) => readLocked(note, p).then(setContent).catch(() => setError('Could not decrypt this note.')) })}
              className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent">Unlock</button>}
          </div>
        </div>
      )}
      {ask && <PasscodeDialog mode={ask.mode} onCancel={() => setAsk(null)} onDone={(p) => { const t = ask.then; setAsk(null); t(p) }} />}
    </>
  )
}

function EditorPage({ note, initial, onClose, onNavigate, focus, setFocus, setAsk, embedded, onReady }: {
  note: Note; initial: unknown[]; onClose: () => void; onNavigate: (id: string) => void; focus: boolean; setFocus: (v: boolean) => void; setAsk: (a: Ask) => void
  embedded?: boolean; onReady?: (api: EditorApi | null) => void
}) {
  const { prefs, set, dark } = usePrefs()
  const [title, setTitle] = useState(note.title)
  const [menu, setMenu] = useState<null | 'type' | 'more' | 'color' | 'labels' | 'icon' | 'cover' | 'paper'>(null)
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved')
  const [history, setHistory] = useState(false)
  const [stats, setStats] = useState(() => derive(initial as never[]).words)
  const [chars, setChars] = useState(false)
  const phone = usePhone()
  const kbOpen = useKeyboardOpen()
  const [edFocus, setEdFocus] = useState(false)
  const [formalise, setFormalise] = useState(false)
  // Calm writing (laptop): once you start typing, the page's controls fade back until the mouse moves.
  const [calm, setCalm] = useState(false)
  const fineRef = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  useEffect(() => {
    if (!calm) return
    const wake = () => setCalm(false)
    window.addEventListener('mousemove', wake, { once: true })
    return () => window.removeEventListener('mousemove', wake)
  }, [calm])
  const [copyMsg, setCopyMsg] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const busy = !!note.memo && (note.memo.status === 'transcribing' || note.memo.status === 'writing') && isProcessing(note.id)
  // Only this page's sub-pages and its ancestors — not the whole library (matters with thousands of notes).
  const kids = useLiveQuery(() => db.notes.where('parentId').equals(note.id).toArray(), [note.id]) ?? []
  const crumbs = useLiveQuery(async () => {
    const out: Note[] = []; let p = note.parentId; let guard = 0
    while (p && guard++ < 32) { const n = await db.notes.get(p); if (!n) break; out.unshift(n); p = n.parentId }
    return out
  }, [note.parentId]) ?? []
  const labels = useLiveQuery(() => db.labels.toArray(), []) ?? []
  const timer = useRef<number | undefined>(undefined)
  const mountV = note.memo ? (note.memo.v ?? 0) : undefined
  const dirty = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const theme = useMemo(() => makeTheme(dark), [dark])

  const editor = useCreateBlockNote({
    schema,
    extensions: editorExtensions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: (initial?.length ? normalizeCode(initial) : undefined) as any,
    // Images are stored once in the image store; a locked note keeps them inside its encrypted text instead.
    uploadFile: async (file: File) => (note.locked ? fileToDataUrl(file) : putImage(await fileToDataUrl(file))),
    resolveFileUrl: (url: string) => urlFor(url),
    animations: false,
    domAttributes: { editor: { 'aria-label': 'Note text' } },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMd = useCallback(async (includeFolded: boolean) => String(await Promise.resolve(editor.blocksToMarkdownLossy(shareableBlocks(editor.document, includeFolded) as any))), [editor])
  const persist = useCallback(async (extra: Partial<Note> = {}) => {
    window.clearTimeout(timer.current)
    // Folio rewrote this page (voice memo / formalise) since this editor opened: never save over it.
    if (mountV !== undefined && ((await db.notes.get(note.id))?.memo?.v ?? 0) !== mountV) return
    const doc = editor.document
    if (note.locked) {
      const pass = getSessionPasscode(); if (!pass) return
      await saveLockedContent(note.id, doc, pass, extra.title ?? undefined)
      if (Object.keys(extra).some((k) => k !== 'title')) await patchNote(note.id, extra)
    } else await updateNote(note.id, { content: doc, ...extra })
    setSaved('saved')
  }, [editor, note.id, note.locked, mountV])

  const onChange = () => {
    if (fineRef.current && (document.activeElement as HTMLElement | null)?.closest?.('.bn-editor')) setCalm(true)
    dirty.current = true
    setSaved('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { persist(); setStats(derive(editor.document).words) }, 450)
  }

  // Leaving the page (or closing the Margins notes panel) never drops the last keystrokes.
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void persistRef.current() } }, [])

  // Let a host add blocks (quotes, page snapshots…) to the end of this page.
  useEffect(() => {
    if (!onReady) return
    onReady({
      append: (blocks) => {
        const doc = editor.document
        const last = doc[doc.length - 1]
        const lastEmpty = last && last.type === 'paragraph' && !(Array.isArray(last.content) && last.content.length)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (doc.length === 1 && lastEmpty) editor.replaceBlocks([last], blocks as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else editor.insertBlocks(blocks as any, lastEmpty && doc.length > 1 ? doc[doc.length - 2] : last, 'after')
        requestAnimationFrame(() => { const r = scroller.current; if (r) r.scrollTo({ top: r.scrollHeight, behavior: 'smooth' }) })
      },
      markdown: () => getMd(true),
    })
    return () => onReady(null)
  }, [editor, onReady, getMd])

  // periodic snapshot while writing
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (!dirty.current || note.locked) return
      dirty.current = false
      const fresh = await db.notes.get(note.id); if (fresh) snapshot(fresh)
    }, 5 * 60 * 1000)
    return () => window.clearInterval(t)
  }, [note.id, note.locked])

  const finish = async () => {
    await persist({ title: title.trim() })
    const fresh = await db.notes.get(note.id)
    if (!fresh) return
    const hasKids = kids.length > 0
    if (!fresh.locked && !fresh.title && !fresh.preview && !fresh.checklist.length && !fresh.image && !hasKids) { await db.notes.delete(note.id); return }
    await snapshot(fresh)
  }
  const close = async () => { await finish(); setFocus(false); onClose() }
  const go = async (id: string) => { await finish(); onNavigate(id) }

  // keyboard: Esc leaves focus mode, then closes; Ctrl+Shift+F focus; Ctrl+S save version
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !embedded && !document.querySelector('.bn-suggestion-menu, [data-popover], [role="dialog"]')) { if (focus) setFocus(false); else close() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocus(!focus) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persist().then(async () => { const f = await db.notes.get(note.id); if (f) snapshot(f) }) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // focus dimming + typewriter scrolling follow the cursor
  const [activeBlock, setActiveBlock] = useState('')
  const markActive = useCallback(() => {
    if (!focus) return
    try { setActiveBlock(editor.getTextCursorPosition().block.id) } catch { /* no cursor */ }
  }, [editor, focus])
  useEffect(() => { markActive(); if (focus) editor.focus() }, [focus, markActive, editor])
  useEffect(() => editor.onSelectionChange(() => {
    const root = scroller.current; if (!root) return
    markActive()
    if (prefs.typewriter) {
      const sel = window.getSelection(); if (!sel?.rangeCount) return
      const r = sel.getRangeAt(0).getBoundingClientRect(); if (!r.height) return
      const box = root.getBoundingClientRect()
      const target = box.top + box.height * 0.42
      root.scrollBy({ top: r.top - target, behavior: 'smooth' })
    }
  }), [editor, markActive, prefs.typewriter])

  // autosize title
  useEffect(() => { const t = titleRef.current; if (t) { t.style.height = '0px'; t.style.height = t.scrollHeight + 'px' } }, [title, prefs.font, prefs.width])

  const children = kids.filter((n) => n.trashedAt === null)
  const noteLabels = labels.filter((l) => note.labels.includes(l.id))
  const s = surface(note.color, dark, prefs.cardStyle)
  const tint = note.color === 'default' ? 'transparent' : prefs.cardStyle === 'vivid' ? swatch(note.color, dark) : s.background
  const cover = useCoverCss(note.cover)
  // Pages with tables get a wider column automatically, so tables have room to breathe.
  const hasTable = useMemo(() => (initial as { type?: string }[]).some((b) => b?.type === 'table'), [initial])
  const maxW = embedded ? 'max-w-none' : prefs.width === 'wide' ? 'max-w-[1180px]' : hasTable ? 'max-w-[1000px]' : 'max-w-[820px]'
  const size = prefs.textSize === 'sm' ? '15px' : prefs.textSize === 'lg' ? '18px' : '16.5px'
  const readMin = Math.max(1, Math.round(stats / 220))

  const withPass = (fn: (p: string) => void) => {
    const p = getSessionPasscode(); if (p) return fn(p)
    hasPasscode().then((has) => setAsk({ mode: has ? 'enter' : 'set', then: fn }))
  }
  const toggleLock = async () => {
    setMenu(null)
    await persist({ title: title.trim() })
    if (note.locked) withPass((p) => unlockNote(note.id, p))
    else withPass((p) => lockNote(note.id, p))
  }
  const exportMd = async () => {
    setMenu(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = await Promise.resolve(editor.blocksToMarkdownLossy((await inlineRefs(editor.document)) as any))
    download(`${(title || 'note').replace(/[^\w\- ]+/g, '').trim() || 'note'}.md`, new Blob([`# ${title || 'Untitled'}\n\n${md}`], { type: 'text/markdown' }))
  }
  const restore = async (v: Version) => {
    await persist() ; const cur = await db.notes.get(note.id); if (cur) await snapshot(cur)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.replaceBlocks(editor.document, (v.content?.length ? v.content : [{ type: 'paragraph' }]) as any)
    setTitle(v.title); await persist({ title: v.title }); setHistory(false)
  }

  return (
    <div className={`editor-veil flex h-full min-w-0 ${embedded ? 'note-embedded' : ''}`} style={embedded ? undefined : { viewTransitionName: `note-${note.id}` } as React.CSSProperties}>
      <div className="relative flex min-w-0 flex-1 flex-col" style={{ background: `linear-gradient(to bottom, ${tint === 'transparent' ? 'color-mix(in srgb, var(--color-accent) 9%, transparent)' : `color-mix(in srgb, ${tint} 55%, transparent)`}, transparent 320px)` }}>
        {/* header */}
        <header className={`z-20 box-content flex h-12 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-opacity max-sm:h-13 duration-500 ${focus ? 'opacity-0 hover:opacity-100 focus-within:opacity-100' : calm ? 'opacity-20 hover:opacity-100' : ''}`}>
          {!embedded && <IconButton label="Back (Esc)" onClick={close}><ArrowLeft size={19} /></IconButton>}
          <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13px] text-muted">
            {crumbs.map((c) => (
              <span key={c.id} className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => go(c.id)} className="max-w-40 truncate rounded-md px-1.5 py-1 hover:bg-wash hover:text-ink">{c.title || 'Untitled'}</button>
                <ChevronRight size={13} />
              </span>
            ))}
            <span className="truncate px-1.5 text-ink-2">{title || 'Untitled'}</span>
          </nav>
          <span className="hidden items-center gap-1 px-2 text-[12px] text-faint sm:flex">
            {saved === 'saving' ? 'Saving…' : <><Check size={13} className="text-accent" /> Saved</>}
          </span>
          {phone && kbOpen && <button type="button" onClick={() => (document.activeElement as HTMLElement | null)?.blur()} className="rounded-full px-3 py-1.5 text-[15px] font-semibold text-accent">Done</button>}
          {!busy && <IconButton label="Dictate into this page" active={dictating} onClick={() => setDictating(!dictating)} className="max-sm:hidden"><Mic size={18} /></IconButton>}
          <div className="relative max-sm:hidden">
            <IconButton label="Text options" active={menu === 'type'} onClick={() => setMenu(menu === 'type' ? null : 'type')}><Type size={18} /></IconButton>
            <Popover open={menu === 'type'} onClose={() => setMenu(null)} className="right-0 top-11 w-72 p-3">
              <div className="mb-1.5 text-[12px] text-muted">Font</div>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {(['sans', 'serif', 'mono'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => set({ font: f })}
                    className={`rounded-lg border py-2 text-center ${prefs.font === f ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
                    <div className={`text-[20px] ${f === 'serif' ? 'font-serif' : f === 'mono' ? 'font-mono' : 'font-sans'}`}>Ag</div>
                    <div className="text-[11px] capitalize">{f === 'sans' ? 'Default' : f}</div>
                  </button>
                ))}
              </div>
              <div className="mb-1.5 text-[12px] text-muted">Size</div>
              <div className="mb-3"><Segmented value={prefs.textSize} onChange={(v) => set({ textSize: v })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} /></div>
              <div className="mb-1.5 text-[12px] text-muted">Page width</div>
              <div className="mb-2"><Segmented value={prefs.width} onChange={(v) => set({ width: v })} options={[{ value: 'narrow', label: 'Readable' }, { value: 'wide', label: 'Wide' }]} /></div>
              <Switch label="Typewriter scrolling" checked={prefs.typewriter} onChange={(v) => set({ typewriter: v })} />
              <Switch label="Word count" checked={prefs.showCounts} onChange={(v) => set({ showCounts: v })} />
            </Popover>
          </div>
          {!embedded && <IconButton label={focus ? 'Exit focus (Ctrl+Shift+F)' : 'Focus mode (Ctrl+Shift+F)'} active={focus} onClick={() => setFocus(!focus)} className="max-sm:hidden">
            {focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </IconButton>}
          <IconButton label="Version history" active={history} onClick={() => setHistory(!history)} className="max-sm:hidden"><History size={18} /></IconButton>
          <IconButton label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => patchNote(note.id, { pinned: !note.pinned })} className="max-sm:hidden">
            <Pin size={18} className={note.pinned ? 'fill-current' : ''} />
          </IconButton>
          <div className="relative">
            <IconButton label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><MoreHorizontal size={19} /></IconButton>
            <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="right-0 top-11 w-60">
              {phone && <div className="px-3 pb-2 text-[12.5px] text-muted">{stats} {stats === 1 ? 'word' : 'words'} · {readMin} min read · {saved === 'saving' ? 'Saving…' : 'Saved'}</div>}
              <div className="px-1 pb-1"><ColorPicker value={note.color} onChange={(color) => patchNote(note.id, { color })} /></div>
              {phone && <>
                <div className="my-1 h-px bg-line" />
                <MenuItem icon={<Mic size={15} />} onClick={() => { setMenu(null); setDictating(true) }}>Dictate into this page</MenuItem>
                <MenuItem icon={<Type size={15} />} onClick={() => setMenu('type')}>Text & page options</MenuItem>
                <MenuItem icon={<History size={15} />} onClick={() => { setMenu(null); setHistory(true) }}>Version history</MenuItem>
                <MenuItem icon={<Maximize2 size={15} />} onClick={() => { setMenu(null); setFocus(!focus) }}>{focus ? 'Exit focus mode' : 'Focus mode'}</MenuItem>
              </>}
              <div className="my-1 h-px bg-line" />
              {!note.locked && <MenuItem icon={<Sparkles size={15} />} onClick={() => { setMenu(null); setFormalise(true) }}>{note.memo?.transcript && note.memo.source !== 'text' ? 'Rewrite from recording…' : 'Formalise with AI…'}</MenuItem>}
              {!note.locked && <MenuItem icon={<MessageCircle size={15} />} onClick={() => { setMenu(null); setCopyMsg(true) }}>Copy as message…</MenuItem>}
              <MenuItem icon={<Layers size={15} />} hint={note.series ?? undefined} onClick={() => { setMenu(null); setSeriesOpen(true) }}>{note.series ? 'Series' : 'Add to a series…'}</MenuItem>
              <MenuItem icon={<Pin size={15} />} onClick={() => { setMenu(null); patchNote(note.id, { pinned: !note.pinned }) }}>{note.pinned ? 'Unpin' : 'Pin'}</MenuItem>
              <MenuItem icon={note.locked ? <LockOpen size={15} /> : <Lock size={15} />} onClick={toggleLock}>{note.locked ? 'Remove lock' : 'Lock with passcode'}</MenuItem>
              <MenuItem icon={<LayoutTemplate size={15} />} onClick={async () => { setMenu(null); const name = prompt('Template name', title || 'My template'); if (name) { await persist(); const f = await db.notes.get(note.id); if (f) await saveAsTemplate({ ...f, content: editor.document }, name) } }}>Save as template</MenuItem>
              <MenuItem icon={<Copy size={15} />} onClick={async () => { setMenu(null); await persist(); const f = await db.notes.get(note.id); if (f && !f.locked) { const n = await duplicateNote(f); go(n.id) } }}>Duplicate</MenuItem>
              {!note.locked && <MenuItem icon={<Send size={15} />} onClick={async () => { setMenu(null); await persist(); sendNotes([note.id]) }}>Share as link…</MenuItem>}
              <MenuItem icon={<Download size={15} />} onClick={exportMd}>Export as Markdown</MenuItem>
              <MenuItem icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={async () => { setMenu(null); await patchNote(note.id, { archived: !note.archived, pinned: false }); close() }}>{note.archived ? 'Unarchive' : 'Archive'}</MenuItem>
              <MenuItem icon={<Trash2 size={15} />} danger onClick={async () => { setMenu(null); window.clearTimeout(timer.current); await setTrashed(note.id, true); setFocus(false); onClose() }}>Move to trash</MenuItem>
            </Popover>
          </div>
        </header>

        {focus && activeBlock && <style>{`.focus-dim .bn-block-outer[data-id="${activeBlock}"], .focus-dim .bn-block-outer:has(.bn-block-outer[data-id="${activeBlock}"]) { opacity: 1 !important; } .focus-dim .bn-block-outer[data-id="${activeBlock}"] .bn-block-outer { opacity: 1; }`}</style>}
        {/* writing surface */}
        <div ref={scroller} className={`folio-editor min-h-0 flex-1 overflow-y-auto ${hasTable && !embedded && prefs.width !== 'wide' ? 'wide-tables' : ''} ${focus ? 'focus-dim' : ''} ${note.paper && note.paper !== 'none' ? `paper-${note.paper}` : ''}`} data-font={prefs.font} style={{ ['--ed-size' as string]: size }}>
          {cover && (
            <div className="group/cover relative h-40 w-full sm:h-56" style={{ background: cover }}>
              <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 coarse:opacity-100">
                <button type="button" onClick={() => setMenu('cover')} className="rounded-md bg-black/45 px-2.5 py-1 text-[12px] text-white backdrop-blur hover:bg-black/60">Change cover</button>
                <button type="button" onClick={() => patchNote(note.id, { cover: null })} className="rounded-md bg-black/45 px-2.5 py-1 text-[12px] text-white backdrop-blur hover:bg-black/60">Remove</button>
              </div>
            </div>
          )}
          <div className={`mx-auto w-full ${maxW} pb-[40vh] ${cover ? (note.icon ? 'pt-0' : 'pt-6') : 'pt-6 sm:pt-12'}`}>
            <div className="group/head px-[26px] sm:px-[54px]">
              {note.icon && (
                <div className="relative">
                  <button type="button" title="Change icon" onClick={() => setMenu(menu === 'icon' ? null : 'icon')}
                    className={`rounded-xl text-[56px] leading-none transition hover:bg-wash sm:text-[64px] ${cover ? '-mt-10 sm:-mt-12' : ''}`}>{note.icon}</button>
                </div>
              )}
              {/* add icon / cover / paper */}
              <div className={`relative mb-1 mt-2 flex flex-wrap gap-1 text-[12.5px] text-muted transition-opacity ${focus ? 'opacity-0' : 'opacity-0 group-hover/head:opacity-100 focus-within:opacity-100 coarse:opacity-100'}`}>
                {!note.icon && <button type="button" onClick={() => setMenu(menu === 'icon' ? null : 'icon')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><Smile size={14} /> Add icon</button>}
                {!note.cover && <button type="button" onClick={() => setMenu(menu === 'cover' ? null : 'cover')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><ImageIcon size={14} /> Add cover</button>}
                <button type="button" onClick={() => setMenu(menu === 'paper' ? null : 'paper')} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-wash hover:text-ink"><Grid3x3 size={14} /> Paper</button>
                <Popover open={menu === 'icon'} onClose={() => setMenu(null)} className="left-0 top-8 w-[296px] p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI.map((e) => <button key={e} type="button" onClick={() => { patchNote(note.id, { icon: e }); setMenu(null) }} className="flex h-8 w-8 items-center justify-center rounded-md text-[20px] hover:bg-wash">{e}</button>)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                    <input aria-label="Type any emoji" placeholder="Or type any emoji" maxLength={4} onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) { patchNote(note.id, { icon: v }); setMenu(null) } }}
                      className="min-w-0 flex-1 rounded-md bg-wash px-2 py-1.5 text-[13px] outline-none" />
                    {note.icon && <button type="button" onClick={() => { patchNote(note.id, { icon: null }); setMenu(null) }} className="rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-wash">Remove</button>}
                  </div>
                </Popover>
                <Popover open={menu === 'cover'} onClose={() => setMenu(null)} className="left-0 top-8 w-[320px] p-2.5">
                  <div className="mb-2 text-[12px] text-muted">Gradients</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(COVERS).map(([k, v]) => <button key={k} type="button" title={k} onClick={() => { patchNote(note.id, { cover: `g:${k}` }); setMenu(null) }} className="h-12 rounded-lg ring-accent hover:ring-2" style={{ background: v }} />)}
                  </div>
                  <button type="button" onClick={async () => { setMenu(null); const f = await pickFile(); if (f) patchNote(note.id, { cover: await putImage(await fileToDataUrl(f, 2000, 0.82)) }) }}
                    className="mt-2 w-full rounded-lg bg-wash py-2 text-[13px] hover:bg-wash-2">Upload an image…</button>
                </Popover>
                <Popover open={menu === 'paper'} onClose={() => setMenu(null)} className="left-0 top-8 w-[260px] p-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['none', 'grid', 'dots', 'lines'] as const).map((k) => (
                      <button key={k} type="button" onClick={() => { patchNote(note.id, { paper: k }); setMenu(null) }}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] capitalize ${(note.paper ?? 'none') === k ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
                        <span className={`h-10 w-full rounded-md bg-card ${k !== 'none' ? `paper-${k} dense` : ''}`} />{k}
                      </button>
                    ))}
                  </div>
                </Popover>
              </div>
              <textarea ref={titleRef} rows={1} value={title} aria-label="Title" placeholder="Untitled"
                onChange={(e) => { setTitle(e.target.value); setSaved('saving') }}
                onBlur={() => persist({ title: title.trim() })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); editor.setTextCursorPosition(editor.document[0], 'start') } }}
                className={`font-title block w-full resize-none overflow-hidden bg-transparent text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-ink outline-none placeholder:text-faint/60 sm:text-[42px] ${prefs.font === 'mono' ? '!font-mono !text-[28px]' : ''}`} />

              {/* properties */}
              <div className={`mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted ${focus ? 'opacity-0' : ''}`}>
                {note.daily && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-600 dark:text-star"><Sun size={12} /> Daily note</span>}
                {note.locked && <span className="inline-flex items-center gap-1 rounded-full bg-wash px-2.5 py-1"><Lock size={12} /> Encrypted</span>}
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === 'color' ? null : 'color')} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-wash">
                    <span className="h-3 w-3 rounded-full border border-line" style={{ background: swatch(note.color, dark) }} /> <Palette size={12} className="hidden" />Colour
                  </button>
                  <Popover open={menu === 'color'} onClose={() => setMenu(null)} className="left-0 top-8"><ColorPicker value={note.color} onChange={(color) => patchNote(note.id, { color })} /></Popover>
                </div>
                {noteLabels.map((l) => <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-2" style={{ background: `color-mix(in srgb, ${labelColor(l)} 16%, transparent)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: labelColor(l) }} />{l.name}</span>)}
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === 'labels' ? null : 'labels')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-wash">
                    <Tag size={12} /> {noteLabels.length ? 'Edit' : 'Add label'}
                  </button>
                  <Popover open={menu === 'labels'} onClose={() => setMenu(null)} className="left-0 top-8"><LabelPicker selected={note.labels} onChange={(ids) => patchNote(note.id, { labels: ids })} /></Popover>
                </div>
                <span className="px-2 py-1 text-faint">Created {new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="mt-5"><MemoBanner note={note} /></div>
            <div className={`min-h-[40vh] ${busy ? 'pointer-events-none opacity-60' : ''}`} onFocus={() => setEdFocus(true)} onBlur={() => setEdFocus(false)}>
              <BlockNoteView editor={editor} theme={theme} onChange={onChange} editable={!busy} />
            </div>

            {/* sub-pages */}
            <div className={`mt-10 px-[26px] sm:px-[54px] ${focus ? 'opacity-0' : ''}`}>
              {children.length > 0 && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Pages inside</div>}
              {children.map((ch) => (
                <button key={ch.id} type="button" onClick={() => go(ch.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[15px] text-ink-2 hover:bg-wash">
                  <FileText size={17} className="shrink-0 text-muted" />
                  <span className="truncate">{ch.title || 'Untitled'}</span>
                  {ch.locked && <Lock size={12} className="text-muted" />}
                </button>
              ))}
              <button type="button" onClick={async () => { const n = await createNote({ parentId: note.id, color: note.color }); go(n.id) }}
                className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] text-muted hover:bg-wash hover:text-ink">
                <FilePlus2 size={17} /> Add a page inside
              </button>
            </div>
          </div>
        </div>

        {/* status */}
        {prefs.showCounts && (
          <button type="button" onClick={() => setChars(!chars)} title="Toggle characters"
            className={`absolute bottom-3 right-4 rounded-full border border-line bg-pop/90 px-3 py-1 text-[12px] text-muted shadow-sm backdrop-blur hover:text-ink max-sm:hidden ${focus ? 'opacity-40 hover:opacity-100' : calm ? 'opacity-0' : ''} transition-opacity duration-500`}>
            {chars ? `${editor.document ? derivedChars(editor) : 0} characters` : `${stats} ${stats === 1 ? 'word' : 'words'} · ${readMin} min read`}
          </button>
        )}
        {!prefs.showCounts && <span className="hidden"><Plus /></span>}
        {phone && kbOpen && edFocus && !dictating && <KeyboardBar editor={editor} locked={note.locked} onDictate={() => setDictating(true)} />}
        {dictating && <DictateBar editor={editor} onClose={() => setDictating(false)} />}
      </div>

      {copyMsg && (
        <CopySheet title={title} onClose={() => setCopyMsg(false)}
          hasFolded={editor.document.some((b) => b.type === 'heading' && (b.props as { isToggleable?: boolean }).isToggleable)}
          getMarkdown={getMd} />
      )}
      {seriesOpen && <SeriesSheet ids={[note.id]} onClose={() => setSeriesOpen(false)} />}
      {formalise && (
        <FormaliseSheet fromRecording={!!note.memo?.transcript && note.memo.source !== 'text'} onClose={() => setFormalise(false)}
          onSettings={() => document.dispatchEvent(new CustomEvent('folio:settings'))}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getText={async () => Promise.resolve(editor.blocksToMarkdownLossy((await inlineRefs(editor.document)) as any))}
          onRun={async (style) => {
            await persist({ title: title.trim() })
            const fresh = await db.notes.get(note.id); if (!fresh) return
            if (fresh.memo?.transcript && fresh.memo.source !== 'text') void processMemo(note.id, { style })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else void formaliseText(fresh, `${title ? `# ${title}\n\n` : ''}${await Promise.resolve(editor.blocksToMarkdownLossy(editor.document as any))}`, style as 'minutes' | 'memo')
          }} />
      )}
      {history && (
        <div className="fixed inset-0 z-40 sm:static sm:z-auto">
          <HistoryPanel noteId={note.id} locked={note.locked} onClose={() => setHistory(false)} onRestore={restore}
            onSaveNow={async () => { await persist(); const f = await db.notes.get(note.id); if (f) await snapshot(f) }} />
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function derivedChars(editor: any) {
  let n = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (bs: any[]) => { for (const b of bs) { if (Array.isArray(b.content)) for (const c of b.content) n += (c.text ?? '').length; if (b.children) walk(b.children) } }
  walk(editor.document)
  return n
}

