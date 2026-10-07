// V6 templates: a gallery of built-ins plus your own, with fill-in fields, multi-page templates,
// note looks (colour, cover, paper, icon, labels), defaults for new and daily notes, and template files
// you can hand to someone else. Loaded only when the gallery or a template is used.
import { nanoid } from 'nanoid'
import type { Note, Template, TemplatePage } from '../types'
import { CATALOG, CATEGORIES } from './templateCatalog'
import { mdToBlocks } from './markdown'
import { createNote, db, descendants, download } from './db'
import { collectRefs, externalize, inlineRefs, isData, isRef, storeDataUrl, toDataUrl, type StoredBlob } from './blobs'
import { firstName } from './device'
import { todayKey } from './templates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
export const MY = 'My templates'
export const ALL_CATEGORIES = [...CATEGORIES, MY] as string[]

// ---------------------------------------------------------------- loading
let builtinCache: Promise<Template[]> | null = null
const inlineStr = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: Block) => x.text ?? inlineStr(x.content)).join('') : '')
/** Markdown can't express an empty list item; the catalog writes "-", "1." and "- [ ]" for them. */
function fixEmpty(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const t = inlineStr(b.content).trim()
    const kids = b.children?.length ? { children: fixEmpty(b.children) } : {}
    if ((b.type === 'paragraph' || b.type === 'bulletListItem') && (t === '[ ]' || t === '- [ ]' || t === '[]')) return { type: 'checkListItem', props: { checked: false }, content: [], ...kids }
    if (b.type === 'paragraph' && t === '-') return { type: 'bulletListItem', content: [], ...kids }
    if (b.type === 'paragraph' && /^\d+\.$/.test(t)) return { type: 'numberedListItem', content: [], ...kids }
    return { ...b, ...kids }
  })
}
/** Separate "**Label:** value" lines into their own paragraphs (a single newline would join them). */
const md2 = (md: string) => md.replace(/([^\n])\n(?=[^\n\-|#>\d\s])/g, '$1\n\n')
const parse = async (md: string) => fixEmpty(await mdToBlocks(md2(md)))
export function builtins(): Promise<Template[]> {
  builtinCache ??= Promise.all(CATALOG.map(async (c): Promise<Template> => ({
    id: c.id, builtin: true, name: c.name, emoji: c.emoji, category: c.category, description: c.description,
    title: c.title, content: await parse(c.md), color: c.color, cover: c.cover ?? null, paper: c.paper,
    children: c.pages ? await Promise.all(c.pages.map(async (p) => ({ title: p.title, icon: p.icon ?? null, content: await parse(p.md) }))) : undefined,
  })))
  return builtinCache
}
const normalise = (t: Template): Template => ({ ...t, builtin: false, category: t.category || MY, emoji: t.emoji || '📄' })
export async function userTemplates() { return (await db.templates.toArray()).map(normalise).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)) }
export async function everyTemplate() { return [...(await userTemplates()), ...(await builtins())] }
export async function findTemplate(id: string) { return (await db.templates.get(id).then((t) => (t ? normalise(t) : undefined))) ?? (await builtins()).find((t) => t.id === id) }

// ---------------------------------------------------------------- usage & defaults
type Usage = Record<string, { n: number; at: number }>
export async function usage(): Promise<Usage> { return ((await db.meta.get('tplUsage'))?.value as Usage) ?? {} }
async function markUsed(id: string) { const u = await usage(); u[id] = { n: (u[id]?.n ?? 0) + 1, at: Date.now() }; await db.meta.put({ key: 'tplUsage', value: u }) }
export interface Defaults { new?: string | null; daily?: string | null }
export async function getDefaults(): Promise<Defaults> { return ((await db.meta.get('tplDefaults'))?.value as Defaults) ?? {} }
export async function setDefault(kind: keyof Defaults, id: string | null) { await db.meta.put({ key: 'tplDefaults', value: { ...(await getDefaults()), [kind]: id } }) }

// ---------------------------------------------------------------- {{tokens}}
const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g
export interface Field { label: string; kind: 'text' | 'date' | 'choice'; options?: string[] }
const AUTO = ['date', 'date:short', 'date:long', 'time', 'weekday', 'week', 'month', 'year', 'monday', 'tomorrow', 'yesterday', 'name', 'first name']
export const AUTO_HELP: [string, string][] = [['{{date}}', 'today’s date'], ['{{date:short}}', '7 Oct 2026'], ['{{time}}', 'the time'], ['{{weekday}}', 'Wednesday'], ['{{week}}', 'week number'], ['{{monday}}', 'this week’s Monday'], ['{{tomorrow}}', 'tomorrow'], ['{{name}}', 'your name']]

export function parseToken(inner: string): { auto: string } | Field {
  const raw = inner.trim()
  if (AUTO.includes(raw.toLowerCase())) return { auto: raw.toLowerCase() }
  const i = raw.indexOf(':')
  if (i > 0) {
    const label = raw.slice(0, i).trim(); const rest = raw.slice(i + 1).trim()
    if (rest.toLowerCase() === 'date') return { label, kind: 'date' }
    const options = rest.split('/').map((s) => s.trim()).filter(Boolean)
    if (options.length > 1) return { label, kind: 'choice', options }
  }
  return { label: raw, kind: 'text' }
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day)
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400e3 + 1) / 7)
}
const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const long = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export interface Ctx { now: Date; name: string }
export const ctxNow = (): Ctx => { let name = ''; try { name = (JSON.parse(localStorage.getItem('folio.prefs') ?? '{}').name ?? '').trim() } catch { /* ignore */ } return { now: new Date(), name } }

