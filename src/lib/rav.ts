// V6.2 RAV — Reason · Attack · Validate. Puts an idea, plan or decision through three passes:
// Reason (the claim, what it rests on, how it follows), Attack (the strongest objections) and
// Validate (which assumptions the note actually backs up — with exact quotes that Folio56 checks
// on this device — and the cheapest real test for each one that isn't). The result is a page under
// the note; the tests become dated tasks. The note itself is never changed.
import type { Note } from '../types'
import { todayKey } from './templates'

export type Status = 'supported' | 'unsupported' | 'contradicted'
export type Severity = 'high' | 'medium' | 'low'
export type Mark = 'valid' | 'answered' | 'irrelevant'
export interface RavResult {
  claim: string; summary: string; logic: string[]
  assumptions: { id: string; text: string; status: Status; quote: string | null; why: string; quoteMissing?: boolean }[]
  attacks: { id: string; point: string; severity: Severity; why: string }[]
  tests: { assumption: string; test: string; pass: string; kill: string; days: number }[]
  verdict: 'promising' | 'needs work' | 'weak'; next: string
}
/** Kept on the RAV page, so the objections can be marked and (later) reviewed over time. */
export interface RavMeta { of: string; at: number; model: string; verdict: RavResult['verdict']; attacks: RavResult['attacks']; marks: Record<string, Mark>; truncated?: boolean }

// ---------------------------------------------------------------- schema + prompt
const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const arr = (items: object) => ({ type: 'array', items })
const obj = (props: Record<string, object>) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false })
const SCHEMA = obj({
  claim: S, summary: S, logic: arr(S),
  assumptions: arr(obj({ id: S, text: S, status: { type: 'string', enum: ['supported', 'unsupported', 'contradicted'] }, quote: NS, why: S })),
  attacks: arr(obj({ id: S, point: S, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, why: S })),
  tests: arr(obj({ assumption: S, test: S, pass: S, kill: S, days: { type: 'number' } })),
  verdict: { type: 'string', enum: ['promising', 'needs work', 'weak'] }, next: S,
})

const SYSTEM = `You are a rigorous, fair critical thinker. Run RAV — Reason, Attack, Validate — on the idea, plan or decision in the NOTE. Work only from the note.

REASON
- claim: the central idea in one sentence.
- summary: two sentences — what is being proposed and why the author believes it.
- assumptions: 3–6 things that must be true for the claim to hold; each one short, testable statement; ids A1, A2…
- logic: 2–5 short steps showing how the assumptions lead to the claim.

ATTACK
- attacks: the 3–5 strongest objections a smart, informed sceptic would raise, most damaging first: how it could fail, missing evidence, hidden costs or effort, other explanations, how often ideas like this usually work, side effects. Specific to this note — no generic advice. ids X1, X2…; severity high / medium / low; why: one sentence.

VALIDATE
- For each assumption, status:
  "supported" only if the note itself gives evidence for it — put the exact words from the note in "quote" (copied character for character, at most 25 words);
  "contradicted" if the note says something against it — quote those exact words;
  otherwise "unsupported" with quote null. why: one sentence.
- tests: for each unsupported or contradicted assumption (at most 5), the cheapest real-world test: "test" = what to do (concrete, doable within 14 days), "pass" = the measurable result that supports it, "kill" = the result that means drop or rethink it, "days" = 1–14. "assumption" = its id.
- verdict: "promising" (the key assumptions hold and the objections can be answered), "needs work", or "weak". next: the single most useful next step.

Be direct and honest. Don't flatter and don't invent facts, numbers or quotes. Write in the main language of the note; if it mixes Urdu or Hindi with English, write in English.`

