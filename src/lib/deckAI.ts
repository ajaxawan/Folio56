// V6.2 AI presentations, the way the best tools do it: first a storyline (an outline you can edit),
// then the slides, designed in batches with GPT-OSS 120B held to a strict JSON schema — so every
// answer is valid. Visual layouts (flowcharts, processes, timelines, charts…) are chosen when the
// content suits them. Afterwards every number on every slide is checked against your source.
import { nanoid } from 'nanoid'
import type { Column, Layout, Slide } from './deckRender'
import type { Flow } from './deckDiagrams'

export interface AiOpts { purpose: 'inform' | 'pitch' | 'teach' | 'status' | 'summary'; length: 'short' | 'standard' | 'detailed'; notes: boolean; extra: string; audience?: string }
export interface OutlineItem { id: string; layout: Layout; title: string; points: string[] }
export interface Outline { title: string; subtitle: string; items: OutlineItem[]; /** what the slides are written from (the source, or notes made from it) */ material: string; /** the full original text, for the number check */ source: string; model?: string }

type Progress = (s: string) => void

// ---------------------------------------------------------------- what the AI may use
export const AI_LAYOUTS: Layout[] = ['title', 'agenda', 'section', 'bullets', 'two', 'stat', 'quote', 'table', 'process', 'flow', 'cycle', 'timeline', 'chart', 'matrix', 'closing']

const PURPOSE: Record<AiOpts['purpose'], string> = {
  inform: 'An informative talk. Storyline: context → the key points, one per slide → what it means → takeaways.',
  pitch: 'A persuasive pitch. Storyline: the problem → why it matters now → the proposal → how it works → evidence and numbers → the plan → the ask.',
  teach: 'A teaching deck. Storyline: why this matters → the core ideas, one at a time, simplest first → a worked example from the source → common mistakes → recap.',
  status: 'A status update. Storyline: the bottom line first → progress against plan → what changed → risks and issues → decisions needed → next steps.',
  summary: 'An executive summary. Storyline: the answer first (the one thing to know) → the 3–5 supporting points → implications → recommended next step.',
}
const LENGTH: Record<AiOpts['length'], [number, number]> = { short: [5, 7], standard: [8, 12], detailed: [13, 18] }

const LAYOUT_GUIDE = `Layouts — choose the one that shows the content best; prefer a visual one whenever the content fits it:
- "process": steps that happen in order (3–6 steps).
- "flow": a flowchart — a procedure with decisions or branches ("if… then…"), approvals, loops.
- "cycle": something that repeats as a loop (3–6 stages).
- "timeline": dated events, phases or milestones (3–7).
- "chart": numbers that compare or change — only when the source gives at least 3 numbers of the same kind.
- "matrix": a 2 × 2 — things placed on two dimensions (e.g. effort vs impact, risk vs likelihood).
- "stat": 1–3 headline figures from the source.
- "two": a comparison or contrast of two things (before/after, option A/B, pros/cons).
- "table": structured facts with several attributes (max 4 columns, 6 rows).
- "quote": a real quotation from the source.
- "bullets": only when nothing more visual fits.
- "agenda": after the title in decks of 10+ slides, listing the parts.
- "section": opens a part, in decks of 12+ slides.
- "title" is first; "closing" is last (takeaways and the next step or ask).`

// ---------------------------------------------------------------- JSON schemas (strict: every field present, unused ones null)
const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const arr = (items: object) => ({ type: 'array', items })
const obj = (props: Record<string, object>) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false })
const orNull = (x: object) => ({ anyOf: [x, { type: 'null' }] })

