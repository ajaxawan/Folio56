import { BlockNoteEditor } from '@blocknote/core'
import { strToU8, zipSync } from 'fflate'
import type { ColorKey, Note } from '../types'
import { normalizeCode, schema } from './editorSchema'
import { COLOR_KEYS } from './colors'
import { createLabel, createNote, db, download } from './db'
import { fileToDataUrl } from './image'
import { inlineRefs, putImage } from './blobs'
import { todayKey } from './templates'

// One headless editor does all parsing / serialising (no DOM mounting needed).
let _ed: BlockNoteEditor | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ed = () => (_ed ??= BlockNoteEditor.create({ schema } as any) as unknown as BlockNoteEditor)

/** Markdown → editor blocks (used for built-in templates and pasted text). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mdToBlocks = async (md: string): Promise<any[]> => (await ed().tryParseMarkdownToBlocks(md)) as any[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blocksToMd = (blocks: any[]) => ed().blocksToMarkdownLossy(blocks as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blocksToHtml = (blocks: any[]) => ed().blocksToHTMLLossy(blocks as any)

export interface ParsedDoc {
  path: string            // relative path inside an imported folder ("" for single files)
  fileName: string
  title: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[]
  tags: string[]
  color: ColorKey | null
  icon: string | null
  pinned: boolean
  created: number | null
  words: number
  stats: { headings: number; tables: number; code: number; tasks: number; images: number }
  missingImages: string[]
}

export interface ImportOptions {
  titleFrom: 'heading' | 'filename'
  keepFolders: boolean
  parentId: string | null
  labelIds: string[]
  color: ColorKey | null
  remoteImages: 'link' | 'keep'
}

const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
export const isMarkdownFile = (f: File) => MD_EXT.test(f.name)
export const isImageFile = (f: File) => IMG_EXT.test(f.name)
export const relPath = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name

/** Tiny YAML front-matter reader: key: value, key: [a, b], and "- item" lists. */
export function splitFrontMatter(src: string): { meta: Record<string, string | string[]>; body: string } {
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/)
  if (!m) return { meta: {}, body: src }
  const meta: Record<string, string | string[]> = {}
  let listKey: string | null = null
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const item = line.match(/^\s*-\s+(.*)$/)
    if (item && listKey) { (meta[listKey] as string[]).push(unquote(item[1])); continue }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!kv) continue
    const [, k, v] = kv
    const key = k.toLowerCase()
    if (!v) { meta[key] = []; listKey = key; continue }
    listKey = null
    const arr = v.match(/^\[(.*)\]$/)
    meta[key] = arr ? arr[1].split(',').map((s) => unquote(s.trim())).filter(Boolean) : unquote(v)
  }
  return { meta, body: src.slice(m[0].length) }
}
const unquote = (s: string) => s.replace(/^["']|["']$/g, '')

/** Normalise Markdown from Claude / ChatGPT / Obsidian / Cherry Studio before parsing. */
export function preprocess(md: string, remoteImages: 'link' | 'keep') {
  let s = md.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  // callouts: > [!NOTE] Optional title  →  > **Note — Optional title**
  s = s.replace(/^([ \t]*>[ \t]*)\[!(\w+)\][+-]?[ \t]*(.*)$/gm, (_m, q: string, kind: string, title: string) => {
    const label = kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase()
    const icon = ({ note: 'ℹ️', tip: '💡', important: '❗', warning: '⚠️', caution: '🛑', info: 'ℹ️', success: '✅', question: '❓', danger: '🛑', bug: '🐞', example: '🧪', quote: '💬' } as Record<string, string>)[kind.toLowerCase()] ?? '📌'
    return `${q}${icon} **${title || label}**  `
  })
  // wiki links [[Page|Alias]] → Alias
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
  // highlights ==text== → bold (no highlight mark in plain markdown)
  s = s.replace(/==([^=\n]+)==/g, '**$1**')
  // headings deeper than ### → ###
  s = s.replace(/^#{4,6}\s+/gm, '### ')
  // display math → code block so it isn't mangled
  s = s.replace(/^\$\$\s*\n([\s\S]*?)\n\$\$\s*$/gm, '```latex\n$1\n```')
  // remote images: privacy default is to turn them into links (no request leaves the device)
  if (remoteImages === 'link') s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g, (_m, alt: string, url: string) => `[🖼 ${alt || 'image'}](${url})`)
  return s
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blockText = (b: any): string => Array.isArray(b?.content) ? b.content.map((c: any) => c.text ?? (c.content ?? []).map((x: any) => x.text ?? '').join('')).join('') : ''

const cleanName = (name: string) => name.replace(MD_EXT, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Parse one markdown text into blocks + metadata. Images are resolved later (need the folder's files). */
export function parseMarkdown(text: string, fileName: string, path: string, opts: Pick<ImportOptions, 'titleFrom' | 'remoteImages'>): ParsedDoc {
  const { meta, body } = splitFrontMatter(text)
  const blocks = normalizeCode(ed().tryParseMarkdownToBlocks(preprocess(body, opts.remoteImages)) as unknown[]) as Record<string, unknown>[]
  // drop leading empty paragraphs
  while (blocks.length && blocks[0].type === 'paragraph' && !blockText(blocks[0]).trim()) blocks.shift()
  let title = typeof meta.title === 'string' ? meta.title : ''
  if (!title && opts.titleFrom === 'heading' && blocks[0]?.type === 'heading' && (blocks[0].props as { level: number })?.level === 1) {
    title = blockText(blocks[0]); blocks.shift()
  } else if (title && blocks[0]?.type === 'heading' && blockText(blocks[0]).trim() === title.trim()) blocks.shift()
  if (!title) title = cleanName(fileName)
  const tags = ([] as string[]).concat(meta.tags ?? [], meta.labels ?? [], meta.tag ?? []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
  const color = typeof meta.color === 'string' && (COLOR_KEYS as string[]).includes(meta.color.toLowerCase()) ? meta.color.toLowerCase() as ColorKey : null
  const created = typeof meta.created === 'string' || typeof meta.date === 'string' ? Date.parse(String(meta.created ?? meta.date)) || null : null
  const stats = { headings: 0, tables: 0, code: 0, tasks: 0, images: 0 }
  let words = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (bs: any[]) => { for (const b of bs) {
    if (b.type === 'heading') stats.headings++
    if (b.type === 'table') stats.tables++
    if (b.type === 'codeBlock') stats.code++
    if (b.type === 'checkListItem') stats.tasks++
    if (b.type === 'image') stats.images++
    words += (blockText(b).match(/\S+/g) ?? []).length
    if (b.children?.length) walk(b.children)
  } }
  walk(blocks)
  return {
    path, fileName, title, blocks, tags, color, pinned: meta.pinned === 'true',
    icon: typeof meta.icon === 'string' ? meta.icon : typeof meta.emoji === 'string' ? meta.emoji : null,
    created, words, stats, missingImages: [],
  }
}

const dirname = (p: string) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
function joinPath(base: string, rel: string) {
  const parts = (base ? base.split('/') : [])
  for (const seg of decodeURIComponent(rel).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

/** Replace relative image URLs with embedded data URLs using files from the imported folder. */
export async function resolveImages(doc: ParsedDoc, images: Map<string, File>, store = false) {
  const byName = new Map<string, File>()
  for (const [p, f] of images) byName.set(p.split('/').pop()!.toLowerCase(), f)
  const missing: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = async (bs: any[]) => { for (const b of bs) {
    if (b.type === 'image' && b.props?.url && !/^(https?:|data:)/.test(b.props.url)) {
      const url: string = b.props.url.split(/[?#]/)[0]
      const f = images.get(joinPath(dirname(doc.path), url)) ?? byName.get(url.split('/').pop()!.toLowerCase())
      if (f) { const url = await fileToDataUrl(f); b.props.url = store ? await putImage(url) : url }
      else { missing.push(url); b.type = 'paragraph'; b.content = [{ type: 'text', text: `🖼 Missing image: ${url}`, styles: { italic: true } }]; b.props = {} }
    }
    if (b.children?.length) await walk(b.children)
  } }
  await walk(doc.blocks)
  doc.missingImages = missing
  return doc
}

/** Read a picked / dropped set of files into parsed docs + an image lookup. */
export async function readFiles(files: File[], opts: Pick<ImportOptions, 'titleFrom' | 'remoteImages'>) {
  const images = new Map<string, File>()
  const docs: ParsedDoc[] = []
  for (const f of files) if (isImageFile(f)) images.set(relPath(f), f)
  const mds = files.filter(isMarkdownFile).sort((a, b) => relPath(a).localeCompare(relPath(b)))
  for (const f of mds) {
    const p = relPath(f)
    docs.push(parseMarkdown(await f.text(), f.name, p.includes('/') ? p : '', opts))
  }
  return { docs, images }
}

/** Write parsed docs into the database. Folders become parent pages when keepFolders is on. */
export async function importDocs(docs: ParsedDoc[], images: Map<string, File>, opts: ImportOptions, onProgress?: (n: number) => void) {
  const labels = await db.labels.toArray()
  const labelId = async (name: string) => {
    const hit = labels.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (hit) return hit.id
    const l = await createLabel(name); labels.push(l); return l.id
  }
  const folderPages = new Map<string, string>()
  const folderId = async (dir: string): Promise<string | null> => {
    if (!opts.keepFolders || !dir) return opts.parentId
    // skip the top-level picked folder itself so its contents land at the destination
    const parts = dir.split('/')
    if (parts.length === 1) return opts.parentId
    if (folderPages.has(dir)) return folderPages.get(dir)!
    const parent = await folderId(parts.slice(0, -1).join('/'))
    const page = await createNote({ title: parts[parts.length - 1], icon: '📁', parentId: parent, labels: opts.labelIds })
    folderPages.set(dir, page.id)
    return page.id
  }
  const created: Note[] = []
  let i = 0
  for (const d of docs) {
    await resolveImages(d, images, true)
    const tagIds = await Promise.all(d.tags.map(labelId))
    const note = await createNote({
      title: d.title, content: d.blocks, parentId: await folderId(dirname(d.path)),
      labels: Array.from(new Set([...opts.labelIds, ...tagIds])),
      color: opts.color ?? d.color ?? 'default', icon: d.icon, pinned: d.pinned,
      ...(d.created ? { createdAt: d.created } : {}),
    })
    created.push(note)
    onProgress?.(++i)
  }
  return created
}

// ---------------- export ----------------
const safe = (s: string) => (s || 'Untitled').replace(/[\\/:*?"<>|#^[\]]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'

export function noteToMarkdown(n: Note, labelNames: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = ed().blocksToMarkdownLossy((n.content?.length ? n.content : []) as any)
  const fm = ['---', `title: ${JSON.stringify(n.title || 'Untitled')}`]
  if (n.labels.length) fm.push(`tags: [${n.labels.map((l) => JSON.stringify(labelNames[l] ?? l)).join(', ')}]`)
  if (n.color !== 'default') fm.push(`color: ${n.color}`)
  if (n.icon) fm.push(`icon: ${n.icon}`)
  if (n.pinned) fm.push('pinned: true')
  fm.push(`created: ${new Date(n.createdAt).toISOString()}`, `updated: ${new Date(n.updatedAt).toISOString()}`, '---', '')
  return `${fm.join('\n')}\n# ${n.title || 'Untitled'}\n\n${body}`
}

/** Every unlocked note as a .md file in a zip, folders for sub-pages, images in /assets. */
/** Every visible note as Markdown files (+ extracted images), keyed by relative path. */
export async function buildMarkdownFiles() {
  const notes = (await db.notes.toArray()).filter((n) => n.trashedAt === null && !n.locked && !n.templateDraft)
  const labelNames = Object.fromEntries((await db.labels.toArray()).map((l) => [l.id, l.name]))
  const byId = new Map(notes.map((n) => [n.id, n]))
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  const pathOf = (n: Note): string => {
    const parts: string[] = []
    let p = n.parentId
    while (p && byId.get(p)) { parts.unshift(safe(byId.get(p)!.title)); p = byId.get(p)!.parentId }
    return parts.join('/')
  }
  let img = 0
  for (const n of notes) {
    const dir = pathOf(n)
    const depth = dir ? dir.split('/').length : 0
    // pull embedded images out into files
    const content = structuredClone(await inlineRefs(n.content ?? []))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (bs: any[]) => { for (const b of bs) {
      const url: string | undefined = b.props?.url
      if (b.type === 'image' && url?.startsWith('data:')) {
        const m = url.match(/^data:image\/(\w+);base64,(.*)$/)
        if (m) {
          const name = `assets/image-${++img}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
          files[name] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
          b.props.url = `${'../'.repeat(depth)}${name}`
        }
      }
      if (b.children?.length) walk(b.children)
    } }
    walk(content)
    let name = `${dir ? dir + '/' : ''}${safe(n.title)}.md`
    let k = 2
    while (used.has(name)) name = `${dir ? dir + '/' : ''}${safe(n.title)} ${k++}.md`
    used.add(name)
    files[name] = strToU8(noteToMarkdown({ ...n, content }, labelNames))
  }
  return { files, count: notes.length }
}

export async function exportAllMarkdown() {
  const { files, count } = await buildMarkdownFiles()
  const zip = zipSync(files, { level: 6 })
  download(`folio-markdown-${todayKey()}.zip`, new Blob([zip as BlobPart], { type: 'application/zip' }))
  return count
}
