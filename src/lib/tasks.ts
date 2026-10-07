// Tasks are ordinary checklist items inside notes — the note stays the single source of truth.
// Extra details live as small, readable markers in the item's own text (portable to Markdown,
// Obsidian Tasks style):   📅 2026-10-10  (due date)   ⭐ (starred)   🔄 (in progress)   @Ahmed or "Ahmed — …" (owner)
// Voice-memo minutes also write "(due: Friday)", which is understood relative to the meeting date.

import type { Note } from '../types'
import { todayKey } from './templates'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Block = any

export interface Task {
  noteId: string
  /** n-th checklist item in the note (document order) */
  index: number
  raw: string
  /** text without markers, for display */
  text: string
  checked: boolean
  /** YYYY-MM-DD or null */
  due: string | null
  /** due came from the day of a daily note, not an explicit date */
  dueFromDaily: boolean
  owner: string | null
  starred: boolean
  /** in progress (🔄) — the Doing column on the board */
  doing: boolean
  note: Note
}

// ---------------------------------------------------------------- dates
const DAY = 86400000
export const keyOf = (d: Date) => todayKey(d)
export const dateOf = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Understands everyday phrases: today, tonight, tomorrow, mon…sun / next friday, this weekend,
 * next week, next month, in 3 days / in 2 weeks, 10 oct / oct 10 / 10 october, 2026-10-10.
 * Returns the date and the exact words matched (so quick-add can strip them).
 */
export function parseDate(input: string, base = new Date()): { date: Date; match: string } | null {
  const s = input.toLowerCase()
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const tests: [RegExp, (m: RegExpMatchArray) => Date | null][] = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => new Date(+m[1], +m[2] - 1, +m[3])],
    [/\b(today|tonight|eod)\b/, () => b],
    [/\b(tomorrow|tmrw?|tmr)\b/, () => addDays(b, 1)],
    [/\bday after tomorrow\b/, () => addDays(b, 2)],
    [/\b(this )?weekend\b/, () => addDays(b, (6 - b.getDay() + 7) % 7)],
    [/\bnext week\b/, () => addDays(b, ((8 - b.getDay()) % 7) || 7)],
    [/\bnext month\b/, () => new Date(b.getFullYear(), b.getMonth() + 1, 1)],
    [/\bin (\d{1,2}) (day|days|week|weeks)\b/, (m) => addDays(b, +m[1] * (m[2].startsWith('week') ? 7 : 1))],
    [/\b(next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|rsday|urday|sday)?\b/, (m) => {
      const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[2].slice(0, 3)))
      let diff = (idx - b.getDay() + 7) % 7
      if (diff === 0) diff = 7
      if (m[1] && diff < 7 - b.getDay()) diff += 7 // "next friday" when this week's friday is still ahead
      return addDays(b, diff)
    }],
    [/\b(\d{1,2})(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/, (m) => fromDayMonth(+m[1], m[3], b)],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(st|nd|rd|th)?\b/, (m) => fromDayMonth(+m[2], m[1], b)],
  ]
  for (const [re, fn] of tests) {
    const m = s.match(re)
    if (m) { const d = fn(m); if (d && !isNaN(+d)) return { date: d, match: input.slice(m.index!, m.index! + m[0].length) } }
  }
  return null
}
function fromDayMonth(day: number, mon: string, b: Date) {
  const mi = MONTHS.indexOf(mon.slice(0, 3)); if (mi < 0 || day < 1 || day > 31) return null
  let d = new Date(b.getFullYear(), mi, day)
  if (+d < +b - 60 * DAY) d = new Date(b.getFullYear() + 1, mi, day) // "10 jan" in December means next year
  return d
}