const OUTLINE_SCHEMA = obj({
  title: S, subtitle: S,
  slides: arr(obj({ layout: { type: 'string', enum: AI_LAYOUTS }, title: S, points: arr(S) })),
})
const SLIDE = obj({
  layout: { type: 'string', enum: AI_LAYOUTS }, title: S, subtitle: NS,
  bullets: orNull(arr(S)),
  left: orNull(obj({ heading: S, bullets: arr(S) })), right: orNull(obj({ heading: S, bullets: arr(S) })),
  stats: orNull(arr(obj({ value: S, label: S }))),
  quote: orNull(obj({ text: S, by: NS })),
  table: orNull(obj({ head: arr(S), rows: arr(arr(S)) })),
  items: orNull(arr(obj({ label: S, detail: NS, when: NS }))),
  chart: orNull(obj({ kind: { type: 'string', enum: ['column', 'bar', 'line', 'pie'] }, unit: NS, series: NS, data: arr(obj({ label: S, value: { type: 'number' } })) })),
  matrix: orNull(obj({ x: S, y: S, quads: arr(obj({ title: S, points: arr(S) })) })),
  flow: orNull(obj({ nodes: arr(obj({ id: S, label: S, kind: { type: 'string', enum: ['start', 'step', 'decision', 'end'] } })), edges: arr(obj({ from: S, to: S, label: NS })) })),
  notes: NS,
})
const SLIDES_SCHEMA = obj({ slides: arr(SLIDE) })

// ---------------------------------------------------------------- reading long sources
/** Long sources become a dense fact sheet first, part by part, so each request fits Groq's free limit. */
async function factSheet(source: string, progress: Progress, onWait: (n: number) => void) {
  const { askAI } = await import('./voice')
  const parts: string[] = []
  let rest = source.trim()
  while (rest.length) { let cut = rest.length > 9000 ? rest.lastIndexOf('\n', 9000) : rest.length; if (cut < 4500) cut = Math.min(9000, rest.length); parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trim() }
  const use = parts.slice(0, 10)
  const words = Math.max(140, Math.floor(1900 / use.length))
  const out: string[] = []
  for (let i = 0; i < use.length; i++) {
    progress(`Reading part ${i + 1} of ${use.length}…`)
    out.push(await askAI(`You make a dense fact sheet from part of a document, for building a presentation. At most ${words} words. Bullet points only. Keep every key point, figure, date, name, step and decision exactly as written. Keep headings as "## Heading". No preamble.`, use[i], Math.min(1400, words * 3), onWait))
  }
  return out.join('\n\n')
}

// ---------------------------------------------------------------- 1 · the storyline
export async function makeOutline(source: string, o: AiOpts, progress: Progress): Promise<Outline> {
  const { askJSON } = await import('./voice')
  const onWait = (n: number) => progress(`Waiting ${n}s for Groq’s free per-minute limit…`)
  let material = source.trim()
  if (material.length > 11000) material = await factSheet(material, progress, onWait)
  const [lo, hi] = LENGTH[o.length]
  const today = new Date().toISOString().slice(0, 10)
  const system = `You are a presentation designer who plans clear, persuasive slide decks from source material, the way a top consultant would.
${PURPOSE[o.purpose]}${o.audience?.trim() ? `\nAudience: ${o.audience.trim()} — choose what to stress and the words to use for them.` : ''}
Plan ${lo} to ${hi} slides in total.
Rules:
- One idea per slide. Each slide title is an action title: a short sentence that states the slide's point (at most 12 words), e.g. "Output peaks in June, when demand is lowest" — not a topic label like "Output".
- The title slide's title names the deck; its subtitle says what it's about in one line.
- "points": the facts this slide will use, copied from the source with every figure, date and name exactly as written (2–6 points; for a title slide, none).
- Use the source only. Never invent facts, numbers, dates, names or quotes. If the source has no numbers, don't plan charts or stats.
- Vary the layouts; don't use "bullets" more than ${Math.ceil(hi / 3)} times.
${LAYOUT_GUIDE}
- Write in the main language of the source. Today is ${today}.${o.extra.trim() ? `\nThe author also asks: ${o.extra.trim()}` : ''}`
  progress('Planning the storyline…')
  const { data, model } = await askJSON<{ title: string; subtitle: string; slides: { layout: Layout; title: string; points: string[] }[] }>(system, `SOURCE:\n${material}`,
    { name: 'outline', schema: OUTLINE_SCHEMA, maxTokens: 4200, effort: 'medium', onWait, onModel: (m) => progress(`Busy — ${m.includes('qwen') ? 'Qwen 3.8' : 'GPT-OSS 20B'} is taking this step…`) })
  const items: OutlineItem[] = (data.slides ?? []).filter((x) => x && (x.title || x.points?.length || (x.layout && x.layout !== 'bullets'))).map((x) => ({ id: nanoid(8), layout: AI_LAYOUTS.includes(x.layout) ? x.layout : 'bullets', title: String(x.title ?? '').trim(), points: (x.points ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 8) }))
  if (!items.length) throw new Error('The AI didn’t plan any slides. Try again, or use “From headings”.')
  if (items[0].layout !== 'title') items.unshift({ id: nanoid(8), layout: 'title', title: String(data.title ?? '').trim() || 'Presentation', points: [] })
  return { title: String(data.title ?? '').trim() || items[0].title, subtitle: String(data.subtitle ?? '').trim(), items, material, source, model }
}