// ---------------------------------------------------------------- the quote check
const norm = (s: string) => s.toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** "Supported" and "contradicted" must quote the note word for word; anything else is marked unsupported. */
export function checkQuotes(r: RavResult, source: string): RavResult {
  const hay = norm(source)
  return {
    ...r,
    assumptions: r.assumptions.map((a) => {
      if (a.status === 'unsupported') return { ...a, quote: null }
      const q = norm(a.quote ?? '')
      if (q.length >= 8 && hay.includes(q)) return a
      return { ...a, status: 'unsupported' as Status, quote: null, quoteMissing: true, why: `${a.why} (The quoted words aren’t in your note, so this isn’t counted as backed up.)` }
    }),
  }
}

// ---------------------------------------------------------------- the source: a note and its pages
const MAX_CHARS = 10000
export async function ravSource(noteId: string, withPages: boolean) {
  const { db } = await import('./db')
  const { blocksToMd } = await import('./markdown')
  const all = await db.notes.toArray()
  const root = all.find((n) => n.id === noteId)
  if (!root) throw new Error('Note not found')
  if (root.locked) throw new Error('Unlock this note first.')
  const list: Note[] = [root]
  // a project's pages are its library: RAV reads those and nothing else (earlier RAV pages are skipped)
  if (withPages) { const walk = (id: string) => { for (const k of all.filter((n) => n.parentId === id && n.trashedAt === null && !n.locked && !n.rav && !n.deck).sort((a, b) => a.position - b.position)) { list.push(k); walk(k.id) } }; walk(noteId) }
  let text = list.map((n, i) => `${i ? `# ${n.title || 'Untitled'}\n\n` : n.title ? `# ${n.title}\n\n` : ''}${blocksToMd(n.content ?? [])}`).join('\n\n').trim()
  const truncated = text.length > MAX_CHARS
  if (truncated) { const cut = text.lastIndexOf('\n', MAX_CHARS); text = text.slice(0, cut > MAX_CHARS * 0.7 ? cut : MAX_CHARS) }
  return { title: root.title || 'Untitled', text, truncated, pages: list.length - 1 }
}

// ---------------------------------------------------------------- run it
export async function runRav(noteId: string, opts: { withPages: boolean }, progress: (s: string) => void): Promise<string> {
  const { askJSON } = await import('./voice')
  const src = await ravSource(noteId, opts.withPages)
  if (src.text.replace(/\s/g, '').length < 60) throw new Error('There’s very little here to test. Write the idea out a bit more first.')
  progress('Reasoning, attacking and validating…')
  const { data, model } = await askJSON<RavResult>(SYSTEM, `NOTE:\n${src.text}`, {
    name: 'rav', schema: SCHEMA, maxTokens: 3400, effort: 'medium',
    onWait: (n) => progress(`Waiting ${n}s for Groq’s free per-minute limit…`),
    onModel: (m) => progress(`Busy — ${m.includes('qwen') ? 'Qwen 3.8' : 'GPT-OSS 20B'} is taking this one…`),
  })
  const r = checkQuotes(clean(data), src.text)
  progress('Writing the page…')
  const { createNote, db } = await import('./db')
  const { isPage } = await import('./kinds')
  const meta: RavMeta = { of: noteId, at: Date.now(), model, verdict: r.verdict, attacks: r.attacks, marks: {}, truncated: src.truncated }
  // V6.2: a page gets its review as a page inside it; a quick note gets it as a note beside it
  // (in the same notebook), so the note doesn't turn into a page behind your back.
  const source = await db.notes.get(noteId)
  const hasKids = (await db.notes.where('parentId').equals(noteId).filter((k) => k.trashedAt === null).count()) > 0
  const inside = !source || isPage(source, hasKids)
  const n = await createNote({ title: `RAV — ${src.title}`, parentId: inside ? noteId : null, labels: inside ? [] : source.labels.slice(0, 1), icon: '🧭', content: ravBlocks(r, meta) as never, rav: meta })
  return n.id
}

/** Tidy whatever came back: ids, limits, sane test lengths. */
function clean(r: RavResult): RavResult {
  const s = (x: unknown) => String(x ?? '').trim()
  const assumptions = (r.assumptions ?? []).slice(0, 6).map((a, i) => ({ id: s(a.id) || `A${i + 1}`, text: s(a.text), status: (['supported', 'unsupported', 'contradicted'] as const).find((x) => x === a.status) ?? 'unsupported', quote: a.quote ? s(a.quote) : null, why: s(a.why) })).filter((a) => a.text)
  return {
    claim: s(r.claim), summary: s(r.summary), logic: (r.logic ?? []).map(s).filter(Boolean).slice(0, 5), assumptions,
    attacks: (r.attacks ?? []).slice(0, 5).map((a, i) => ({ id: s(a.id) || `X${i + 1}`, point: s(a.point), severity: (['high', 'medium', 'low'] as const).find((x) => x === a.severity) ?? 'medium', why: s(a.why) })).filter((a) => a.point),
    tests: (r.tests ?? []).slice(0, 5).map((t) => ({ assumption: s(t.assumption), test: s(t.test), pass: s(t.pass), kill: s(t.kill), days: Math.max(1, Math.min(14, Math.round(Number(t.days) || 7))) })).filter((t) => t.test),
    verdict: (['promising', 'needs work', 'weak'] as const).find((x) => x === r.verdict) ?? 'needs work', next: s(r.next),
  }
}

// ---------------------------------------------------------------- the page
const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: 'text', text, styles })
const VERDICT: Record<RavResult['verdict'], string> = { promising: 'Promising', 'needs work': 'Needs work', weak: 'Weak' }
const STATUS: Record<Status, string> = { supported: '✓ Backed by your note', unsupported: '? Not shown yet', contradicted: '✗ Your note says otherwise' }
const SEV: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' }
const addDays = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return todayKey(x) }

