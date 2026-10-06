import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, ArrowDownUp, BookOpen, BookOpenText, MoreHorizontal, FileDown, FileUp, CheckSquare, Download, FileText, LayoutGrid, LayoutTemplate, Lightbulb, List, Menu, Moon,
  Layers, Link2, Mic, PanelLeftOpen, Palette, Pin, RotateCcw, Search, Send, Settings as SettingsIcon, SquarePen, Sun, Tag, Trash2, X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Board } from './components/Board'
import { EmptyArt } from './components/EmptyArt'
import { Atmosphere, Wallpaper } from './components/Atmosphere'
import { ErrorBoundary } from './components/Safety'
import { Wordmark } from './components/Brand'
import { BottomBar, Rail } from './components/NavBars'
import { ColorPicker } from './components/ColorPicker'
import type { Command } from './components/CommandPalette'
import { Composer } from './components/Composer'
import { LabelPicker } from './components/LabelPicker'
import { PagesView } from './components/PagesView'
import { receiveParcel, sendNotes, useParcelRequest } from './lib/parcelBus'
import { Sidebar } from './components/Sidebar'
import { TasksView } from './components/TasksView'
import { JournalView } from './components/JournalView'
import { TodayHero } from './components/TodayHero'
import { LabelMenu, labelColor, registerLabels } from './components/LabelMenu'
import { IconButton, MenuItem, Popover, Segmented } from './components/ui'
import { addLabelToMany, createFromTemplate, createNote, db, deleteForever, emptyTrash, exportAll, openDaily, patchMany, setTrashed } from './lib/db'
import { getDeviceName, setDeviceName } from './lib/device'
import { fileToDataUrl, pickFile } from './lib/image'
import { putImage } from './lib/blobs'
import { textToBlocks } from './lib/preview'
import { usePhone } from './lib/mobile'
import { InstallHint } from './components/InstallHint'
import { Toaster } from './components/Toaster'
import { toast } from './lib/toast'
import { LIGHT_THEMES, THEMES, usePrefs } from './lib/prefs'
import type { Label, Note, View } from './types'

const ImportDialog = lazy(() => import('./components/ImportDialog'))
// Dialogs load on first use, so the first screen only downloads what it shows.
const CommandPalette = lazy(() => import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })))
const SettingsDialog = lazy(() => import('./components/SettingsDialog').then((m) => ({ default: m.SettingsDialog })))
const TemplatesDialog = lazy(() => import('./components/TemplatesDialog').then((m) => ({ default: m.TemplatesDialog })))
const ParcelHost = lazy(() => import('./components/ParcelDialogs').then((m) => ({ default: m.ParcelHost })))
const NoteEditor = lazy(() => import('./components/NoteEditor').then((m) => ({ default: m.NoteEditor })))
const CreateSheet = lazy(() => import('./components/CreateSheet').then((m) => ({ default: m.CreateSheet })))
const SeriesSheet = lazy(() => import('./components/SeriesSheet').then((m) => ({ default: m.SeriesSheet })))
const Margins = lazy(() => import('./components/Margins'))
const VoiceRecorder = lazy(() => import('./components/VoiceRecorder').then((m) => ({ default: m.VoiceRecorder })))

/** Run a state change inside a View Transition when the browser supports it (card ⇄ page morph). */
/**
 * Card ⇄ editor morph. Only the one card being opened/closed carries the shared name, and only
 * for the length of the transition — so moving cards, drag ghosts and the drag overlay never clash.
 */
function transition(fn: () => void, noteId?: string | null) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return fn()
  const tag = () => {
    if (!noteId) return
    const card = document.querySelector<HTMLElement>(`article[data-note="${CSS.escape(noteId)}"]`)
    if (card) card.style.viewTransitionName = `note-${noteId}`
  }
  const clear = () => document.querySelectorAll<HTMLElement>('article[data-note]').forEach((el) => { el.style.viewTransitionName = '' })
  tag()
  const vt = doc.startViewTransition(() => { flushSync(fn); tag() })
  vt.finished.finally(clear)
}
// Stable empties so memoised views don't recompute while the database is still opening.
const NO_NOTES: Note[] = []
const NO_LABELS: Label[] = []
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')

const isTyping = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName)) }