export function autoValue(key: string, { now, name }: Ctx) {
  const add = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d }
  switch (key) {
    case 'date': case 'date:long': return long(now)
    case 'date:short': return short(now)
    case 'time': return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    case 'weekday': return now.toLocaleDateString(undefined, { weekday: 'long' })
    case 'week': return String(isoWeek(now))
    case 'month': return now.toLocaleDateString(undefined, { month: 'long' })
    case 'year': return String(now.getFullYear())
    case 'monday': return short(add(-(((now.getDay() + 6) % 7))))
    case 'tomorrow': return short(add(1))
    case 'yesterday': return short(add(-1))
    case 'name': return name
    case 'first name': return firstName(name)
  }
  return ''
}
/** A date field's value ("2026-10-21") shown the friendly way. */
const fieldText = (f: Field, v: string) => (f.kind === 'date' && /^\d{4}-\d\d-\d\d$/.test(v) ? short(new Date(`${v}T12:00`)) : v)

// ---- walking the text inside blocks
function inlineOf(content: unknown): Block[] | null {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content, styles: {} }] : []
  return Array.isArray(content) ? content : null
}
function eachText(blocks: Block[], fn: (s: string) => void) {
  const inl = (items: Block[]) => { for (const it of items) { if (it.type === 'text') fn(it.text ?? ''); else if (Array.isArray(it.content)) inl(it.content) } }
  for (const b of blocks ?? []) {
    const c = b.content
    if (c?.type === 'tableContent') for (const r of c.rows ?? []) for (const cell of r.cells ?? []) inl(inlineOf(Array.isArray(cell) ? cell : cell?.content) ?? [])
    else inl(inlineOf(c) ?? [])
    if (b.children?.length) eachText(b.children, fn)
  }
}
/** Every question a template asks, in reading order (title first). */
export function fieldsOf(t: Pick<Template, 'title' | 'content' | 'children'>): Field[] {
  const out = new Map<string, Field>()
  const scan = (s: string) => { for (const m of s.matchAll(TOKEN)) { const p = parseToken(m[1]); if (!('auto' in p) && !out.has(p.label.toLowerCase())) out.set(p.label.toLowerCase(), p) } }
  scan(t.title ?? '')
  eachText(t.content, scan)
  const pages = (ps?: TemplatePage[]) => { for (const p of ps ?? []) { scan(p.title); eachText(p.content, scan); pages(p.children) } }
  pages(t.children)
  return [...out.values()]
}

