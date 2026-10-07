// V6 export: any note, a selection, or everything — as Word, PDF (print), Markdown, a web page or
// plain text. One combined document or separate files in a zip, with pages inside, images, and links
// between notes kept wherever the format allows. Loaded only when you export.
import { strToU8, zipSync } from 'fflate'
import type { Label, Note } from '../types'
import { db, download } from './db'
import { inlineRefs } from './blobs'
import { blocksToHtml, blocksToMd } from './markdown'
import { todayKey } from './templates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
export type Format = 'docx' | 'pdf' | 'md' | 'html' | 'txt'
export type Scope = { ids: string[] } | { all: true }
export interface Options { format: Format; pages: boolean; details: boolean; images: boolean; separate: boolean }

export interface Doc { note: Note; depth: number; dir: string; file: string; blocks: Block[] }

const safe = (s: string) => (s || 'Untitled').replace(/[\\/:*?"<>|#^[\]]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'
const titleOf = (n: Note) => n.title?.trim() || 'Untitled'
const isLive = (n: Note) => n.trashedAt === null && !n.locked && !n.templateDraft

/** What would be exported: the chosen notes, then (optionally) every page inside them, in order. */
export async function gather(scope: Scope, pages: boolean): Promise<{ docs: Omit<Doc, 'blocks' | 'file' | 'dir'>[]; locked: number; images: number; inside: number }> {
  const all = await db.notes.toArray()
  const kids = new Map<string, Note[]>()
  for (const n of all) if (n.parentId && isLive(n)) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
  const roots = 'all' in scope
    ? all.filter((n) => !n.parentId && n.trashedAt === null && !n.templateDraft).sort((a, b) => b.updatedAt - a.updatedAt)
    : scope.ids.map((id) => all.find((n) => n.id === id)).filter((n): n is Note => !!n)
  const out: { note: Note; depth: number }[] = []
  const seen = new Set<string>()
  let locked = 0, inside = 0
  const walk = (n: Note, depth: number) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    if (n.locked) { locked++; return }
    if (!isLive(n)) return
    out.push({ note: n, depth }); if (depth) inside++
    if (pages) for (const k of kids.get(n.id) ?? []) walk(k, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  let images = 0
  const count = (bs: Block[]) => { for (const b of bs ?? []) { if (b.type === 'image') images++; if (b.children?.length) count(b.children) } }
  for (const d of out) count(d.note.content)
  return { docs: out, locked, images, inside }
}

/** Load each note's content with its images inlined, and give each a file name / folder. */
async function prepare(scope: Scope, o: Options, ext: string): Promise<Doc[]> {
  const { docs } = await gather(scope, o.pages)
  const byId = new Map(docs.map((d) => [d.note.id, d]))
  const used = new Set<string>()
  const out: Doc[] = []
  for (const d of docs) {
    const parts: string[] = []
    let p = d.note.parentId
    while (p && byId.has(p)) { parts.unshift(safe(titleOf(byId.get(p)!.note))); p = byId.get(p)!.note.parentId }
    const dir = parts.join('/')
    let file = `${dir ? dir + '/' : ''}${safe(titleOf(d.note))}.${ext}`
    for (let k = 2; used.has(file.toLowerCase()); k++) file = `${dir ? dir + '/' : ''}${safe(titleOf(d.note))} ${k}.${ext}`
    used.add(file.toLowerCase())
    out.push({ ...d, dir, file, blocks: o.images || o.format !== 'md' ? await inlineRefs(structuredClone(d.note.content ?? [])) : structuredClone(d.note.content ?? []) })
  }
  return out
}

/** Links to other notes: point at the exported copy if it's included, otherwise keep just the words. */
function relinkInline(items: Block[], target: (id: string) => string | null): Block[] {
  const out: Block[] = []
  for (const it of items ?? []) {
    if (it.type === 'link' && typeof it.href === 'string' && it.href.includes('#note=')) {
      const to = target(it.href.split('#note=')[1])
      if (to) out.push({ ...it, href: to }); else out.push(...(it.content ?? []))
    } else out.push(it)
  }
  return out
}
function relink(blocks: Block[], target: (id: string) => string | null): Block[] {
  return (blocks ?? []).map((b) => {
    const nb = { ...b }
    if (Array.isArray(b.content)) nb.content = relinkInline(b.content, target)
    else if (b.content?.type === 'tableContent') nb.content = { ...b.content, rows: b.content.rows.map((r: Block) => ({ ...r, cells: r.cells.map((c: Block) => Array.isArray(c) ? relinkInline(c, target) : { ...c, content: relinkInline(c.content, target) }) })) }
    if (b.children?.length) nb.children = relink(b.children, target)
    return nb
  })
}
const relPath = (from: string, to: string) => {
  const a = from.split('/').slice(0, -1), b = to.split('/')
  let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].map(encodeURIComponent).join('/')
}

async function labelNames() { return Object.fromEntries((await db.labels.toArray()).map((l: Label) => [l.id, l.name])) as Record<string, string> }
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
function metaLine(n: Note, labels: Record<string, string>) {
  const parts = [`Created ${when(n.createdAt)}`, `Edited ${when(n.updatedAt)}`]
  const ls = n.labels.map((l) => labels[l]).filter(Boolean)
  if (ls.length) parts.push(ls.join(', '))
  return parts.join(' · ')
}
const baseName = (docs: Doc[], scope: Scope) => ('all' in scope ? `Folio notes ${todayKey()}` : docs.length && docs[0].depth === 0 && (scope.ids.length === 1) ? safe(titleOf(docs[0].note)) : `Folio export ${todayKey()}`)

// ---------------------------------------------------------------- Markdown
function mdFor(d: Doc, labels: Record<string, string>, o: Options, files: Record<string, Uint8Array>, imgCount: { n: number }, target: (id: string) => string | null) {
  let blocks = relink(d.blocks, target)
  // images out into assets/ next to the notes
  const depth = d.dir ? d.dir.split('/').length : 0
  const walk = (bs: Block[]): Block[] => bs.flatMap((b) => {
    const url: string | undefined = b.props?.url
    if (b.type === 'image' && url) {
      if (!o.images) return []
      const m = url.match(/^data:image\/(\w+);base64,(.*)$/)
      if (m) {
        const name = `assets/image-${++imgCount.n}.${m[1] === 'jpeg' ? 'jpg' : m[1].replace('svg+xml', 'svg')}`
        files[name] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
        return [{ ...b, props: { ...b.props, url: `${'../'.repeat(depth)}${name}` } }]
      }
    }
    return [{ ...b, ...(b.children?.length ? { children: walk(b.children) } : {}) }]
  })
  blocks = walk(blocks)
  const n = d.note
  const fm: string[] = []
  if (o.details) {
    fm.push('---', `title: ${JSON.stringify(titleOf(n))}`)
    if (n.labels.length) fm.push(`tags: [${n.labels.map((l) => JSON.stringify(labels[l] ?? l)).join(', ')}]`)
    if (n.icon) fm.push(`icon: ${n.icon}`)
    fm.push(`created: ${new Date(n.createdAt).toISOString()}`, `updated: ${new Date(n.updatedAt).toISOString()}`, '---', '')
  }
  return `${fm.join('\n')}${fm.length ? '\n' : ''}# ${titleOf(n)}\n\n${blocksToMd(blocks).trim()}\n`
}

// ---------------------------------------------------------------- web page / PDF
const PAGE_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2328;font:16px/1.65 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:56px 28px 80px}
article+article{margin-top:72px;padding-top:40px;border-top:1px solid #e5e7eb}
h1.doc-title{font:700 2.1em/1.2 Georgia,"Iowan Old Style","Times New Roman",serif;margin:.2em 0 .25em;letter-spacing:-.01em}
.doc-icon{font-size:2.6em;line-height:1}
.doc-meta{color:#6b7280;font-size:.85em;margin:0 0 1.6em}
.doc-cover{height:140px;border-radius:12px;margin-bottom:18px}
h1,h2,h3{line-height:1.25;margin:1.4em 0 .45em}
h1{font-size:1.6em}h2{font-size:1.32em}h3{font-size:1.12em}
p{margin:.45em 0}
a{color:#2563eb}
img{max-width:100%;height:auto;border-radius:8px}
blockquote{margin:.8em 0;padding:.1em 1em;border-left:3px solid #d1d5db;color:#4b5563}
pre{background:#f6f8fa;border-radius:8px;padding:12px 14px;overflow:auto;font:13.5px/1.5 ui-monospace,Consolas,monospace}
code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:#f3f4f6;border-radius:4px;padding:.1em .3em}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.94em}
th,td{border:1px solid #d9dde3;padding:7px 10px;text-align:left;vertical-align:top}
tr:first-child th,tr:first-child td{background:#f6f7f9;font-weight:600}
ul,ol{padding-left:1.5em;margin:.4em 0}
li{margin:.15em 0}
li>p{margin:0}
li:has(> input[type=checkbox]){list-style:none;margin-left:-1.4em;display:flex;gap:.55em;align-items:baseline}
li:has(> input[type=checkbox]:checked)>p{color:#6b7280;text-decoration:line-through}
input[type=checkbox]{margin:0;transform:translateY(2px);flex:none}
hr{border:0;border-top:1px solid #e5e7eb;margin:1.6em 0}
nav.toc{border:1px solid #e5e7eb;border-radius:12px;padding:14px 20px;margin-bottom:40px}
nav.toc h2{margin:0 0 .4em;font-size:1em;text-transform:uppercase;letter-spacing:.08em;color:#6b7280}
nav.toc ol{margin:0}
.depth-1 h1.doc-title{font-size:1.7em}.depth-2 h1.doc-title,.depth-3 h1.doc-title{font-size:1.45em}
.foot{color:#9ca3af;font-size:.8em;text-align:center;margin-top:60px}
@media print{main{padding:0;max-width:none}article{break-before:page}article:first-of-type{break-before:auto}article+article{border-top:0;margin-top:0;padding-top:0}nav.toc{break-after:page}a{color:inherit}.foot{display:none}h1,h2,h3{break-after:avoid}tr,img,pre,blockquote{break-inside:avoid}}
@page{margin:18mm 16mm}
`
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
async function articleHtml(d: Doc, labels: Record<string, string>, o: Options, target: (id: string) => string | null, id?: string) {
  const blocks = relink(o.images ? d.blocks : stripImages(d.blocks), target)
  const n = d.note
  const { coverCss } = await import('./colors')
  const cover = n.cover?.startsWith('g:') ? coverCss(n.cover) : null
  return `<article class="depth-${Math.min(d.depth, 3)}"${id ? ` id="${id}"` : ''}>
${cover ? `<div class="doc-cover" style="background:${esc(cover)}"></div>` : ''}${n.icon ? `<div class="doc-icon">${esc(n.icon)}</div>` : ''}<h1 class="doc-title">${esc(titleOf(n))}</h1>
${o.details ? `<p class="doc-meta">${esc(metaLine(n, labels))}</p>` : ''}
${blocksToHtml(blocks)}
</article>`
}
function stripImages(bs: Block[]): Block[] { return (bs ?? []).filter((b) => b.type !== 'image').map((b) => (b.children?.length ? { ...b, children: stripImages(b.children) } : b)) }
const page = (title: string, body: string) => `<!doctype html>
<html lang="${document.documentElement.lang || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="generator" content="Folio"><style>${PAGE_CSS}</style></head>
<body><main>
${body}
<p class="foot">Exported from Folio · ${esc(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
</main></body></html>`

export async function buildHtml(scope: Scope, o: Options) {
  const docs = await prepare(scope, o, 'html')
  const labels = await labelNames()
  const anchor = (id: string) => `n-${id}`
  const ids = new Set(docs.map((d) => d.note.id))
  const parts: string[] = []
  for (const d of docs) parts.push(await articleHtml(d, labels, o, (id) => (ids.has(id) ? `#${anchor(id)}` : null), anchor(d.note.id)))
  const toc = docs.length > 2 ? `<nav class="toc"><h2>Contents</h2><ol>${docs.map((d) => `<li style="margin-left:${d.depth * 1.2}em"><a href="#${anchor(d.note.id)}">${esc(titleOf(d.note))}</a></li>`).join('')}</ol></nav>` : ''
  return { html: page(docs.length === 1 ? titleOf(docs[0].note) : baseName(docs, scope), toc + parts.join('\n')), docs }
}

// ---------------------------------------------------------------- plain text
function inlineText(c: unknown): string {
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c.map((it: Block) => (it.type === 'text' ? it.text ?? '' : it.type === 'link' ? `${inlineText(it.content)}${it.href && !String(it.href).includes('#note=') ? ` (${it.href})` : ''}` : '')).join('')
}
function blocksToText(bs: Block[], indent = ''): string {
  let num = 0
  const out: string[] = []
  for (const b of bs ?? []) {
    if (b.type !== 'numberedListItem') num = 0
    const t = inlineText(b.content)
    switch (b.type) {
      case 'heading': out.push('', indent + t, indent + (b.props?.level === 1 ? '=' : '-').repeat(Math.min(60, Math.max(3, t.length))), ''); break
      case 'bulletListItem': out.push(`${indent}• ${t}`); break
      case 'numberedListItem': out.push(`${indent}${++num}. ${t}`); break
      case 'checkListItem': out.push(`${indent}[${b.props?.checked ? 'x' : ' '}] ${t}`); break
      case 'quote': out.push(`${indent}> ${t}`, ''); break
      case 'divider': out.push('', indent + '—'.repeat(20), ''); break
      case 'codeBlock': out.push('', ...t.split('\n').map((l) => indent + '    ' + l), ''); break
      case 'image': out.push(`${indent}[image${b.props?.caption ? `: ${b.props.caption}` : ''}]`); break
      case 'table': out.push('', ...(b.content?.rows ?? []).map((r: Block) => indent + r.cells.map((c: Block) => inlineText(Array.isArray(c) ? c : c.content)).join('\t')), ''); break
      default: out.push(indent + t, '')
    }
    if (b.children?.length) out.push(blocksToText(b.children, indent + '    '))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}
function textFor(d: Doc, labels: Record<string, string>, o: Options) {
  const title = titleOf(d.note)
  return `${title}\n${'='.repeat(Math.min(60, Math.max(3, title.length)))}\n${o.details ? metaLine(d.note, labels) + '\n' : ''}\n${blocksToText(d.blocks).trim()}\n`
}

// ---------------------------------------------------------------- run an export
export interface Result { message: string }
export async function runExport(scope: Scope, o: Options): Promise<Result> {
  const labels = await labelNames()
  const plural = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`
  if (o.format === 'pdf') {
    const { html, docs } = await buildHtml(scope, { ...o, images: true })
    await printHtml(html)
    return { message: `Opened ${plural(docs.length)} for printing — choose “Save as PDF” as the printer.` }
  }
  if (o.format === 'docx') {
    const docs = await prepare(scope, o, 'docx')
    const { docxFor } = await import('./docx')
    if (o.separate && docs.length > 1) {
      const files: Record<string, Uint8Array> = {}
      for (const d of docs) files[d.file] = new Uint8Array(await (await docxFor([d], labels, o)).arrayBuffer())
      saveZip(files, `${baseName(docs, scope)} (Word).zip`)
    } else download(`${baseName(docs, scope)}.docx`, await docxFor(docs, labels, o))
    return { message: `Exported ${plural(docs.length)} as Word.` }
  }
  if (o.format === 'html') {
    if (o.separate) {
      const docs = await prepare(scope, o, 'html')
      const byId = new Map(docs.map((d) => [d.note.id, d]))
      const files: Record<string, Uint8Array> = {}
      for (const d of docs) files[d.file] = strToU8(page(titleOf(d.note), await articleHtml(d, labels, o, (id) => (byId.get(id) ? relPath(d.file, byId.get(id)!.file) : null))))
      files['index.html'] = strToU8(page('Folio export', `<h1 class="doc-title">Folio export</h1><nav class="toc"><ol>${docs.map((d) => `<li style="margin-left:${d.depth * 1.2}em"><a href="${d.file.split('/').map(encodeURIComponent).join('/')}">${esc(titleOf(d.note))}</a></li>`).join('')}</ol></nav>`))
      saveZip(files, `${baseName(docs, scope)} (web).zip`)
      return { message: `Exported ${plural(docs.length)} as web pages.` }
    }
    const { html, docs } = await buildHtml(scope, o)
    download(`${baseName(docs, scope)}.html`, new Blob([html], { type: 'text/html' }))
    return { message: `Exported ${plural(docs.length)} as a web page.` }
  }
  const docs = await prepare(scope, o, o.format)
  const byId = new Map(docs.map((d) => [d.note.id, d]))
  if (o.format === 'md') {
    const files: Record<string, Uint8Array> = {}
    const img = { n: 0 }
    if (!o.separate) {
      // one long Markdown file; links between included notes become in-page anchors
      const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
      const body = docs.map((d) => mdFor({ ...d, dir: '' }, labels, { ...o, details: false }, files, img, (id) => (byId.get(id) ? `#${slug(titleOf(byId.get(id)!.note))}` : null)).replace(/^# /, '#'.repeat(Math.min(d.depth + 1, 3)) + ' ')).join('\n\n---\n\n')
      const name = `${baseName(docs, scope)}.md`
      if (Object.keys(files).length) { files[name] = strToU8(body); saveZip(files, `${baseName(docs, scope)} (Markdown).zip`) }
      else download(name, new Blob([body], { type: 'text/markdown' }))
    } else {
      for (const d of docs) files[d.file] = strToU8(mdFor(d, labels, o, files, img, (id) => (byId.get(id) ? relPath(d.file, byId.get(id)!.file) : null)))
      if (docs.length === 1 && Object.keys(files).length === 1) download(docs[0].file, new Blob([files[docs[0].file] as BlobPart], { type: 'text/markdown' }))
      else saveZip(files, `${baseName(docs, scope)} (Markdown).zip`)
    }
    return { message: `Exported ${plural(docs.length)} as Markdown.` }
  }
  // plain text
  if (o.separate && docs.length > 1) {
    const files: Record<string, Uint8Array> = {}
    for (const d of docs) files[d.file] = strToU8(textFor(d, labels, o))
    saveZip(files, `${baseName(docs, scope)} (text).zip`)
  } else download(`${baseName(docs, scope)}.txt`, new Blob([docs.map((d) => textFor(d, labels, o)).join('\n\n\n')], { type: 'text/plain' }))
  return { message: `Exported ${plural(docs.length)} as plain text.` }
}

function saveZip(files: Record<string, Uint8Array>, name: string) {
  download(name, new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: 'application/zip' }))
}

/** Print an HTML document without leaving the app (the browser's dialog offers “Save as PDF”). */
export function printHtml(html: string) {
  return new Promise<void>((resolve) => {
    const f = document.createElement('iframe')
    f.setAttribute('aria-hidden', 'true'); f.title = 'Print preview'
    Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    f.srcdoc = html
    f.onload = async () => {
      const w = f.contentWindow!
      await Promise.all([...w.document.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r }))))
      w.focus(); w.print()
      setTimeout(() => { f.remove(); resolve() }, 1000)
    }
    document.body.appendChild(f)
  })
}

/** Copy one note so it pastes nicely into Word, Outlook, Teams, Docs (formatted) or anywhere (Markdown). */
export async function copyNote(id: string, kind: 'formatted' | 'markdown') {
  const n = await db.notes.get(id); if (!n) return
  const blocks = await inlineRefs(structuredClone(n.content ?? []))
  const md = `# ${titleOf(n)}\n\n${blocksToMd(relink(blocks, () => null))}`
  if (kind === 'markdown') { await navigator.clipboard.writeText(md); return }
  const html = `<h1>${esc(titleOf(n))}</h1>${blocksToHtml(relink(blocks, () => null))}`
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })])
  } else await navigator.clipboard.writeText(md)
}
