// V6.1 presentations. A deck is a note with `deck` set: the slides, a theme and where it came from.
// The note's own content is kept as a readable outline of the slides, so search, cards and export work.
// One HTML renderer draws every slide — in the studio, the thumbnails, Present mode and print/PDF —
// and pptx.ts mirrors the same layouts for PowerPoint.
import { nanoid } from 'nanoid'
import type { Note } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
import { LAYOUTS, type Deck, type Item, type Layout, type Slide } from './deckRender'
import { flowToText } from './deckDiagrams'
export * from './deckRender'

// ---------------------------------------------------------------- slides ⇄ note text
const inl = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: Block) => (x.type === 'text' ? (x.styles?.bold ? `**${x.text}**` : x.text ?? '') : inl(x.content))).join('') : '')
const plainInl = (c: unknown): string => inl(c).replace(/\*\*/g, '')
export const newSlide = (layout: Layout = 'bullets', title = ''): Slide => ({ id: nanoid(8), layout, title, bullets: layout === 'bullets' || layout === 'closing' ? [] : undefined })

/**
 * No-AI deck from a note's structure: the title slide, then one slide per heading with its bullets,
 * tables, quotes and pictures. Long sections are split so nothing is crammed.
 */
export function fromBlocks(blocks: Block[], title: string, subtitle = ''): Slide[] {
  const slides: Slide[] = [{ id: nanoid(8), layout: 'title', title: title || 'Untitled', subtitle }]
  const levels = blocks.filter((b) => b.type === 'heading').map((b) => b.props?.level ?? 1)
  const top = levels.length ? Math.min(...levels) : 1
  const hasSub = levels.some((l) => l > top)
  let cur: Slide | null = null
  const numbered = new Set<string>()
  const push = () => { if (cur && (cur.title || cur.bullets?.length || cur.layout !== 'bullets')) slides.push(cur); cur = null }
  const ensure = () => { cur ??= { id: nanoid(8), layout: 'bullets', title: '', bullets: [] }; return cur }
  const walk = (bs: Block[], depth = 0) => {
    for (const b of bs) {
      const text = inl(b.content).trim()
      if (b.type === 'heading') {
        push()
        // with two heading levels, the top level becomes section slides
        if (hasSub && (b.props?.level ?? 1) === top) { slides.push({ id: nanoid(8), layout: 'section', title: plainInl(b.content).trim() }); continue }
        cur = { id: nanoid(8), layout: 'bullets', title: plainInl(b.content).trim(), bullets: [] }
        continue
      }
      if (b.type === 'table') {
        const rows: string[][] = (b.content?.rows ?? []).map((r: Block) => (r.cells ?? []).map((c: Block) => plainInl(Array.isArray(c) ? c : c?.content).trim()))
        const t = cur?.title ?? ''
        if (cur && !(cur.bullets?.length)) cur = null; else push()
        if (rows.length) slides.push({ id: nanoid(8), layout: 'table', title: t, table: { head: rows[0], rows: rows.slice(1) } })
        continue
      }
      if (b.type === 'image' && b.props?.url) { const t = cur?.title ?? ''; if (cur && !(cur.bullets?.length)) cur = null; else push(); slides.push({ id: nanoid(8), layout: 'image', title: t || b.props?.caption || '', image: b.props.url }); continue }
      if (b.type === 'quote' && text) { const t = cur; if (t && !(t.bullets?.length)) cur = null; else push(); slides.push({ id: nanoid(8), layout: 'quote', title: '', quote: { text: plainInl(b.content).trim() } }); continue }
      if (text && ['paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'].includes(b.type)) {
        const s = ensure()
        if (b.type === 'numberedListItem') numbered.add(s.id)
        if ((s.bullets?.length ?? 0) >= 6) { const t = s.title; push(); cur = { id: nanoid(8), layout: 'bullets', title: t ? `${t} (cont.)` : '', bullets: [] } }
        ensure().bullets!.push(text.length > 220 ? text.slice(0, 217).trimEnd() + '…' : text)
      }
      if (b.children?.length && depth < 1) walk(b.children, depth + 1)
    }
  }
  walk(blocks)
  push()
  if (slides.length === 1) slides.push({ id: nanoid(8), layout: 'bullets', title: 'Overview', bullets: [] })
  // V6.2: lists that are really a sequence or a schedule become diagrams
  const WHEN = /^((?:19|20)\d{2}|Q[1-4](?:\s+\d{4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{1,4})?|(?:week|phase|stage|day|month)\s+\d+)\s*[:—–-]\s*(.+)$/i
  const split = (x: string): Item => { const [label, ...d] = x.replace(/\*\*/g, '').split(/\s+[—–]\s+|:\s+/); return { label: label.trim(), detail: d.join(' — ').trim() || undefined } }
  for (const s of slides) {
    const b = s.bullets ?? []
    if (s.layout !== 'bullets' || b.length < 3 || b.length > 7) continue
    const dated = b.map((x) => WHEN.exec(x.replace(/\*\*/g, '')))
    if (dated.every(Boolean)) { s.layout = 'timeline'; s.items = dated.map((m) => ({ when: m![1], ...split(m![2]) })); s.bullets = undefined; continue }
    if (numbered.has(s.id) && b.length <= 6 && b.every((x) => x.length <= 90)) { s.layout = 'process'; s.items = b.map(split); s.bullets = undefined }
  }
  // decks with three or more parts get an agenda after the title
  const parts = slides.filter((x) => x.layout === 'section')
  if (parts.length >= 3) slides.splice(1, 0, { id: nanoid(8), layout: 'agenda', title: 'Agenda', items: parts.map((x) => ({ label: x.title })) })
  return slides
}

/** The note body that mirrors a deck (searchable, readable on cards, exportable). */
export function outlineBlocks(d: Deck): Block[] {
  const out: Block[] = []
  const t = (s: string) => [{ type: 'text', text: s, styles: {} }]
  for (const s of d.slides) {
    if (s.layout === 'title') { if (s.subtitle) out.push({ type: 'paragraph', content: t(s.subtitle) }); continue }
    out.push({ type: 'heading', props: { level: s.layout === 'section' ? 2 : 3 }, content: t(s.title || LAYOUTS.find((l) => l.k === s.layout)!.label) })
    for (const x of s.bullets ?? []) out.push({ type: 'bulletListItem', content: t(x.replace(/\*\*/g, '')) })
    for (const c of [s.left, s.right]) if (c) { if (c.heading) out.push({ type: 'paragraph', content: [{ type: 'text', text: c.heading, styles: { bold: true } }] }); for (const x of c.bullets) out.push({ type: 'bulletListItem', content: t(x.replace(/\*\*/g, '')) }) }
    for (const x of s.stats ?? []) out.push({ type: 'bulletListItem', content: [{ type: 'text', text: x.value, styles: { bold: true } }, { type: 'text', text: ` — ${x.label}`, styles: {} }] })
    if (s.quote?.text) out.push({ type: 'quote', content: t(s.quote.text + (s.quote.by ? ` — ${s.quote.by}` : '')) })
    for (const it of s.items ?? []) out.push({ type: s.layout === 'agenda' ? 'numberedListItem' : 'bulletListItem', content: t([it.when ? `${it.when}: ` : '', it.label, it.detail ? ` — ${it.detail}` : ''].join('')) })
    if (s.chart?.data.length) out.push({ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [[s.chart.series || 'Item', s.chart.unit ? `Value (${s.chart.unit})` : 'Value'], ...s.chart.data.map((d) => [d.label, String(d.value)])].map((r) => ({ cells: r.map((c) => t(c)) })) } })
    if (s.matrix) for (const q of s.matrix.quads) if (q.title) { out.push({ type: 'paragraph', content: [{ type: 'text', text: q.title, styles: { bold: true } }] }); for (const x of q.points) out.push({ type: 'bulletListItem', content: t(x) }) }
    if (s.flow?.nodes.length) for (const line of flowToText(s.flow).split('\n')) out.push({ type: 'bulletListItem', content: t(line) })
    if (s.table?.head.length) out.push({ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [s.table.head, ...s.table.rows].map((r) => ({ cells: r.map((c) => t(c)) })) } })
    if (s.subtitle && s.layout !== 'section') out.push({ type: 'paragraph', content: t(s.subtitle) })
  }
  return out
}