export type Values = Record<string, string>
const valueFor = (inner: string, values: Values, ctx: Ctx): { text: string; placeholder?: boolean } => {
  const p = parseToken(inner)
  if ('auto' in p) return { text: autoValue(p.auto, ctx) }
  const v = (values[p.label.toLowerCase()] ?? '').trim()
  return v ? { text: fieldText(p, v) } : { text: p.label, placeholder: true }
}
/** Fill a plain string (titles). Unanswered questions are dropped, with any separator they leave behind. */
export function fillText(s: string, values: Values, ctx: Ctx) {
  const out = s.replace(TOKEN, (_m, inner: string) => { const r = valueFor(inner, values, ctx); return r.placeholder ? '' : r.text })
  return out.replace(/\s*([—–·|:-])\s*(?=$|[—–·|:-])/g, ' ').replace(/^[\s—–·|:-]+|[\s—–·|:-]+$/g, '').replace(/\s{2,}/g, ' ').trim()
}
function fillInline(items: Block[], values: Values, ctx: Ctx): Block[] {
  const out: Block[] = []
  for (const it of items) {
    if (it.type === 'text' && typeof it.text === 'string' && it.text.includes('{{')) {
      let last = 0
      for (const m of it.text.matchAll(TOKEN)) {
        if (m.index! > last) out.push({ ...it, text: it.text.slice(last, m.index) })
        const r = valueFor(m[1], values, ctx)
        // Unanswered questions stay visible as a grey placeholder you type over (like a slide placeholder).
        if (r.text) out.push({ ...it, text: r.text, styles: r.placeholder ? { ...it.styles, italic: true, textColor: 'gray' } : it.styles })
        last = m.index! + m[0].length
      }
      if (last < it.text.length) out.push({ ...it, text: it.text.slice(last) })
    } else if (Array.isArray(it.content)) out.push({ ...it, content: fillInline(it.content, values, ctx) })
    else out.push(it)
  }
  return out
}
export function fillBlocks(blocks: Block[], values: Values, ctx: Ctx): Block[] {
  return (blocks ?? []).map((b) => {
    const nb = { ...b }
    const c = b.content
    if (c?.type === 'tableContent') {
      nb.content = { ...c, rows: (c.rows ?? []).map((r: Block) => ({ ...r, cells: (r.cells ?? []).map((cell: Block) => Array.isArray(cell) ? fillInline(cell, values, ctx) : cell && typeof cell === 'object' ? { ...cell, content: fillInline(inlineOf(cell.content) ?? [], values, ctx) } : cell) })) }
    } else if (typeof c === 'string' || Array.isArray(c)) nb.content = fillInline(inlineOf(c)!, values, ctx)
    if (b.children?.length) nb.children = fillBlocks(b.children, values, ctx)
    return nb
  })
}
/** Fresh block ids so two notes made from one template never share them. */
function freshIds(blocks: Block[]): Block[] { return (blocks ?? []).map((b) => { const { id: _id, ...rest } = b; void _id; return { ...rest, ...(b.children?.length ? { children: freshIds(b.children) } : {}) } }) }

// ---------------------------------------------------------------- using a template
/** Create a note (and its sub-pages) from a template. */
export async function instantiate(t: Template, values: Values = {}, extra: Partial<Note> = {}): Promise<Note> {
  const ctx = ctxNow()
  const known = new Set((await db.labels.toArray()).map((l) => l.id))
  const labels = [...new Set([...(t.labels ?? []).filter((l) => known.has(l)), ...(extra.labels ?? [])])]
  const root = await createNote({
    title: fillText(t.title ?? '', values, ctx), content: freshIds(fillBlocks(structuredClone(t.content ?? []), values, ctx)),
    color: t.color ?? 'default', icon: t.icon ?? null, cover: t.cover ?? null, paper: t.paper ?? 'none', ...extra, labels,
  })
  const make = async (pages: TemplatePage[] | undefined, parentId: string) => {
    for (const p of pages ?? []) {
      const n = await createNote({ parentId, title: fillText(p.title, values, ctx), icon: p.icon ?? null, content: freshIds(fillBlocks(structuredClone(p.content ?? []), values, ctx)) })
      await make(p.children, n.id)
    }
  }
  await make(t.children, root.id)
  await markUsed(t.id)
  return root
}
/** Blocks to drop into the note you're writing (title and sub-pages are left out). */
export async function blocksFor(t: Template, values: Values = {}) {
  await markUsed(t.id)
  return freshIds(fillBlocks(structuredClone(t.content ?? []), values, ctxNow()))
}