export function ravBlocks(r: RavResult, m: RavMeta) {
  const out: unknown[] = []
  const when = new Date(m.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  out.push({ type: 'paragraph', content: [t(`Reason · Attack · Validate — ${when}. The objections and tests are the AI’s suggestions, not verdicts: mark each objection above, and run the tests to find out.${m.truncated ? ' Only the first part of a long note was read.' : ''}`, { italic: true })] })
  out.push({ type: 'heading', props: { level: 2 }, content: [t(`Verdict: ${VERDICT[r.verdict]}`)] })
  if (r.summary) out.push({ type: 'paragraph', content: [t(r.summary)] })
  if (r.next) out.push({ type: 'paragraph', content: [t('Next step: ', { bold: true }), t(r.next)] })
  out.push({ type: 'heading', props: { level: 2 }, content: [t('Reason')] })
  out.push({ type: 'paragraph', content: [t('Claim: ', { bold: true }), t(r.claim)] })
  for (const step of r.logic) out.push({ type: 'numberedListItem', content: [t(step)] })
  out.push({ type: 'heading', props: { level: 3 }, content: [t('What it rests on')] })
  for (const a of r.assumptions) {
    out.push({ type: 'bulletListItem', content: [t(`${a.id} `, { bold: true }), t(a.text), t(` — ${STATUS[a.status]}. `, { bold: true }), t(a.why)],
      children: a.quote ? [{ type: 'quote', content: [t(a.quote)] }] : [] })
  }
  out.push({ type: 'heading', props: { level: 2 }, content: [t('Attack')] })
  for (const a of r.attacks) out.push({ type: 'bulletListItem', content: [t(`${a.id} · ${SEV[a.severity]} — `, { bold: true }), t(a.point), t(a.why ? `. ${a.why}` : '')] })
  out.push({ type: 'heading', props: { level: 2 }, content: [t('Validate')] })
  if (!r.tests.length) out.push({ type: 'paragraph', content: [t('Every assumption is backed by the note — no tests needed right now.')] })
  for (const x of r.tests) {
    out.push({ type: 'checkListItem', props: { checked: false }, content: [t(`Test ${x.assumption}: `, { bold: true }), t(`${x.test} · Pass if ${x.pass.replace(/^pass(?: if)?:?\s*/i, '')} · Kill if ${x.kill.replace(/^kill(?: if)?:?\s*/i, '')} 📅 ${addDays(x.days)}`)] })
  }
  return out
}
