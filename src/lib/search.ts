// V5.9 search: ranked, typo-tolerant, prefix-matching search over every note's full text — plus
// voice transcripts and the highlights you made in Margins. Runs on the device; the index is built
// once and then only changed notes are re-indexed.
import MiniSearch from 'minisearch'
import type { Note } from '../types'
import { plainText } from './preview'
import { recentRecords } from './margins'

interface Doc { id: string; title: string; body: string; extra: string }

let ms: MiniSearch<Doc> | null = null
const seen = new Map<string, number>() // id → updatedAt (or rev) when indexed
let highlights = new Map<string, string>() // noteId → highlight text from Margins
let hlAt = 0

const make = () => new MiniSearch<Doc>({
  fields: ['title', 'body', 'extra'],
  storeFields: [],
  searchOptions: { boost: { title: 3, extra: 0.6 }, prefix: true, fuzzy: (term) => (term.length >= 8 ? 0.34 : term.length > 4 ? 0.2 : term.length > 3 ? 1 : 0), maxFuzzy: 3, combineWith: 'AND' },
})

const docOf = (n: Note): Doc => ({
  id: n.id,
  title: n.title || '',
  body: n.locked ? '' : `${plainText(n.content ?? [])}\n${n.checklist.map((c) => c.text).join('\n')}`,
  extra: `${n.memo?.transcript && !n.locked ? n.memo.transcript : ''}\n${highlights.get(n.id) ?? ''}`,
})

async function refreshHighlights() {
  if (Date.now() - hlAt < 15000) return false
  hlAt = Date.now()
  const next = new Map<string, string>()
  for (const r of await recentRecords().catch(() => [])) if (r.noteId && r.highlights.length) next.set(r.noteId, r.highlights.map((h) => h.text).join('\n'))
  const changed = next.size !== highlights.size || [...next].some(([k, v]) => highlights.get(k) !== v)
  highlights = next
  return changed
}

/** Bring the index up to date with the library (only notes that changed are re-indexed). */
export async function syncIndex(notes: Note[]) {
  const hlChanged = await refreshHighlights()
  if (!ms) { ms = make(); seen.clear() }
  const live = new Set<string>()
  for (const n of notes) {
    if (n.trashedAt !== null) continue
    live.add(n.id)
    const v = n.rev ?? n.updatedAt
    if (seen.get(n.id) === v && !(hlChanged && highlights.has(n.id))) continue
    if (seen.has(n.id)) ms.replace(docOf(n)); else ms.add(docOf(n))
    seen.set(n.id, v)
  }
  for (const id of [...seen.keys()]) if (!live.has(id)) { ms.discard(id); seen.delete(id) }
}

export interface Hit { id: string; score: number; terms: string[] }
export function searchNotes(q: string, limit = 30): Hit[] {
  if (!ms || !q.trim()) return []
  let r = ms.search(q)
  if (!r.length) r = ms.search(q, { combineWith: 'OR' }) // nothing has every word: show the best partial matches
  return r.slice(0, limit).map((x) => ({ id: String(x.id), score: x.score, terms: x.terms }))
}

/** A short piece of the note around the first matched word. */
export function snippetFor(n: Note, terms: string[], fallback: string) {
  if (n.locked) return 'Locked'
  const hay = `${plainText(n.content ?? [])}\n${n.memo?.transcript ?? ''}\n${highlights.get(n.id) ?? ''}`.replace(/\s+/g, ' ')
  const low = hay.toLowerCase()
  for (const t of terms) {
    const i = low.indexOf(t.toLowerCase())
    if (i >= 0) return (i > 40 ? '…' : '') + hay.slice(Math.max(0, i - 40), i + 100)
  }
  return fallback
}