// ---------------------------------------------------------------- your own templates
export interface SaveOpts { name: string; emoji: string; category: string; description: string; includePages: boolean; keepLook: boolean }
async function pagesUnder(all: Note[], id: string): Promise<TemplatePage[]> {
  const kids = all.filter((n) => n.parentId === id && n.trashedAt === null && !n.locked).sort((a, b) => a.position - b.position)
  return Promise.all(kids.map(async (k) => ({ title: k.title, icon: k.icon ?? null, content: structuredClone(k.content ?? []), children: await pagesUnder(all, k.id) })))
}
export async function templateFromNote(noteId: string, o: SaveOpts): Promise<Template> {
  const n = await db.notes.get(noteId); if (!n) throw new Error('Note not found')
  const all = o.includePages ? await db.notes.toArray() : []
  const now = Date.now()
  const t: Template = {
    id: nanoid(10), name: o.name.trim() || n.title || 'My template', emoji: o.emoji || '📄', category: o.category || MY, description: o.description.trim(),
    title: n.title, content: structuredClone(n.content ?? []), children: o.includePages ? await pagesUnder(all, n.id) : undefined,
    ...(o.keepLook ? { color: n.color, icon: n.icon ?? null, cover: n.cover ?? null, paper: n.paper ?? 'none', labels: n.labels } : {}),
    createdAt: now, updatedAt: now,
  }
  await db.templates.put(t)
  return t
}
export async function updateTemplate(id: string, changes: Partial<Template>) { const cur = await db.templates.get(id); if (cur) await db.templates.put({ ...cur, ...changes, id, fresh: undefined, updatedAt: Date.now() }) }
export async function duplicateTemplate(t: Template, name = `${t.name} (copy)`) {
  const now = Date.now()
  const copy: Template = { ...structuredClone(t), id: nanoid(10), builtin: false, name, category: t.builtin ? t.category : t.category || MY, createdAt: now, updatedAt: now }
  await db.templates.put(copy)
  return normalise(copy)
}
export async function deleteTemplate(id: string) {
  await db.templates.delete(id)
  const d = await getDefaults()
  if (d.new === id || d.daily === id) await db.meta.put({ key: 'tplDefaults', value: { new: d.new === id ? null : d.new, daily: d.daily === id ? null : d.daily } })
}
export async function blankTemplate() {
  const now = Date.now()
  const t: Template = { id: nanoid(10), name: 'New template', emoji: '📄', category: MY, description: '', title: '', content: [{ type: 'paragraph', content: [] }], createdAt: now, updatedAt: now, fresh: true }
  await db.templates.put(t)
  return t
}

// ---------------------------------------------------------------- editing a template in the full editor
// The template opens as a working copy (a hidden note, plus hidden sub-pages). Closing it saves the
// copy back into the template and removes it, so editing a template feels exactly like editing a note.
export async function openDraft(t: Template): Promise<string> {
  if (t.builtin) { t = await duplicateTemplate(t, t.name); await db.templates.put({ ...t, fresh: true }) }
  const existing = await db.notes.filter((n) => n.templateDraft === t.id).toArray()
  const root = existing.find((n) => !existing.some((p) => p.id === n.parentId))
  if (root) return root.id
  const n = await createNote({ title: t.title, content: structuredClone(t.content ?? []), color: t.color ?? 'default', icon: t.icon ?? null, cover: t.cover ?? null, paper: t.paper ?? 'none', labels: t.labels ?? [], templateDraft: t.id })
  const make = async (pages: TemplatePage[] | undefined, parentId: string) => {
    for (const p of pages ?? []) { const k = await createNote({ parentId, title: p.title, icon: p.icon ?? null, content: structuredClone(p.content ?? []), templateDraft: t.id }); await make(p.children, k.id) }
  }
  await make(t.children, n.id)
  return n.id
}
/** Save a working copy back into its template (or throw it away), then remove the copy. */
export async function finishDraft(rootId: string, save = true) {
  const all = await db.notes.toArray()
  const root = all.find((n) => n.id === rootId); if (!root?.templateDraft) return
  const ids = [rootId, ...descendants(all, rootId)]
  if (save && await db.templates.get(root.templateDraft)) {
    await updateTemplate(root.templateDraft, {
      title: root.title, content: root.content ?? [], color: root.color, icon: root.icon ?? null, cover: root.cover ?? null, paper: root.paper ?? 'none', labels: root.labels,
      children: await pagesUnder(all.filter((n) => n.trashedAt === null), rootId),
    })
  }
  // Discarding a template that was never saved (a fresh blank one, or a just-made copy to customise) removes it.
  if (!save) { const t = await db.templates.get(root.templateDraft); if (t?.fresh) await deleteTemplate(t.id) }
  await db.notes.bulkDelete(ids)
  await db.versions.where('noteId').anyOf(ids).delete()
}
/** Startup: a working copy left behind (tab closed mid-edit) is saved into its template. */
export async function settleDrafts() {
  const drafts = await db.notes.filter((n) => !!n.templateDraft).toArray()
  for (const r of drafts.filter((n) => !drafts.some((p) => p.id === n.parentId))) await finishDraft(r.id, true)
}