export default function App() {
  const { prefs, set, dark } = usePrefs()
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? NO_NOTES
  const labels = useLiveQuery(() => db.labels.orderBy('name').toArray(), []) ?? NO_LABELS
  useMemo(() => registerLabels(labels), [labels])
  const [view, setViewRaw] = useState<View>({ kind: 'notes' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [focus, setFocus] = useState(false)
  const [palette, setPalette] = useState(false)
  const [settings, setSettings] = useState(false)
  const [templates, setTemplates] = useState(false)
  const [sidebar, setSidebar] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState<null | 'sort' | 'phoneMenu' | 'bulkColor' | 'bulkLabel' | 'labelMenu'>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const parcelReq = useParcelRequest()
  const openRef = useRef<string | null>(null)
  useEffect(() => { openRef.current = openId }, [openId])
  const [deviceName, setName] = useState(getDeviceName)
  const [importing, setImporting] = useState<null | File[]>(null)
  const [dropHint, setDropHint] = useState(false)
  const [create, setCreate] = useState(false)
  const [stackIds, setStackIds] = useState<string[] | null>(null)
  const [stackHint, setStackHint] = useState<null | { ids: string[]; name: string }>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hintTick, setHintTick] = useState(0)
  const toggleStack = useCallback((series: string) => setExpanded((e) => { const n = new Set(e); if (n.has(series)) n.delete(series); else n.add(series); return n }), [])
  const [recording, setRecording] = useState<false | 'memo' | 'journal'>(false)
  const [pdfIncoming, setPdfIncoming] = useState<null | { file: File; handle?: FileSystemFileHandle }>(null)
  const pdfDone = useCallback(() => setPdfIncoming(null), [])
  const [reading, setReading] = useState(false)
  const openPdfFile = useCallback((p: { file: File; handle?: FileSystemFileHandle }) => { setPdfIncoming(p); setViewRaw({ kind: 'margins' }); setDrawer(false) }, [])
  const [scrolled, setScrolled] = useState(false)
  const phone = usePhone()

  // ---- navigation (back button closes the open note) ----
  useEffect(() => {
    const onPop = () => { setOpenId((history.state as { note?: string } | null)?.note ?? null); setFocus(false) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const openNote = useCallback((id: string) => {
    setPalette(false); setDrawer(false); setSelected(new Set())
    const replacing = !!(history.state as { note?: string } | null)?.note
    if (replacing) history.replaceState({ note: id }, '')
    else history.pushState({ note: id }, '')
    if (replacing) setOpenId(id)
    else transition(() => setOpenId(id), id)
  }, [])
  const closeNote = useCallback(() => {
    if ((history.state as { note?: string } | null)?.note) history.back()
    transition(() => setOpenId(null), openRef.current)
  }, [])
  // Each view remembers where you were scrolled to; switching views cross-fades instead of jumping.
  const mainScroll = useRef<HTMLDivElement>(null)
  const scrollMemo = useRef(new Map<string, number>())
  const viewKey = (v: View) => (v.kind === 'label' ? `label:${v.labelId}` : v.kind)
  const setView = (v: View) => {
    if (mainScroll.current) scrollMemo.current.set(viewKey(view), mainScroll.current.scrollTop)
    const go = () => { setViewRaw(v); setScrolled(false); setDrawer(false); setSelected(new Set()) }
    if (openId) { closeNote(); go() } else if (viewKey(v) !== viewKey(view)) transition(go); else go()
  }

  useLayoutEffect(() => {
    const el = mainScroll.current; if (!el) return
    el.scrollTop = scrollMemo.current.get(viewKey(view)) ?? 0
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  const labelCtx = view.kind === 'label' ? [view.labelId] : []
  const newNote = async () => openNote((await createNote({ labels: labelCtx })).id)
  const newList = async () => openNote((await createNote({ content: [{ type: 'checkListItem', props: { checked: false }, content: '' }], labels: labelCtx })).id)
  const today = async () => openNote((await openDaily()).id)
  const newPhoto = async () => {
    const f = await pickFile(); if (!f) return
    const url = await putImage(await fileToDataUrl(f))
    openNote((await createNote({ content: [{ type: 'image', props: { url, name: f.name } }, { type: 'paragraph' }], labels: labelCtx })).id)
  }

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return }
      if (isTyping() || palette || settings || templates || recording || create) return
      if (e.key === 'Escape' && selected.size) setSelected(new Set())
      if (!openId && view.kind !== 'margins' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'c' || e.key === 'n') { e.preventDefault(); newNote() }
        if (e.key === 't') { e.preventDefault(); today() }
        if (e.key === 'v') { e.preventDefault(); setRecording('memo') }
        if (e.key === '/') { e.preventDefault(); setPalette(true) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const open = () => setSettings(true)
    document.addEventListener('folio:settings', open)
    return () => document.removeEventListener('folio:settings', open)
  }, [])

  // Housekeeping once the first screen is up (storage protection, image migration, repairs, cleanup).
  useEffect(() => {
    const run = () => {
      import('./lib/maintenance').then((m) => m.runMaintenance()).catch((e) => console.warn('[folio] maintenance', e))
      // Warm the editor so the first note opens instantly instead of waiting on a download.
      setTimeout(() => { void import('./components/NoteEditor') }, 600)
    }
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => number }).requestIdleCallback
    if (ric) ric(run, { timeout: 4000 }); else setTimeout(run, 1500)
  }, [])

  // ---- incoming share links: #p=… in the address, or shared *to* Folio on Android ----
  useEffect(() => {
    const open = (text: string) => {
      const m = text.match(/#p=[A-Za-z0-9_.-]+/)
      if (m) receiveParcel({ link: m[0] })
      return !!m
    }
    const fromAddress = () => {
      if (!location.hash.startsWith('#p=')) return
      const hash = location.hash
      history.replaceState(null, '', location.pathname) // keep the notes out of history
      open(hash)
    }
    fromAddress()
    // Quick capture links (home-screen shortcuts, iOS Shortcuts, bookmarks):
    //   ?new=text  ?task=text  ?record=memo|journal  ?today=1  ?view=tasks|pages|journal (&add=1)
    const q = new URLSearchParams(location.search)
    const has = (k: string) => q.has(k)
    if (['new', 'task', 'record', 'today', 'view'].some(has)) {
      history.replaceState(null, '', '/')
      ;(async () => {
        if (has('new')) {
          const t = (q.get('new') ?? '').trim()
          openNote((await createNote({ title: q.get('title') ?? '', content: t ? textToBlocks(t) : [] })).id)
        } else if (has('task') && (q.get('task') ?? '').trim()) {
          const { parseQuickAdd, quickAddText } = await import('./lib/tasks')
          const { inboxNote, addTaskTo } = await import('./lib/db')
          const qa = parseQuickAdd(q.get('task')!)
          await addTaskTo((await inboxNote()).id, quickAddText(qa))
          setViewRaw({ kind: 'tasks' })
          const { friendlyDue } = await import('./lib/tasks')
          setTimeout(() => toast(`Added “${qa.text}” to Inbox${qa.due ? ` · ${friendlyDue(qa.due)}` : ''}`), 300)
        } else if (has('record')) setRecording(q.get('record') === 'journal' ? 'journal' : 'memo')
        else if (has('today')) today()
        else if (has('view')) {
          const v = q.get('view')
          if (v === 'tasks' || v === 'pages' || v === 'journal' || v === 'margins') setViewRaw({ kind: v })
          if (q.get('add')) setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Add a task"]')?.focus(), 400)
        }
      })()
    }
    // Android share target (manifest): "Share → Folio" arrives as /?text=…&url=…
    else if (q.has('text') || q.has('url')) {
      history.replaceState(null, '', '/')
      open(`${q.get('url') ?? ''} ${q.get('text') ?? ''}`)
    }
    window.addEventListener('hashchange', fromAddress)
    return () => window.removeEventListener('hashchange', fromAddress)
  }, [])

  // ---- "Open with → Folio" for PDFs (installed app on Windows / ChromeOS / Android Chrome) ----
  useEffect(() => {
    const lq = (window as unknown as { launchQueue?: { setConsumer: (f: (p: { files?: FileSystemFileHandle[] }) => void) => void } }).launchQueue
    lq?.setConsumer(async (p) => { const h = p.files?.[0]; if (h) openPdfFile({ file: await h.getFile(), handle: h }) })
  }, [openPdfFile])

  // ---- drop .md files anywhere to import ----
  useEffect(() => {
    let depth = 0
    const over = (e: DragEvent) => { if (hasFiles(e) && !openId) { e.preventDefault() } }
    const enter = (e: DragEvent) => { if (hasFiles(e) && !openId) { depth++; setDropHint(true) } }
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDropHint(false) }
    const drop = (e: DragEvent) => {
      depth = 0; setDropHint(false)
      if (openId || !hasFiles(e) || document.querySelector('[role=dialog][aria-label="Import Markdown"]')) return
      e.preventDefault()
      const files = [...(e.dataTransfer?.files ?? [])]
      const pdf = files.find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
      if (pdf) openPdfFile({ file: pdf })
      else if (files.some((f) => /\.(md|markdown|txt)$/i.test(f.name))) setImporting(files)
    }
    window.addEventListener('dragover', over); window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [openId, openPdfFile])

  // ---- derived data ----
  const childCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) if (n.parentId && n.trashedAt === null) m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1)
    return m
  }, [notes])
  const recents = useMemo(() => notes.filter((n) => n.trashedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10), [notes])
  const labelCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of notes) if (n.trashedAt === null) for (const l of n.labels) m[l] = (m[l] ?? 0) + 1
    return m
  }, [notes])
  const openTasks = useMemo(() => notes.filter((n) => n.trashedAt === null && !n.locked).reduce((s, n) => s + n.checklist.filter((c) => !c.checked && c.text.trim()).length, 0), [notes])

  const sorter = useCallback((a: Note, b: Note) => prefs.sort === 'custom' ? b.position - a.position : prefs.sort === 'created' ? b.createdAt - a.createdAt : prefs.sort === 'title' ? (a.title || '\uffff').localeCompare(b.title || '\uffff', undefined, { numeric: true, sensitivity: 'base' }) : b.updatedAt - a.updatedAt, [prefs.sort])
  const list: Note[] = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]))
    const sorted = [...notes].sort(sorter)
    switch (view.kind) {
      case 'notes': return sorted.filter((n) => !n.parentId && !n.archived && !n.daily && n.trashedAt === null)
      case 'archive': return sorted.filter((n) => n.archived && n.trashedAt === null)
      case 'trash': return sorted.filter((n) => n.trashedAt !== null && !(n.parentId && byId.get(n.parentId)?.trashedAt))
      case 'label': return sorted.filter((n) => n.labels.includes(view.labelId) && n.trashedAt === null)
      default: return []
    }
  }, [notes, view, sorter])
  // Series → one stacked card (notes and label views), unless fanned out.
  const { shown, stacks } = useMemo(() => {
    const stacks = new Map<string, Note[]>()
    if (view.kind !== 'notes' && view.kind !== 'label') return { shown: list, stacks }
    const by = new Map<string, Note[]>()
    for (const n of list) if (n.series) by.set(n.series, [...(by.get(n.series) ?? []), n])
    const shown: Note[] = []
    for (const n of list) {
      const members = n.series ? by.get(n.series)! : null
      if (!members || members.length < 2 || expanded.has(n.series!)) { shown.push(n); continue }
      if (members[0].id === n.id) { shown.push(n); stacks.set(n.id, [...members].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }))) }
    }
    return { shown, stacks }
  }, [list, view.kind, expanded])
  // Suggest stacking numbered notes ("01 — …", "02 — …") that share a label.
  const stackSuggestion = useMemo(() => {
    if (view.kind !== 'notes') return null
    const groups = new Map<string, Note[]>()
    for (const n of list) if (!n.series && /^\s*\d{1,3}\s*[—–.-]\s+/.test(n.title)) { const k = n.labels[0] ?? '-'; groups.set(k, [...(groups.get(k) ?? []), n]) }
    for (const [k, ns] of groups) {
      if (ns.length < 3) continue
      const key = 'folio.stackHint.' + ns.map((n) => n.id).sort().join('').slice(0, 40)
      try { if (localStorage.getItem(key)) continue } catch { /* ignore */ }
      const firsts = ns.map((n) => n.preview.replace(/[\u0001\u0002\u0003]/g, '').split('\n')[0].split(' · ')[0].trim())
      const name = firsts.every((f) => f && f === firsts[0]) ? firsts[0] : labels.find((l) => l.id === k)?.name ?? 'Series'
      return { ids: ns.map((n) => n.id), name, key }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, view.kind, labels, hintTick])
  const trashView = view.kind === 'trash'
  const groups = trashView || view.kind === 'archive'
    ? [{ key: 'all', notes: list }]
    : [{ key: 'pinned', title: shown.some((n) => n.pinned) ? 'Pinned' : undefined, notes: shown.filter((n) => n.pinned), pinned: true },
       { key: 'others', title: shown.some((n) => n.pinned) ? 'Others' : undefined, notes: shown.filter((n) => !n.pinned), pinned: false }]
  const currentLabel = view.kind === 'label' ? labels.find((l) => l.id === view.labelId) : undefined
  const labelName = currentLabel?.name ?? ''
  const board = ['notes', 'label', 'archive', 'trash'].includes(view.kind)
  const showComposer = view.kind === 'notes' || view.kind === 'label'

  const toggleSelect = useCallback((id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])
  const sel = [...selected]
  const bulk = async (fn: () => Promise<unknown>) => { await fn(); setMenu(null); setSelected(new Set()) }

  const commands: Command[] = [
    { id: 'new', label: 'New note', icon: <SquarePen size={16} />, hint: 'C', run: newNote },
    { id: 'voice', label: 'Record a voice memo', icon: <Mic size={16} />, hint: 'V', keywords: 'audio record meeting minutes transcribe dictate', run: () => setRecording('memo') },
    { id: 'journal-voice', label: "Speak today's journal", icon: <BookOpen size={16} />, keywords: 'voice diary daily journal record', run: () => setRecording('journal') },
    { id: 'list', label: 'New checklist', icon: <CheckSquare size={16} />, run: newList },
    { id: 'today', label: "Open today's note", icon: <Sun size={16} />, hint: 'T', keywords: 'daily journal', run: today },
    { id: 'tpl', label: 'New from template…', icon: <LayoutTemplate size={16} />, keywords: 'meeting project bug', run: () => setTemplates(true) },
    { id: 'go-notes', label: 'Go to Notes', icon: <Lightbulb size={16} />, run: () => setView({ kind: 'notes' }) },
    { id: 'go-pages', label: 'Go to Pages', icon: <FileText size={16} />, run: () => setView({ kind: 'pages' }) },
    { id: 'go-journal', label: 'Go to Journal', icon: <BookOpen size={16} />, keywords: 'daily calendar diary', run: () => setView({ kind: 'journal' }) },
    { id: 'margins-open', label: 'Open a PDF in Margins…', icon: <BookOpenText size={16} />, keywords: 'pdf read reader book paper document margins', run: async () => { const { pickPdf } = await import('./lib/margins'); const r = await pickPdf(); if (r) openPdfFile(r) } },
    { id: 'go-margins', label: 'Go to Margins (PDF reader)', icon: <BookOpenText size={16} />, keywords: 'pdf read reader', run: () => setView({ kind: 'margins' }) },
    { id: 'go-tasks', label: 'Go to Tasks', icon: <CheckSquare size={16} />, keywords: 'todo checklist', run: () => setView({ kind: 'tasks' }) },
    { id: 'go-archive', label: 'Go to Archive', icon: <Archive size={16} />, run: () => setView({ kind: 'archive' }) },
    { id: 'go-trash', label: 'Go to Trash', icon: <Trash2 size={16} />, run: () => setView({ kind: 'trash' }) },
    { id: 'mode-toggle', label: dark ? 'Switch to light mode' : 'Switch to dark mode', icon: dark ? <Sun size={16} /> : <Moon size={16} />, keywords: 'theme appearance light dark mode paper', run: () => set({ mode: dark ? 'light' : 'dark' }) },
    ...LIGHT_THEMES.map((t) => ({ id: `light-${t.key}`, label: `Light theme: ${t.label}`, icon: <Sun size={16} />, keywords: 'theme appearance light ' + t.note, run: () => set({ lightTheme: t.key, mode: 'light' as const }) })),
    ...THEMES.map((t) => ({ id: `theme-${t.key}`, label: `Theme: ${t.label}`, icon: <Moon size={16} />, keywords: 'theme appearance dark ' + t.note, run: () => set({ theme: t.key, accent: t.accent, ...(prefs.mode === 'light' ? { mode: 'dark' as const } : {}) }) })),
    { id: 'layout', label: prefs.layout === 'grid' ? 'Show as list' : 'Show as grid', icon: prefs.layout === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />, run: () => set({ layout: prefs.layout === 'grid' ? 'list' : 'grid' }) },
    { id: 'cards', label: prefs.cardStyle === 'vivid' ? 'Use subtle card colours' : 'Use vivid card colours', icon: <Palette size={16} />, run: () => set({ cardStyle: prefs.cardStyle === 'vivid' ? 'subtle' : 'vivid' }) },
    { id: 'density', label: prefs.density === 'compact' ? 'Comfortable cards' : 'Compact cards', icon: <LayoutGrid size={16} />, run: () => set({ density: prefs.density === 'compact' ? 'comfortable' : 'compact' }) },
    { id: 'import-md', label: 'Import Markdown…', icon: <FileUp size={16} />, keywords: 'md markdown claude obsidian cherry import', run: () => setImporting([]) },
    { id: 'export-md', label: 'Export all as Markdown (zip)', icon: <FileDown size={16} />, keywords: 'md markdown export zip', run: async () => { const { exportAllMarkdown } = await import('./lib/markdown'); exportAllMarkdown() } },
    { id: 'export', label: 'Export backup (JSON)', icon: <Download size={16} />, keywords: 'backup json', run: exportAll },
    { id: 'send-all', label: 'Share all notes as a link…', icon: <Send size={16} />, keywords: 'share send link transfer device', run: () => sendNotes('all') },
    { id: 'receive', label: 'Open a shared link…', icon: <Link2 size={16} />, keywords: 'receive import paste link', run: () => receiveParcel() },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={16} />, run: () => setSettings(true) },
  ]

  const sidebarEl = (mobile?: boolean) => (
    <Sidebar view={view} setView={setView} labels={labels} labelCounts={labelCounts} recents={recents} openTasks={openTasks} deviceName={deviceName} mobile={mobile}
      onNew={() => { setDrawer(false); newNote() }} onToday={() => { setDrawer(false); today() }} onSearch={() => { setPalette(true); setDrawer(false) }} onOpen={openNote}
      onSettings={() => { setSettings(true); setDrawer(false) }} onCollapse={() => (mobile ? setDrawer(false) : setSidebar(false))} />
  )
  const sidebarShown = sidebar && !focus && !(reading && view.kind === 'margins' && !openId)
  const inNotesArea = !['pages', 'tasks', 'journal'].includes(view.kind)
  const emptyText = { archive: 'Archived notes rest here', trash: 'Trash is empty', label: 'No notes with this label yet', notes: '' } as Record<string, string>

  return (
    <div className="app-root flex h-full bg-canvas text-ink">
      {/* laptop: full sidebar */}
      {sidebarShown && <div className="hidden h-full shrink-0 border-r border-line/60 lg:block">{sidebarEl()}</div>}
      {/* tablet landscape: icon rail */}
      {!focus && !(reading && view.kind === 'margins' && !openId) && (
        <div className="hidden h-full md:block lg:hidden">
          <Rail view={view} setView={setView} openTasks={openTasks} onNew={newNote} onToday={today} onSearch={() => setPalette(true)} onSettings={() => setSettings(true)} onExpand={() => setDrawer(true)} />
        </div>
      )}
      {drawer && (
        <div className="animate-fade fixed inset-0 z-50 bg-scrim lg:hidden" onClick={() => setDrawer(false)}>
          <div className="animate-drawer h-full w-[min(84vw,320px)] shadow-2xl" onClick={(e) => e.stopPropagation()}>{sidebarEl(true)}</div>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* The note opens on top; the list underneath stays put, so Back lands exactly where you were. */}
        {openId && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <Suspense fallback={<div className="editor-veil h-full" />}>
              <ErrorBoundary key={openId} area="editor" onBack={closeNote}>
                <NoteEditor id={openId} initialNote={notes.find((n) => n.id === openId)} onClose={closeNote} onNavigate={openNote} focus={focus} setFocus={setFocus} />
              </ErrorBoundary>
            </Suspense>
          </div>
        )}
        {/* Margins stays open behind a note you open from it, so Back returns to the same page */}
        {view.kind === 'margins' && (
          <div className={`flex min-h-0 flex-1 flex-col ${openId ? 'parked' : ''}`} inert={!!openId}>
            <ErrorBoundary area="editor" onBack={() => setView({ kind: 'notes' })}>
              <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[14px] text-muted">Opening Margins…</div>}>
                <Margins incoming={pdfIncoming} onIncomingDone={pdfDone} onOpenNote={openNote} onReading={setReading}
                  chrome={{
                    top: (
                      <header className="relative z-20 box-content flex h-14 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] md:hidden">
                        <IconButton label="Menu" onClick={() => setDrawer(true)}><Menu size={21} /></IconButton>
                        <span className="pl-0.5"><Wordmark size={21} /></span>
                      </header>
                    ),
                    bottom: <div className="md:hidden"><BottomBar view={view} setView={setView} onCreate={() => setCreate(true)} openTasks={openTasks} /></div>,
                  }} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
        {view.kind !== 'margins' && (
          <div className={`flex min-h-0 flex-1 flex-col ${openId ? 'parked' : ''}`} inert={!!openId}>
            {selected.size > 0 ? (
              <header className="animate-fade z-20 box-content flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 pt-[env(safe-area-inset-top)]">
                <IconButton label="Clear selection (Esc)" onClick={() => setSelected(new Set())}><X size={20} /></IconButton>
                <span className="min-w-0 flex-1 truncate pl-1 text-[15px] font-medium">{selected.size}<span className="max-[400px]:hidden"> selected</span></span>
                <button type="button" onClick={() => setSelected(new Set(list.map((n) => n.id)))} className="mr-1 rounded-lg px-3 py-1.5 text-[13px] text-accent-ink hover:bg-wash max-sm:hidden">Select all</button>
                {trashView ? (
                  <>
                    <IconButton label="Restore" onClick={() => bulk(() => setTrashed(sel, false))}><RotateCcw size={19} /></IconButton>
                    <IconButton label="Delete forever" onClick={() => bulk(async () => { for (const id of sel) await deleteForever(id) })}><Trash2 size={19} /></IconButton>
                  </>
                ) : (
                  <>
                    <IconButton label="Share as link" onClick={() => sendNotes(sel)}><Send size={19} /></IconButton>
                    <IconButton label="Stack as a series" onClick={() => { setStackIds(sel); setSelected(new Set()) }}><Layers size={19} /></IconButton>
                    <IconButton label="Pin / unpin" className="max-sm:hidden" onClick={() => bulk(() => patchMany(sel, { pinned: !sel.every((id) => notes.find((n) => n.id === id)?.pinned) }))}><Pin size={19} /></IconButton>
                    <div className="relative">
                      <IconButton label="Colour" onClick={() => setMenu(menu === 'bulkColor' ? null : 'bulkColor')}><Palette size={19} /></IconButton>
                      <Popover open={menu === 'bulkColor'} onClose={() => setMenu(null)} className="right-0 top-11"><ColorPicker onChange={(color) => bulk(() => patchMany(sel, { color }))} /></Popover>
                    </div>
                    <div className="relative">
                      <IconButton label="Add label" onClick={() => setMenu(menu === 'bulkLabel' ? null : 'bulkLabel')}><Tag size={19} /></IconButton>
                      <Popover open={menu === 'bulkLabel'} onClose={() => setMenu(null)} className="right-0 top-11">
                        <LabelPicker title="Add label to selected" selected={[]} onChange={(ids) => ids[0] && bulk(() => addLabelToMany(sel, ids[0]))} />
                      </Popover>
                    </div>
                    <IconButton label={view.kind === 'archive' ? 'Unarchive' : 'Archive'} onClick={() => bulk(() => patchMany(sel, { archived: view.kind !== 'archive', pinned: false }))}>
                      {view.kind === 'archive' ? <ArchiveRestore size={19} /> : <Archive size={19} />}
                    </IconButton>
                    <IconButton label="Move to trash" onClick={() => bulk(() => setTrashed(sel, true))}><Trash2 size={19} /></IconButton>
                  </>
                )}
              </header>
            ) : (
              <header className={`relative z-20 box-content flex h-14 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-colors ${phone && scrolled ? 'border-b border-line/60 bg-canvas/80 backdrop-blur-xl' : ''}`}>
                <IconButton label="Menu" onClick={() => setDrawer(true)} className="md:hidden"><Menu size={21} /></IconButton>
                {!sidebar && <IconButton label="Open sidebar" onClick={() => setSidebar(true)} className="max-lg:hidden"><PanelLeftOpen size={20} /></IconButton>}
                <span className={`pl-1 ${sidebar ? 'lg:hidden' : ''} max-md:hidden md:max-lg:inline`}><Wordmark size={21} /></span>
                {view.kind === 'notes' && !scrolled
                  ? <span className="pl-0.5 md:hidden"><Wordmark size={21} /></span>
                  : <span className={`large-title-sm font-title min-w-0 truncate pl-1 text-[18px] font-semibold md:hidden ${view.kind !== 'notes' && !scrolled ? 'opacity-0' : ''}`}>{view.kind === 'pages' ? 'Pages' : view.kind === 'tasks' ? 'Tasks' : view.kind === 'journal' ? 'Journal' : view.kind === 'archive' ? 'Archive' : view.kind === 'trash' ? 'Trash' : view.kind === 'label' ? labelName : 'Notes'}</span>}

                <div className={`absolute left-1/2 -translate-x-1/2 max-lg:hidden ${sidebarShown ? 'hidden' : ''}`}>
                  <div className="flex rounded-full bg-surface p-1 text-[14px] font-medium">
                    {([['notes', 'Notes'], ['pages', 'Pages'], ['tasks', 'Tasks']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setView({ kind: k })}
                        className={`rounded-full px-4 py-1.5 transition-colors sm:px-5 ${view.kind === k || (k === 'notes' && inNotesArea) ? 'bg-[color-mix(in_srgb,var(--color-accent)_18%,var(--color-raised))] text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{l}</button>
                    ))}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-0.5 sm:hidden">
                  <IconButton label="Search" onClick={() => setPalette(true)}><Search size={21} /></IconButton>
                  <div className="relative">
                    <IconButton label="View options" active={menu === 'phoneMenu'} onClick={() => setMenu(menu === 'phoneMenu' ? null : 'phoneMenu')}><MoreHorizontal size={21} /></IconButton>
                    <Popover open={menu === 'phoneMenu'} onClose={() => setMenu(null)} className="right-0 top-11 w-56">
                      {board && <>
                        <div className="px-3 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-[.08em] text-faint">Show as</div>
                        <div className="mb-2 px-1"><Segmented value={prefs.layout} onChange={(layout) => set({ layout })} options={[{ value: 'grid', label: <span className="flex items-center justify-center gap-1.5"><LayoutGrid size={15} /> Grid</span> }, { value: 'list', label: <span className="flex items-center justify-center gap-1.5"><List size={15} /> List</span> }]} /></div>
                        <div className="px-3 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-[.08em] text-faint">Sort</div>
                        {([['custom', 'Custom order'], ['edited', 'Last edited'], ['created', 'Date created'], ['title', 'Title A–Z']] as const).map(([k, l]) => (
                          <MenuItem key={k} onClick={() => { set({ sort: k }); setMenu(null) }} hint={prefs.sort === k ? '✓' : undefined}>{l}</MenuItem>
                        ))}
                        <div className="my-1 h-px bg-line" />
                      </>}
                      <MenuItem icon={<Archive size={17} />} onClick={() => { setMenu(null); setView({ kind: 'archive' }) }}>Archive</MenuItem>
                      <MenuItem icon={<Trash2 size={17} />} onClick={() => { setMenu(null); setView({ kind: 'trash' }) }}>Trash</MenuItem>
                      <MenuItem icon={<FileUp size={17} />} onClick={() => { setMenu(null); setImporting([]) }}>Import Markdown</MenuItem>
                      <MenuItem icon={<SettingsIcon size={17} />} onClick={() => { setMenu(null); setSettings(true) }}>Settings</MenuItem>
                    </Popover>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-0.5 max-sm:hidden">
                  {board && (
                    <>
                      <IconButton label={prefs.layout === 'grid' ? 'List view' : 'Grid view'} onClick={() => set({ layout: prefs.layout === 'grid' ? 'list' : 'grid' })}>
                        {prefs.layout === 'grid' ? <List size={19} /> : <LayoutGrid size={19} />}
                      </IconButton>
                      <div className="relative">
                        <IconButton label="Sort" active={menu === 'sort'} onClick={() => setMenu(menu === 'sort' ? null : 'sort')}><ArrowDownUp size={18} /></IconButton>
                        <Popover open={menu === 'sort'} onClose={() => setMenu(null)} className="right-0 top-11 w-52">
                          {([['custom', 'Custom order (drag)'], ['edited', 'Last edited'], ['created', 'Date created'], ['title', 'Title A–Z']] as const).map(([k, l]) => (
                            <MenuItem key={k} onClick={() => { set({ sort: k }); setMenu(null) }} hint={prefs.sort === k ? '✓' : undefined}>{l}</MenuItem>
                          ))}
                        </Popover>
                      </div>
                    </>
                  )}
                  <IconButton label="Import Markdown" onClick={() => setImporting([])} className="max-sm:hidden"><FileUp size={18} /></IconButton>
                  <IconButton label="Search (Ctrl+K)" onClick={() => setPalette(true)} className={`max-md:hidden ${sidebar ? 'lg:hidden' : ''}`}><Search size={19} /></IconButton>
                </div>
              </header>
            )}

            <div ref={mainScroll} className="main-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 pt-2 sm:px-6 md:pb-16" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 44)} onClick={(e) => { if (e.target === e.currentTarget && selected.size) setSelected(new Set()) }}>
              {view.kind === 'pages' ? <div className="pt-4"><PagesView notes={notes} onOpen={openNote} /></div>
                : view.kind === 'tasks' ? <div className="pt-4"><TasksView notes={notes} onOpen={openNote} /></div>
                : view.kind === 'journal' ? <div className="pt-4"><JournalView notes={notes} onOpen={openNote} onSpeak={() => setRecording('journal')} /></div>
                : (
                  <div className="mx-auto max-w-[1400px]">
                    {view.kind === 'notes' && <InstallHint />}
                    {view.kind === 'notes' && <div className="pt-3 max-sm:pt-1"><TodayHero notes={notes} onOpenToday={today} onTasks={() => setView({ kind: 'tasks' })} onJournal={() => setRecording('journal')} onOpen={openNote} /></div>}
                    {showComposer && list.length === 0 && view.kind === 'notes' ? (
                      <div className="flex flex-col items-center justify-center gap-5 py-6">
                        <div className="w-full max-sm:hidden"><Composer onOpen={openNote} onTemplates={() => setTemplates(true)} onVoice={() => setRecording('memo')} /></div>
                        <button type="button" onClick={() => setCreate(true)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left text-[15px] text-muted sm:hidden"><SquarePen size={18} className="text-accent" /> Write your first note…</button>
                        <div className="flex flex-wrap justify-center gap-2 text-[13px]">
                          <button type="button" onClick={() => setTemplates(true)} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-ink-2 hover:border-accent/50 hover:bg-wash"><LayoutTemplate size={14} /> Templates</button>
                          <button type="button" onClick={() => setImporting([])} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-ink-2 hover:border-accent/50 hover:bg-wash"><FileUp size={14} /> Import Markdown</button>
                        </div>
                        <EmptyArt kind="notes" />
                        <p className="-mt-3 text-center text-[13px] text-faint">Notes stay on this device. Nothing leaves it.</p>
                      </div>
                    ) : (
                      <>
                        {view.kind !== 'notes' && (
                          <div className="flex items-center justify-between gap-3 pb-4 pt-3">
                            {view.kind === 'label' && currentLabel ? (
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: labelColor(currentLabel) }} />
                                <h1 className="font-title truncate text-[30px] font-bold tracking-tight">{currentLabel.name}</h1>
                                <span className="shrink-0 rounded-full bg-wash px-2.5 py-0.5 text-[12px] text-muted">{list.length} {list.length === 1 ? 'note' : 'notes'}</span>
                                <div className="relative">
                                  <IconButton size="sm" label="Label options" onClick={() => setMenu(menu === 'labelMenu' ? null : 'labelMenu')}><MoreHorizontal size={18} /></IconButton>
                                  <LabelMenu label={currentLabel} open={menu === 'labelMenu'} onClose={() => setMenu(null)} className="left-0 top-10" onDeleted={() => setView({ kind: 'notes' })} />
                                </div>
                              </div>
                            ) : (
                              <h1 className="font-title text-[30px] font-bold tracking-tight">{view.kind === 'archive' ? 'Archive' : 'Trash'}</h1>
                            )}
                            {trashView && list.length > 0 && (
                              <button type="button" onClick={() => { if (confirm('Delete everything in Trash forever?')) emptyTrash() }}
                                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] text-accent-ink hover:bg-wash"><Trash2 size={15} /> Empty trash</button>
                            )}
                            {view.kind === 'label' && <button type="button" onClick={() => setImporting([])} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:border-accent/50"><FileUp size={14} /> Import into label</button>}
                          </div>
                        )}
                        {showComposer && <div className={`max-sm:hidden ${view.kind === 'label' ? 'pb-8 pt-1' : 'pb-8 pt-0'}`}><Composer onOpen={openNote} labelId={view.kind === 'label' ? view.labelId : undefined} onTemplates={() => setTemplates(true)} onVoice={() => setRecording('memo')} /></div>}

                        {stackSuggestion && (
                          <div className="animate-pop mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-[color-mix(in_srgb,var(--color-accent)_9%,var(--color-card))] px-4 py-3">
                            <Layers size={18} className="shrink-0 text-accent" />
                            <p className="min-w-0 flex-1 basis-[230px] text-[13.5px] text-ink-2"><b className="text-ink">{stackSuggestion.ids.length} numbered notes</b> look like a series: “{stackSuggestion.name}”. Stack them into one card?</p>
                            <div className="ml-auto flex gap-1.5">
                              <button type="button" onClick={() => { try { localStorage.setItem(stackSuggestion.key, '1') } catch { /* ignore */ } setHintTick((x) => x + 1) }} className="rounded-lg px-3 py-1.5 text-[13px] text-muted hover:bg-wash">Not now</button>
                              <button type="button" onClick={() => setStackHint({ ids: stackSuggestion.ids, name: stackSuggestion.name })} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent">Stack them</button>
                            </div>
                          </div>
                        )}
                        <Board groups={groups} labels={labels} childCount={childCount} selected={selected} onOpen={openNote} onSelect={toggleSelect}
                          canDrag={prefs.sort === 'custom' && !trashView} stacks={stacks} onStack={toggleStack} fanned={expanded} />
                        {list.length === 0 && (
                          <div className="py-16 text-center text-[15px] text-muted">
                            <EmptyArt kind={view.kind === 'archive' ? 'archive' : trashView ? 'trash' : 'label'} />
                            {emptyText[view.kind]}
                          </div>
                        )}
                        {list.length > 0 && prefs.sort === 'custom' && !trashView && <p className="pt-2 text-center text-[12px] text-faint coarse:hidden">Drag cards to reorder · Tick the circle to select several · Drop .md files anywhere to import</p>}
                      </>
                    )}
                  </div>
                )}
            </div>
            {/* phones + tablet portrait: bottom tabs */}
            {selected.size === 0 && <div className="md:hidden"><BottomBar view={view} setView={setView} onCreate={() => setCreate(true)} openTasks={openTasks} /></div>}
          </div>
        )}
      </main>

      <Toaster />
      <Wallpaper />
      <Atmosphere />
      {dropHint && !openId && !importing && (
        <div className="animate-fade pointer-events-none fixed inset-3 z-[70] flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-canvas)_80%,transparent)] backdrop-blur-sm">
          <div className="text-center"><FileUp size={40} className="mx-auto mb-3 text-accent" /><p className="font-title text-[24px] font-semibold">Drop to open or import</p><p className="text-[14px] text-muted">A PDF opens in Margins · .md files are imported as notes</p></div>
        </div>
      )}
      <Suspense fallback={null}>
        {palette && <CommandPalette notes={notes} commands={commands} onOpen={openNote} onClose={() => setPalette(false)} />}
        {templates && <TemplatesDialog onClose={() => setTemplates(false)} onPick={async (t) => { setTemplates(false); openNote((await createFromTemplate(t, { labels: labelCtx })).id) }} />}
        {settings && <SettingsDialog deviceName={deviceName} noteCount={notes.length} onClose={() => setSettings(false)} onRename={(n) => { setDeviceName(n); setName(n) }} onImport={() => setImporting([])} />}
        {parcelReq && <ParcelHost onOpenNote={openNote} />}
        {stackHint && <SeriesSheet ids={stackHint.ids} suggestion={stackHint.name} onClose={() => setStackHint(null)} />}
        {stackIds && <SeriesSheet ids={stackIds} onClose={() => setStackIds(null)} suggestion={labels.find((l) => stackIds.every((id) => notes.find((n) => n.id === id)?.labels.includes(l.id)))?.name} />}
        {create && <CreateSheet onClose={() => setCreate(false)} onNote={newNote} onList={newList} onVoice={() => setRecording('memo')} onPhoto={newPhoto} onTemplate={() => setTemplates(true)} onToday={today} onLink={() => receiveParcel()} />}
        {recording && <VoiceRecorder journal={recording === 'journal'} labelIds={labelCtx} onClose={() => setRecording(false)} onSaved={(id) => { setRecording(false); openNote(id) }} />}
      </Suspense>
      {importing && (
        <Suspense fallback={null}>
          <ImportDialog initialFiles={importing} defaultLabelIds={labelCtx} onClose={() => setImporting(null)} onDone={(created) => { setImporting(null); if (created.length === 1) openNote(created[0].id) }} />
        </Suspense>
      )}
    </div>
  )
}