// ---------------------------------------------------------------- sources
export async function noteSource(noteId: string, withPages: boolean) {
  const { db } = await import('./db')
  const all = await db.notes.toArray()
  const root = all.find((n) => n.id === noteId)
  if (!root) throw new Error('Note not found')
  const list: Note[] = [root]
  if (withPages) { const walk = (id: string) => { for (const k of all.filter((n) => n.parentId === id && n.trashedAt === null && !n.locked).sort((a, b) => a.position - b.position)) { list.push(k); walk(k.id) } }; walk(noteId) }
  const blocks: Block[] = []
  for (const [i, n] of list.entries()) { if (i) blocks.push({ type: 'heading', props: { level: 1 }, content: n.title || 'Untitled' }); blocks.push(...(n.content ?? [])) }
  const { blocksToMd } = await import('./markdown')
  return { title: root.title || 'Untitled', blocks, text: list.map((n, i) => `${i ? `# ${n.title}\n\n` : ''}${blocksToMd(n.content ?? [])}`).join('\n\n') }
}
export async function markdownSource(file: File) {
  const text = await file.text()
  const { mdToBlocks, splitFrontMatter } = await import('./markdown')
  const { meta, body } = splitFrontMatter(text)
  const blocks = await mdToBlocks(body)
  const h1 = blocks.find((b) => b.type === 'heading' && (b.props?.level ?? 1) === 1)
  const title = (typeof meta.title === 'string' && meta.title) || (h1 ? plainInl(h1.content) : '') || file.name.replace(/\.(md|markdown|txt)$/i, '')
  return { title, blocks: h1 ? blocks.filter((b) => b !== h1) : blocks, text: body }
}
/** Text of a PDF (first 80 pages), with headings guessed from larger type. */
export async function pdfSource(data: ArrayBuffer | import('pdfjs-dist').PDFDocumentProxy, name: string, progress?: (s: string) => void) {
  const { openPdf, pageToParagraphs, cleanTitle } = await import('./margins')
  const doc = data instanceof ArrayBuffer ? await openPdf(data) : data
  const pages = Math.min(doc.numPages, 80)
  const out: string[] = []
  for (let i = 1; i <= pages; i++) {
    if (progress && i % 5 === 1) progress(`Reading page ${i} of ${pages}…`)
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const paras = pageToParagraphs(tc.items as never, page.getViewport({ scale: 1 }).height)
    out.push(paras.map((p) => (p.kind === 'h' ? `## ${p.text}` : p.text)).join('\n\n'))
  }
  const meta = await doc.getMetadata().catch(() => null)
  const title = cleanTitle((meta?.info as { Title?: string } | undefined)?.Title ?? '', name)
  return { title, text: out.join('\n\n'), pages: doc.numPages, doc }
}
/** No-AI PDF deck: every page as a full slide picture (great for presenting a PDF). */
export async function pdfPageSlides(doc: import('pdfjs-dist').PDFDocumentProxy, progress?: (s: string) => void): Promise<Slide[]> {
  const { putImage } = await import('./blobs')
  const slides: Slide[] = []
  const pages = Math.min(doc.numPages, 60)
  for (let i = 1; i <= pages; i++) {
    progress?.(`Page ${i} of ${pages}…`)
    const page = await doc.getPage(i)
    const v0 = page.getViewport({ scale: 1 })
    const scale = Math.min(1600 / v0.width, 1200 / v0.height)
    const v = page.getViewport({ scale })
    const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height)
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: v, canvas: c } as never).promise
    slides.push({ id: nanoid(8), layout: 'image', title: '', image: await putImage(c.toDataURL('image/jpeg', 0.86)) })
  }
  return slides
}

// ---------------------------------------------------------------- saving
export async function saveDeck(deck: Deck, extra: Partial<Note> = {}) {
  const { createNote } = await import('./db')
  return createNote({ title: deck.title, deck, content: outlineBlocks(deck), icon: '📽️', ...extra })
}
export async function updateDeck(noteId: string, deck: Deck) {
  const { updateNote } = await import('./db')
  await updateNote(noteId, { deck, title: deck.title, content: outlineBlocks(deck) })
}
