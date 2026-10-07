// V6.1 presentations. A deck is a note with `deck` set: the slides, a theme and where it came from.
// The note's own content is kept as a readable outline of the slides, so search, cards and export work.
// One HTML renderer draws every slide — in the studio, the thumbnails, Present mode and print/PDF —
// and pptx.ts mirrors the same layouts for PowerPoint.
import { nanoid } from 'nanoid'
import type { Note } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
import { LAYOUTS, type Column, type Deck, type Layout, type Slide } from './deckRender'
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
        if ((s.bullets?.length ?? 0) >= 6) { const t = s.title; push(); cur = { id: nanoid(8), layout: 'bullets', title: t ? `${t} (cont.)` : '', bullets: [] } }
        ensure().bullets!.push(text.length > 220 ? text.slice(0, 217).trimEnd() + '…' : text)
      }
      if (b.children?.length && depth < 1) walk(b.children, depth + 1)
    }
  }
  walk(blocks)
  push()
  if (slides.length === 1) slides.push({ id: nanoid(8), layout: 'bullets', title: 'Overview', bullets: [] })
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
    if (s.table?.head.length) out.push({ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [s.table.head, ...s.table.rows].map((r) => ({ cells: r.map((c) => t(c)) })) } })
    if (s.subtitle && s.layout !== 'section') out.push({ type: 'paragraph', content: t(s.subtitle) })
  }
  return out
}

// ---------------------------------------------------------------- AI
export interface AiOpts { purpose: 'inform' | 'pitch' | 'teach' | 'status' | 'summary'; length: 'short' | 'standard' | 'detailed'; notes: boolean; extra: string }
const PURPOSE: Record<AiOpts['purpose'], string> = {
  inform: 'an informative presentation that explains the material clearly',
  pitch: 'a persuasive pitch: the problem, why it matters, the proposal, the evidence and a clear ask',
  teach: 'a teaching deck that builds understanding step by step, with examples from the source',
  status: 'a status update: where things stand, progress, risks and next steps',
  summary: 'an executive summary: the few things a busy reader must know, and what to do',
}
const LENGTH: Record<AiOpts['length'], string> = { short: '5 to 7', standard: '8 to 12', detailed: '13 to 18' }

export function deckPrompt(o: AiOpts, today: string) {
  return `You design clear, professional slide decks from source material. Write ${PURPOSE[o.purpose]}.
Reply with ONE JSON object and nothing else (no Markdown, no code fence):
{"title": string, "subtitle": string, "slides": [Slide, ...]}
Slide = {"layout": "title"|"section"|"bullets"|"two"|"stat"|"quote"|"table"|"closing", "title": string, "subtitle"?: string, "bullets"?: string[], "left"?: {"heading": string, "bullets": string[]}, "right"?: {"heading": string, "bullets": string[]}, "stats"?: [{"value": string, "label": string}], "quote"?: {"text": string, "by": string}, "table"?: {"head": string[], "rows": string[][]}${o.notes ? ', "notes": string' : ''}}
Rules:
- ${LENGTH[o.length]} slides in total. The first is "title"; the last is "closing" with 2–4 key takeaways as bullets.
- Use the source only. Never invent facts, names, numbers, dates or quotes. Keep figures and technical terms exactly.
- Bullets: 3–6 per slide, each a short phrase of at most 14 words. Use **bold** for the one key term in a bullet when it helps.
- Choose layouts for the content: "two" to compare or contrast; "stat" only for real figures from the source (1–3 of them, value short like "42%" or "3.2 MW"); "table" for structured comparisons (max 6 rows, max 4 columns); "quote" only for a real quotation; "section" to open each part when there are more than 8 slides.
- Slide titles are short and specific (at most 8 words) — say the point, not the topic, where you can.
${o.notes ? '- "notes": 2–4 sentences the presenter can say, in plain spoken language.\n' : ''}- Write in the main language of the source. Today is ${today}.${o.extra.trim() ? `\nThe author also asks: ${o.extra.trim()}` : ''}`
}