// ---------------------------------------------------------------- 2 · the slides
const SLIDE_RULES = (notes: boolean) => `Write each slide from its plan. Keep its layout unless the content truly doesn't fit (e.g. a chart without numbers → "bullets").
Fill only the fields the layout uses; set every other field to null.
- bullets: 3–5 bullets, each at most 12 words; **bold** one key term where it helps.
- two: left and right, each a heading (2–4 words) and 2–4 bullets.
- stat: stats = 1–3 items; value is the figure exactly as in the source (short: "42%", "3.2 MW", "$1.4M"); label at most 8 words.
- quote: the exact words from the source, and who said them (or null).
- table: head (2–4 columns) and up to 6 rows of short cells.
- agenda: items = the parts of the talk (label at most 5 words, detail null or at most 6 words).
- process: items = 3–6 steps in order; label at most 4 words; detail at most 10 words.
- flow: a flowchart of 4–8 nodes: one "start", "step"s, a "decision" for each yes/no choice (label it as a short question), and "end"(s). Edges connect node ids; label the branches out of a decision ("yes"/"no" or the condition). Ids are short words.
- cycle: items = 3–6 stages of the loop; label at most 3 words; detail null or at most 6 words; subtitle = what the loop is (at most 4 words).
- timeline: items = 3–7 in time order; "when" is the date or period exactly as in the source; label at most 5 words.
- chart: kind "column" for categories or periods, "bar" for rankings or long labels, "line" for a trend over 4+ periods, "pie" for parts of a whole; data only from source numbers (value is a plain number, no units); unit like "%" or "MWh"; series names what is measured.
- matrix: x and y name the two dimensions (low → high); quads in this order: top-left, top-right, bottom-left, bottom-right — each a title (2–3 words) and up to 3 short points; top-right is high on both.
- section: a title and a one-line subtitle.
- title: title and subtitle.
- closing: title (e.g. "What to remember") and 2–4 bullets: the takeaways and the next step or ask.
- subtitle on visual slides: one line saying what to notice (at most 14 words), or null.
${notes ? '- notes: 2–4 sentences the presenter can say aloud, in plain spoken language, adding context the slide leaves out.' : '- notes: null.'}
Never invent facts or numbers. Use the plan's points and the source only.`