/** "Fri 10 Oct", "Today", "Tomorrow", "Yesterday", "Mon" (this week). */
export function friendlyDue(k: string, now = new Date()) {
  const d = dateOf(k); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((+d - +t) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) })
}
export const dueState = (k: string | null, now = new Date()): 'overdue' | 'today' | 'soon' | 'later' | 'none' => {
  if (!k) return 'none'
  const tk = keyOf(now)
  if (k < tk) return 'overdue'
  if (k === tk) return 'today'
  return +dateOf(k) - +now < 7 * DAY ? 'soon' : 'later'
}

// ---------------------------------------------------------------- markers
const RE_DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/
const RE_DUE_WORDS = /\s*\((?:due|by)[:\s]+([^)]+)\)/i
const RE_STAR = /\s*⭐️?/g
const RE_DOING = /\s*🔄\uFE0F?/g
const RE_OWNER_DASH = /^\s*([A-Z][\p{L}.'-]*(?: [A-Z][\p{L}.'-]*){0,2})\s+[—–-]\s+/u
const RE_OWNER_AT = /(^|\s)@([\p{L}][\p{L}0-9_.-]{0,30})/u

export function parseTask(raw: string, base: Date) {
  let text = raw
  let due: string | null = null
  const m1 = text.match(RE_DUE)
  if (m1) { due = m1[1]; text = text.replace(RE_DUE, '') }
  const m2 = text.match(RE_DUE_WORDS)
  if (m2) { const p = parseDate(m2[1], base); if (p) { due ??= keyOf(p.date) } text = text.replace(RE_DUE_WORDS, '') }
  const starred = /⭐/.test(text); text = text.replace(RE_STAR, '')
  const doing = /🔄/.test(text); text = text.replace(RE_DOING, '')
  let owner: string | null = null
  const o1 = text.match(RE_OWNER_DASH)
  if (o1 && o1[1].toLowerCase() !== 'unassigned') owner = o1[1]
  if (o1) text = text.replace(RE_OWNER_DASH, '')
  const o2 = text.match(RE_OWNER_AT)
  if (o2) { owner ??= o2[2]; text = text.replace(RE_OWNER_AT, '$1').trim() }
  return { text: text.replace(/\s{2,}/g, ' ').trim(), due, starred, owner, doing }
}

/** Every task in the library, with its details worked out. Locked and trashed notes are skipped. */
export function collectTasks(notes: Note[]): Task[] {
  const out: Task[] = []
  for (const n of notes) {
    if (n.trashedAt !== null || n.locked || !n.checklist.length) continue
    const base = n.daily ? dateOf(n.daily) : new Date(n.createdAt)
    n.checklist.forEach((c, i) => {
      if (!c.text.trim()) return
      const p = parseTask(c.text, base)
      const dueFromDaily = !p.due && !!n.daily
      out.push({ noteId: n.id, index: i, raw: c.text, text: p.text || c.text, checked: c.checked, due: p.due ?? (n.daily || null), dueFromDaily, owner: p.owner, starred: p.starred, doing: p.doing, note: n })
    })
  }
  return out
}

// ---------------------------------------------------------------- editing a task inside its note
const asInline = (content: Block): Block[] => (typeof content === 'string' ? [{ type: 'text', text: content, styles: {} }] : Array.isArray(content) ? content : [])

/** Apply `fn` to the n-th checklist block (document order). */
export function mapTask(blocks: Block[], n: number, fn: (b: Block) => Block | null): Block[] {
  let i = 0
  const walk = (bs: Block[]): Block[] => {
    const out: Block[] = []
    for (const b of bs) {
      let nb: Block | null = b
      if (b.type === 'checkListItem') { if (i === n) nb = fn(b); i++ }
      if (nb && nb.children?.length) nb = { ...nb, children: walk(nb.children) }
      if (nb) out.push(nb)
    }
    return out
  }
  return walk(blocks ?? [])
}