const LAYOUT_SET = new Set<Layout>(['title', 'section', 'bullets', 'two', 'quote', 'stat', 'table', 'image', 'closing'])
const strs = (x: unknown, max = 10) => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, max) : [])
/** Turn whatever the model returned into valid slides (anything malformed is repaired or dropped). */
export function parseDeck(raw: string): { title: string; subtitle: string; slides: Slide[] } {
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
  if (a < 0 || b < a) throw new Error('The AI didn’t return slides. Try again, or use “From headings”.')
  txt = txt.slice(a, b + 1)
  let j: Record<string, unknown>
  try { j = JSON.parse(txt) } catch { throw new Error('The AI’s answer was cut short or garbled. Try again, or choose a shorter length.') }
  const slides: Slide[] = []
  for (const r of (Array.isArray(j.slides) ? j.slides : []) as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    let layout = (LAYOUT_SET.has(r.layout as Layout) ? r.layout : 'bullets') as Layout
    const col = (c: unknown): Column | undefined => (c && typeof c === 'object' ? { heading: String((c as Column).heading ?? '').trim() || undefined, bullets: strs((c as Column).bullets, 8) } : undefined)
    const s: Slide = { id: nanoid(8), layout, title: String(r.title ?? '').trim(), subtitle: String(r.subtitle ?? '').trim() || undefined, bullets: strs(r.bullets), notes: String(r.notes ?? '').trim() || undefined }
    if (layout === 'two') { s.left = col(r.left); s.right = col(r.right); if (!s.left?.bullets.length && !s.right?.bullets.length) layout = s.layout = 'bullets' }
    if (layout === 'stat') { s.stats = (Array.isArray(r.stats) ? r.stats : []).map((x: { value?: unknown; label?: unknown }) => ({ value: String(x?.value ?? '').trim(), label: String(x?.label ?? '').trim() })).filter((x) => x.value).slice(0, 3); if (!s.stats.length) s.layout = 'bullets' }
    if (layout === 'quote') { const q = r.quote as { text?: unknown; by?: unknown } | undefined; s.quote = { text: String(q?.text ?? '').trim(), by: String(q?.by ?? '').trim() || undefined }; if (!s.quote.text) s.layout = 'bullets' }
    if (layout === 'table') { const t = r.table as { head?: unknown; rows?: unknown } | undefined; const head = strs(t?.head, 5); const rows = (Array.isArray(t?.rows) ? t!.rows as unknown[] : []).map((row) => strs(row, 5)).filter((x) => x.length).slice(0, 10); s.table = { head, rows }; if (!head.length) s.layout = 'bullets' }
    if (!s.title && !s.bullets?.length && s.layout === 'bullets') continue
    slides.push(s)
  }
  if (!slides.length) throw new Error('The AI returned no slides. Try again, or use “From headings”.')
  if (slides[0].layout !== 'title') slides.unshift({ id: nanoid(8), layout: 'title', title: String(j.title ?? '').trim() || 'Presentation', subtitle: String(j.subtitle ?? '').trim() || undefined })
  return { title: String(j.title ?? '').trim() || slides[0].title, subtitle: String(j.subtitle ?? '').trim(), slides }
}

/** Long sources are condensed part by part first (Groq’s free plan allows ~8k tokens a minute). */
export async function generateWithAI(source: string, o: AiOpts, progress: (s: string) => void): Promise<{ title: string; subtitle: string; slides: Slide[] }> {
  const { askAI } = await import('./voice')
  const wait = (n: number) => progress(`Waiting ${n}s for Groq’s free limit…`)
  let material = source.trim()
  if (material.length > 14000) {
    const parts: string[] = []
    let rest = material
    while (rest.length) { let cut = rest.length > 9000 ? rest.lastIndexOf('\n', 9000) : rest.length; if (cut < 4500) cut = Math.min(9000, rest.length); parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trim() }
    const notes: string[] = []
    for (let i = 0; i < Math.min(parts.length, 8); i++) {
      progress(`Reading part ${i + 1} of ${Math.min(parts.length, 8)}…`)
      notes.push(await askAI('You condense source material into detailed bullet notes for a presentation. Keep every key point, figure, name and date exactly. No title, no preamble.', parts[i], 1400, wait))
    }
    material = notes.join('\n\n')
  }
  progress('Designing the slides…')
  const today = new Date().toISOString().slice(0, 10)
  const raw = await askAI(deckPrompt(o, today), `SOURCE:\n${material}`, o.length === 'detailed' ? 6000 : 4500, wait)
  try { return parseDeck(raw) } catch (e) {
    progress('Tidying the answer…')
    const again = await askAI('Return only the JSON object from the text below, repaired so it is valid JSON. No other text.', raw.slice(0, 20000), o.length === 'detailed' ? 6000 : 4500, wait).catch(() => '')
    if (again) return parseDeck(again)
    throw e
  }
}
/** Rewrite one slide (shorter, punchier, more detail…). */
export async function rewriteSlide(s: Slide, how: string): Promise<Slide> {
  const { askAI } = await import('./voice')
  const { id: _id, image: _img, ...rest } = s; void _id; void _img
  const raw = await askAI(`You edit one presentation slide. ${how}. Keep the facts exactly; never invent anything. Reply with the slide as ONE JSON object of the same shape and nothing else: {"slides":[ ... ]}.`, JSON.stringify({ slides: [rest] }), 1500)
  const out = parseDeck(raw.includes('"slides"') ? raw : `{"slides":[${raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)}]}`).slides.find((x) => x.layout !== 'title' || s.layout === 'title')
  return out ? { ...out, id: s.id, image: s.image } : s
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