export async function designSlides(outline: Outline, o: AiOpts, progress: Progress): Promise<Slide[]> {
  const { askJSON, estTokens, getVoiceSettings, poolFor, FREE_MODELS } = await import('./voice')
  const onWait = (n: number) => progress(`Waiting ${n}s for Groq’s free per-minute limit…`)
  const withSource = estTokens(outline.material) < 1700
  const items = outline.items
  // batches small enough that question + answer fit one request on the free plan
  const per = withSource ? 5 : 6
  const batches: { start: number; items: OutlineItem[] }[] = []
  for (let i = 0; i < items.length; i += per) batches.push({ start: i, items: items.slice(i, i + per) })
  // V6.2: each free model has its own per-minute allowance, so batches are designed side by side,
  // one per model (GPT-OSS 120B, Qwen 3.8, GPT-OSS 20B) — about three times faster than one by one
  const pool = poolFor(await getVoiceSettings(), true).slice(0, batches.length)
  const name = (id: string) => FREE_MODELS.find((m) => m.id === id)?.label ?? id
  progress(batches.length === 1 ? 'Designing the slides…' : pool.length > 1 ? `Designing ${items.length} slides with ${pool.length} free models at once…` : `Designing ${items.length} slides…`)
  let done = 0
  const design = async (b: { start: number; items: OutlineItem[] }, model: string) => {
    const plan = b.items.map((x, k) => `${b.start + k + 1}. [${x.layout}] ${x.title}${x.points.length ? '\n' + x.points.map((p) => `   - ${p}`).join('\n') : ''}`).join('\n')
    const user = `DECK: ${outline.title}${outline.subtitle ? ` — ${outline.subtitle}` : ''}\nPLAN FOR THESE ${b.items.length} SLIDES (write exactly ${b.items.length}, in this order):\n${plan}${withSource ? `\n\nSOURCE:\n${outline.material}` : ''}`
    const { data } = await askJSON<{ slides: RawSlide[] }>(`You are a presentation designer writing slide content.\n${SLIDE_RULES(o.notes)}`, user,
      { name: 'slides', schema: SLIDES_SCHEMA, maxTokens: 3600, effort: 'low', onWait, model, onModel: (m) => progress(`Busy — ${name(m)} is helping with these slides…`) })
    done += b.items.length
    if (batches.length > 1) progress(`Designed ${done} of ${items.length} slides…`)
    const got = (data.slides ?? []).map(normalise).filter((x): x is Slide => !!x)
    // keep the plan's order and titles if the model dropped or merged one
    return b.items.map((planned, k) => {
      const s = got[k] ?? { id: nanoid(8), layout: 'bullets' as Layout, title: planned.title, bullets: planned.points.slice(0, 5) }
      if (!s.title) s.title = planned.title
      return s
    })
  }
  // run up to one batch per model at a time, keeping the order of the slides
  const results: Slide[][] = new Array(batches.length)
  let next = 0
  await Promise.all(pool.map(async (model) => { while (next < batches.length) { const k = next++; results[k] = await design(batches[k], model) } }))
  const out = results.flat()
  if (out[0]?.layout !== 'title') out.unshift({ id: nanoid(8), layout: 'title', title: outline.title, subtitle: outline.subtitle || undefined })
  else if (!out[0].subtitle && outline.subtitle) out[0].subtitle = outline.subtitle
  return checkNumbers(out, figuresOf(outline.source))
}

// ---------------------------------------------------------------- turning answers into valid slides
type RawSlide = Partial<Record<keyof Slide, unknown>> & { layout?: unknown }
const strs = (x: unknown, max = 10) => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, max) : [])
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim())
const ALL: Layout[] = [...AI_LAYOUTS, 'image']

