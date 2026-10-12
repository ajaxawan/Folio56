// V6.4 unlinked mentions: other notes that name this one without linking to it, and turning a
// mention into a link with one tap. Pure functions over BlockNote blocks.
/* eslint-disable @typescript-eslint/no-explicit-any */

const SKIP = new Set(['codeBlock', 'table', 'image', 'audio', 'video', 'file'])
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A title worth looking for: long enough, and not a placeholder. */
export const mentionable = (title: string) => {
  const t = title.trim()
  return t.length >= 3 && !/^(untitled|voice memo\b)/i.test(t)
}
export const mentionRe = (title: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(title.trim())}(?![\\p{L}\\p{N}])`, 'iu')

/** The first sentence-ish snippet around a mention, or null if the blocks don't mention `title`. */
export function findMention(blocks: any[], title: string): string | null {
  const re = mentionRe(title)
  let hit: string | null = null
  const walk = (bs: any[]) => {
    for (const b of bs ?? []) {
      if (hit) return
      if (!SKIP.has(b?.type) && Array.isArray(b?.content)) {
        for (const r of b.content) {
          if (r?.type !== 'text' || typeof r.text !== 'string') continue
          const m = re.exec(r.text)
          if (m) { const s = Math.max(0, m.index - 40); hit = (s ? '…' : '') + r.text.slice(s, m.index + m[0].length + 60).trim() + (m.index + m[0].length + 60 < r.text.length ? '…' : ''); return }
        }
      }
      if (b?.children?.length) walk(b.children)
    }
  }
  walk(blocks)
  return hit
}

/** Copy of `blocks` with the first plain-text mention of `title` turned into a link to note `id`. */
export function linkFirstMention(blocks: any[], title: string, id: string): any[] | null {
  const re = mentionRe(title)
  let done = false
  const walk = (bs: any[]): any[] => (bs ?? []).map((b) => {
    if (done) return b
    let nb = b
    if (!SKIP.has(b?.type) && Array.isArray(b?.content)) {
      const out: any[] = []
      for (const r of b.content) {
        const m = !done && r?.type === 'text' && typeof r.text === 'string' ? re.exec(r.text) : null
        if (!m) { out.push(r); continue }
        const before = r.text.slice(0, m.index), word = m[0], after = r.text.slice(m.index + word.length)
        if (before) out.push({ ...r, text: before })
        out.push({ type: 'link', href: `#note=${id}`, content: [{ type: 'text', text: word, styles: r.styles ?? {} }] })
        if (after) out.push({ ...r, text: after })
        done = true
      }
      if (done) nb = { ...b, content: out }
    }
    if (!done && b?.children?.length) { const kids = walk(b.children); if (done) nb = { ...nb, children: kids } }
    return nb
  })
  const res = walk(blocks)
  return done ? res : null
}

// ---------------------------------------------------------------- finding them without getting in the way
/** Lower-cased text of each note, kept until the note changes (so repeat scans are cheap). */
const textCache = new Map<string, { rev: number; text: string }>()
const idle = (fn: (deadline: { timeRemaining: () => number }) => void) =>
  'requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 1500 }) : (window as Window).setTimeout(() => fn({ timeRemaining: () => 8 }), 30)

/**
 * Scans notes in small slices while the browser is idle, so opening or typing in a note never waits
 * for it. Calls `done` with the matches; returns a function that cancels the scan.
 */
export function scanMentions(notes: any[], title: string, selfId: string, done: (hits: { n: any; snip: string }[]) => void) {
  const needle = title.trim().toLowerCase()
  const tag = `#note=${selfId}`
  const hits: { n: any; snip: string }[] = []
  let i = 0, stopped = false
  const step = (d: { timeRemaining: () => number }) => {
    if (stopped) return
    while (i < notes.length && d.timeRemaining() > 2) {
      const n = notes[i++]
      const rev = n.rev ?? n.updatedAt
      let c = textCache.get(n.id)
      if (!c || c.rev !== rev) { c = { rev, text: JSON.stringify(n.content ?? []).toLowerCase() }; textCache.set(n.id, c) }
      if (!c.text.includes(needle) || c.text.includes(tag)) continue
      const snip = findMention(n.content, title)
      if (snip) hits.push({ n, snip })
    }
    if (i < notes.length) idle(step); else done(hits)
  }
  idle(step)
  return () => { stopped = true }
}