/** Remove markers from the text runs of a block's content, keeping bold/italic etc. */
function stripMarkers(content: Block[], what: { due?: boolean; star?: boolean; doing?: boolean }) {
  return content.map((c) => (c.type === 'text' ? { ...c, text: c.text.replace(what.due ? RE_DUE : /$^/, '').replace(what.due ? RE_DUE_WORDS : /$^/, '').replace(what.star ? RE_STAR : /$^/, '').replace(what.doing ? RE_DOING : /$^/, '') } : c))
    .filter((c) => c.type !== 'text' || c.text !== '')
}
const trimEnd = (content: Block[]) => { const c = [...content]; const last = c[c.length - 1]; if (last?.type === 'text') c[c.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') }; return c }

export function setDue(blocks: Block[], n: number, due: string | null) {
  return mapTask(blocks, n, (b) => {
    const content = trimEnd(stripMarkers(asInline(b.content), { due: true }))
    return { ...b, content: due ? [...content, { type: 'text', text: ` 📅 ${due}`, styles: {} }] : content }
  })
}
export function setStar(blocks: Block[], n: number, on: boolean) {
  return mapTask(blocks, n, (b) => {
    const content = trimEnd(stripMarkers(asInline(b.content), { star: true }))
    return { ...b, content: on ? [{ type: 'text', text: '⭐ ', styles: {} }, ...content] : content }
  })
}
/** Mark a task in progress (🔄 at the start) or not. */
export function setDoing(blocks: Block[], n: number, on: boolean) {
  return mapTask(blocks, n, (b) => {
    const content = stripMarkers(asInline(b.content), { doing: true })
    const first = content[0]
    const lead = first?.type === 'text' ? [{ ...first, text: first.text.replace(/^\s+/, '') }, ...content.slice(1)] : content
    return { ...b, content: on ? [{ type: 'text', text: '🔄 ', styles: {} }, ...lead] : lead }
  })
}
export function setChecked(blocks: Block[], n: number, checked: boolean) {
  return mapTask(blocks, n, (b) => ({ ...b, props: { ...b.props, checked } }))
}
/** Replace the words of a task, keeping its markers (date, star). */
export function setText(blocks: Block[], n: number, text: string, keep: { due: string | null; starred: boolean; explicitDue: boolean; owner: string | null; doing?: boolean }) {
  const owner = keep.owner?.trim()
  return mapTask(blocks, n, (b) => ({
    ...b,
    content: [
      ...(keep.doing ? [{ type: 'text', text: '🔄 ', styles: {} }] : []),
      ...(keep.starred ? [{ type: 'text', text: '⭐ ', styles: {} }] : []),
      ...(owner ? [{ type: 'text', text: owner, styles: { bold: true } }, { type: 'text', text: ' — ', styles: {} }] : []),
      { type: 'text', text: text.trim(), styles: {} },
      ...(keep.due && keep.explicitDue ? [{ type: 'text', text: ` 📅 ${keep.due}`, styles: {} }] : []),
    ],
  }))
}
export const removeTask = (blocks: Block[], n: number) => mapTask(blocks, n, () => null)

/** Quick add: "call the client fri @Ahmed ⭐" → clean text + date + owner + star. */
export function parseQuickAdd(input: string, now = new Date()) {
  let text = input
  const d = parseDate(text, now)
  if (d) text = text.replace(d.match, ' ')
  const starred = /⭐|!!/.test(text); text = text.replace(/⭐️?|!!/g, ' ')
  const at = text.match(RE_OWNER_AT)
  text = text.replace(/\s{2,}/g, ' ').trim()
  return { text, due: d ? keyOf(d.date) : null, owner: at ? at[2] : null, starred }
}
/** The text stored in the note for a quick-added task. */
export const quickAddText = (q: ReturnType<typeof parseQuickAdd>) => `${q.starred ? '⭐ ' : ''}${q.text}${q.due ? ` 📅 ${q.due}` : ''}`

/** Stable id for a task within this session's list (note + position). */
export const taskKey = (t: Pick<Task, 'noteId' | 'index'>) => `${t.noteId}:${t.index}`