/** Whatever the model returned → a valid slide (anything malformed is repaired, or falls back to bullets). */
export function normalise(r: RawSlide | null | undefined): Slide | null {
  if (!r || typeof r !== 'object') return null
  let layout = (ALL.includes(r.layout as Layout) ? r.layout : 'bullets') as Layout
  const s: Slide = { id: nanoid(8), layout, title: str(r.title), subtitle: str(r.subtitle) || undefined, notes: str(r.notes) || undefined }
  const bullets = strs(r.bullets, 8)
  if (bullets.length) s.bullets = bullets
  const col = (c: unknown): Column | undefined => (c && typeof c === 'object' ? { heading: str((c as Column).heading) || undefined, bullets: strs((c as Column).bullets, 6) } : undefined)
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]).filter((x) => x && typeof x === 'object').map((x) => ({ label: str(x.label), detail: str(x.detail) || undefined, when: str(x.when) || undefined })).filter((x) => x.label || x.when).slice(0, 8) : []
  const fallback = () => { layout = s.layout = 'bullets'; if (!s.bullets?.length && items.length) s.bullets = items.map((x) => [x.when, x.label, x.detail].filter(Boolean).join(' — ')) }
  switch (layout) {
    case 'two': s.left = col(r.left); s.right = col(r.right); if (!s.left?.bullets.length && !s.right?.bullets.length) fallback(); break
    case 'stat': s.stats = (Array.isArray(r.stats) ? r.stats as { value?: unknown; label?: unknown }[] : []).map((x) => ({ value: str(x?.value), label: str(x?.label) })).filter((x) => x.value).slice(0, 3); if (!s.stats.length) fallback(); break
    case 'quote': { const q = r.quote as { text?: unknown; by?: unknown } | null; s.quote = { text: str(q?.text), by: str(q?.by) || undefined }; if (!s.quote.text) fallback(); break }
    case 'table': { const t = r.table as { head?: unknown; rows?: unknown } | null; const head = strs(t?.head, 5); s.table = { head, rows: (Array.isArray(t?.rows) ? t!.rows as unknown[] : []).map((row) => strs(row, 5)).filter((x) => x.length).slice(0, 10) }; if (!head.length) fallback(); break }
    case 'agenda': case 'process': case 'cycle': case 'timeline':
      if (items.length < 2) fallback(); else s.items = items.slice(0, layout === 'agenda' ? 8 : layout === 'timeline' ? 7 : 6)
      break
    case 'chart': {
      const c = r.chart as { kind?: unknown; unit?: unknown; series?: unknown; data?: unknown } | null
      const data = (Array.isArray(c?.data) ? c!.data as { label?: unknown; value?: unknown }[] : []).map((d) => ({ label: str(d?.label), value: typeof d?.value === 'number' ? d.value : parseFloat(String(d?.value ?? '').replace(/[^\d.-]/g, '')) })).filter((d) => d.label && Number.isFinite(d.value)).slice(0, 10)
      const kind = (['column', 'bar', 'line', 'pie'] as const).find((k) => k === c?.kind) ?? 'column'
      if (data.length < 2) fallback(); else s.chart = { kind, unit: str(c?.unit) || undefined, series: str(c?.series) || undefined, data }
      break
    }
    case 'matrix': {
      const m = r.matrix as { x?: unknown; y?: unknown; quads?: unknown } | null
      const quads = (Array.isArray(m?.quads) ? m!.quads as { title?: unknown; points?: unknown }[] : []).slice(0, 4).map((q) => ({ title: str(q?.title), points: strs(q?.points, 3) }))
      if (quads.filter((q) => q.title).length < 3) fallback(); else { while (quads.length < 4) quads.push({ title: '', points: [] }); s.matrix = { x: str(m?.x), y: str(m?.y), quads } }
      break
    }
    case 'flow': {
      const f = r.flow as { nodes?: unknown; edges?: unknown } | null
      const nodes = (Array.isArray(f?.nodes) ? f!.nodes as Record<string, unknown>[] : []).map((n) => ({ id: str(n?.id), label: str(n?.label), kind: (['start', 'step', 'decision', 'end'] as const).find((k) => k === n?.kind) ?? 'step' })).filter((n) => n.id && n.label).slice(0, 10)
      const ids = new Set(nodes.map((n) => n.id))
      const edges = (Array.isArray(f?.edges) ? f!.edges as Record<string, unknown>[] : []).map((e) => ({ from: str(e?.from), to: str(e?.to), label: str(e?.label) || undefined })).filter((e) => ids.has(e.from) && ids.has(e.to))
      if (nodes.length < 3 || !edges.length) fallback(); else s.flow = { nodes, edges } as Flow
      break
    }
  }
  if (s.layout === 'bullets' && !s.bullets?.length && !s.title) return null
  return s
}

// ---------------------------------------------------------------- the number check
const NUM = /(?<![\w.])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?%)?/g
const norm = (x: string) => x.replace(/[,\s+]/g, '').replace(/(\.\d*?)0+(%?)$/, '$1$2').replace(/\.(%?)$/, '$1')
/**
 * Every figure in the source, in a few spellings. Only these are kept with the deck (not the source
 * itself — a PDF's text is never stored), so slides can be re-checked as you edit them.
 */
export function figuresOf(source: string) {
  const set = new Set<string>()
  for (const m of source.matchAll(NUM)) { const n = norm(m[0]); set.add(n); set.add(n.replace('%', '')) }
  return [...set]
}
const slideText = (s: Slide) => [s.title, s.subtitle, ...(s.bullets ?? []), ...(s.left?.bullets ?? []), ...(s.right?.bullets ?? []), s.left?.heading, s.right?.heading,
  ...(s.stats ?? []).flatMap((x) => [x.value, x.label]), s.quote?.text, ...(s.table ? [...s.table.head, ...s.table.rows.flat()] : []),
  ...(s.items ?? []).flatMap((x) => [x.label, x.detail, x.when]), ...(s.chart?.data ?? []).flatMap((d) => [d.label, String(d.value)]),
  ...(s.matrix?.quads ?? []).flatMap((q) => [q.title, ...q.points]), ...(s.flow?.nodes ?? []).map((n) => n.label)].filter(Boolean).join('\n')