// ---------------------------------------------------------------- template files
interface TemplateFile { app: 'folio-template'; version: 1; template: Template; images: Record<string, string> }
const safe = (s: string) => (s || 'Template').replace(/[\\/:*?"<>|#^[\]]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Template'
export function templateBlocks(t: Template): Block[][] {
  const out: Block[][] = [t.content ?? []]
  const walk = (ps?: TemplatePage[]) => { for (const p of ps ?? []) { out.push(p.content ?? []); walk(p.children) } }
  walk(t.children)
  return out
}
/** A single .json file you can send to someone; images travel inside it. */
export async function exportTemplateFile(t: Template) {
  const ids = new Set<string>()
  for (const b of templateBlocks(t)) collectRefs(b, ids)
  if (isRef(t.cover)) ids.add(t.cover.slice('folio-img:'.length))
  const images: Record<string, string> = {}
  for (const id of ids) images[id] = await toDataUrl('folio-img:' + id)
  const { builtin: _b, ...rest } = t; void _b
  const file: TemplateFile = { app: 'folio-template', version: 1, template: { ...rest, labels: undefined }, images }
  download(`${safe(t.name)}.folio-template.json`, new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }))
}
export async function importTemplateFile(file: File): Promise<Template> {
  let data: TemplateFile
  try { data = JSON.parse(await file.text()) } catch { throw new Error('That file isn’t a Folio template.') }
  if (data?.app !== 'folio-template' || !data.template) throw new Error('That file isn’t a Folio template.')
  const pending = new Map<string, StoredBlob>()
  const swap = (blocks: Block[]) => externalize(inlineImages(blocks, data.images ?? {}), pending)
  const fixPages = (ps?: TemplatePage[]): TemplatePage[] | undefined => ps?.map((p) => ({ ...p, content: swap(p.content), children: fixPages(p.children) }))
  const now = Date.now()
  const src = data.template
  let cover = src.cover ?? null
  if (isRef(cover)) cover = data.images?.[cover.slice('folio-img:'.length)] ?? null
  if (isData(cover)) cover = storeDataUrl(cover, pending)
  const t: Template = { ...src, id: nanoid(10), builtin: false, category: src.category || MY, content: swap(src.content), children: fixPages(src.children), cover, labels: [], createdAt: now, updatedAt: now }
  await db.transaction('rw', db.templates, db.blobs, async () => { await db.blobs.bulkPut([...pending.values()]); await db.templates.put(t) })
  return t
}
function inlineImages(blocks: Block[], images: Record<string, string>): Block[] {
  return (blocks ?? []).map((b) => {
    const u = b?.props?.url
    const nb = isRef(u) && images[u.slice('folio-img:'.length)] ? { ...b, props: { ...b.props, url: images[u.slice('folio-img:'.length)] } } : b
    return b?.children?.length ? { ...nb, children: inlineImages(b.children, images) } : nb
  })
}

// ---------------------------------------------------------------- defaults in action
/** "New note" uses your chosen default template, if any. */
export async function newFromDefault(extra: Partial<Note> = {}) {
  const id = (await getDefaults()).new; if (!id) return null
  const t = await findTemplate(id); if (!t) return null
  return instantiate(t, {}, extra)
}
/** Today's note from your chosen daily template (the date title and sun icon are kept). */
export async function dailyFromDefault(date: Date) {
  const id = (await getDefaults()).daily; if (!id || id === 'tpl-daily') return null
  const t = await findTemplate(id); if (!t) return null
  const at = new Date(date); at.setHours(9, 0, 0, 0)
  const key = todayKey(date)
  return instantiate(t, {}, { title: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), daily: key, icon: '☀️', ...(key === todayKey() ? {} : { createdAt: at.getTime() }) })
}
export { inlineRefs }