/**
 * Marks figures that don't appear anywhere in the source. Small counting numbers (1–12) are left
 * alone; years, amounts, percentages and measurements are checked. Runs on this device — no AI.
 */
export function checkNumbers(slides: Slide[], figures: string[]): Slide[] {
  const have = new Set(figures)
  return slides.map((s) => {
    if (s.layout === 'title' || s.layout === 'image') return { ...s, check: undefined }
    const miss = new Set<string>()
    for (const m of slideText(s).matchAll(NUM)) {
      const raw = m[0].trim(), n = norm(raw)
      const plain = n.replace('%', '')
      if (!n.includes('%') && !n.includes('.') && Number(plain) <= 12) continue
      if (have.has(n) || (!n.includes('%') && have.has(plain))) continue
      miss.add(raw)
    }
    return { ...s, check: miss.size ? [...miss] : undefined }
  })
}

// ---------------------------------------------------------------- one slide at a time
/** Rewrite one slide (shorter, punchier…), or turn it into the most fitting visual layout. */
export async function rewriteSlide(s: Slide, how: string, figures?: string[]): Promise<Slide> {
  const { askJSON } = await import('./voice')
  const { id: _id, image: _img, check: _c, ...rest } = s; void _id; void _img; void _c
  const { data } = await askJSON<{ slides: RawSlide[] }>(`You are a presentation designer editing one slide. ${how}
Keep the facts and figures exactly; never invent anything. Return exactly one slide.
${SLIDE_RULES(!!s.notes)}`, `SLIDE:\n${JSON.stringify(rest)}`, { name: 'slides', schema: SLIDES_SCHEMA, maxTokens: 1800, effort: 'low' })
  const out = normalise(data.slides?.[0])
  if (!out) return s
  const fixed = { ...out, id: s.id, image: s.image, notes: out.notes ?? s.notes }
  return figures ? checkNumbers([fixed], figures)[0] : fixed
}
export const MAKE_VISUAL = 'Show the same content as the most fitting visual layout — process, flow, cycle, timeline, chart, matrix, stat or two — instead of a list. Pick "chart" only if there are 3+ numbers of the same kind.'

// ---------------------------------------------------------------- scanned PDFs (pictures of pages)
async function pageImage(doc: import('pdfjs-dist').PDFDocumentProxy, n: number) {
  const page = await doc.getPage(n)
  const v0 = page.getViewport({ scale: 1 })
  const v = page.getViewport({ scale: Math.min(1400 / v0.width, 1800 / v0.height) })
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height)
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, viewport: v, canvas: c } as never).promise
  return c.toDataURL('image/jpeg', 0.82)
}
/**
 * A PDF that is only pictures (a scan) has no text to read. Qwen 3.8 — the free model that can see —
 * reads the pages instead, two at a time (about 2,000 tokens each of the free per-minute allowance).
 */
export async function readScanned(doc: import('pdfjs-dist').PDFDocumentProxy, progress: Progress, maxPages = 10): Promise<string> {
  const { askVision } = await import('./voice')
  const onWait = (n: number) => progress(`Waiting ${n}s for Groq’s free per-minute limit…`)
  const n = Math.min(doc.numPages, maxPages)
  const out: string[] = []
  for (let i = 1; i <= n; i += 2) {
    const last = Math.min(i + 1, n)
    progress(`Reading scanned page${last > i ? `s ${i}–${last}` : ` ${i}`} of ${n} with Qwen 3.8…`)
    const imgs: string[] = []
    for (let k = i; k <= last; k++) imgs.push(await pageImage(doc, k))
    out.push(await askVision('Transcribe all the text on these document pages, in reading order, as Markdown. Use ## for headings and keep tables as Markdown tables. Copy every number, date and name exactly. Describe a chart only by its title and the values printed on it. No commentary.', imgs, 1800, onWait))
  }
  return out.join('\n\n')
}
