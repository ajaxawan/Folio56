// V6.2 share links, format 2: the same notes in far fewer characters.
//  1. Only what the other side can't work out is sent — no block ids, no default settings
//     (colour "default", alignment "left"…), no card previews or word counts (rebuilt on arrival).
//  2. Blocks are written in a compact shape: {t:"p", c:"text"} instead of BlockNote's long form.
//  3. Deflate starts from a built-in dictionary of the words and shapes notes usually contain,
//     so even a short note compresses well. The dictionary is part of format 2 and must never change
//     (a new one means a new format number).
// Pure functions only (no browser APIs), so they can be tested anywhere.
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

// ---------------------------------------------------------------- block types ⇄ short codes
const TYPES: Record<string, string> = {
  paragraph: 'p', heading: 'h', bulletListItem: 'b', numberedListItem: 'n', checkListItem: 'x', quote: 'q',
  codeBlock: 'k', table: 'tb', image: 'i', toggleListItem: 'tg', divider: 'd', audio: 'a', video: 'v', file: 'f',
}
const TYPE_BACK = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]))
const DEFAULT_PROPS: Record<string, unknown> = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: false, level: 1, isToggleable: false, language: 'text' }
const STYLE_KEYS: [string, string][] = [['bold', 'b'], ['italic', 'i'], ['underline', 'u'], ['strike', 's'], ['code', 'c']]

// ---------------------------------------------------------------- inline content
/** A run of text: "plain", or ["text", "bi"] with style letters, or ["text", "", {textColor…}] for other styles. */
function slimRuns(content: Any): Any {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content
  const runs = content.map((r: Any) => {
    if (r?.type === 'text') {
      const st = r.styles ?? {}
      const flags = STYLE_KEYS.filter(([k]) => st[k] === true).map(([, f]) => f).join('')
      const rest = Object.fromEntries(Object.entries(st).filter(([k]) => !STYLE_KEYS.some(([s]) => s === k)))
      if (!flags && !Object.keys(rest).length) return r.text ?? ''
      return Object.keys(rest).length ? [r.text ?? '', flags, rest] : [r.text ?? '', flags]
    }
    if (r?.type === 'link') return { l: r.href, c: slimRuns(r.content) }
    return { r } // anything else travels as it is
  })
  // neighbouring plain strings are joined; a single plain string becomes just the string
  const merged: Any[] = []
  for (const x of runs) { if (typeof x === 'string' && typeof merged[merged.length - 1] === 'string') merged[merged.length - 1] += x; else merged.push(x) }
  return merged.length === 1 && typeof merged[0] === 'string' ? merged[0] : merged.length === 0 ? '' : merged
}
function fullRuns(c: Any): Any {
  if (c === undefined) return []
  if (typeof c === 'string') return c ? [{ type: 'text', text: c, styles: {} }] : []
  if (!Array.isArray(c)) return c
  return c.map((x: Any) => {
    if (typeof x === 'string') return { type: 'text', text: x, styles: {} }
    if (Array.isArray(x)) {
      const styles: Record<string, unknown> = { ...(x[2] ?? {}) }
      for (const [k, f] of STYLE_KEYS) if (String(x[1] ?? '').includes(f)) styles[k] = true
      return { type: 'text', text: x[0], styles }
    }
    if (x && 'l' in x) return { type: 'link', href: x.l, content: fullRuns(x.c) }
    if (x && 'r' in x) return x.r
    return x
  })
}

// ---------------------------------------------------------------- blocks
export function slimBlocks(blocks: Any[]): Any[] {
  return (blocks ?? []).map((b: Any) => {
    const o: Any = { t: TYPES[b.type] ?? b.type }
    if (b.type === 'table') o.c = b.content // tables travel in their own shape
    else { const c = slimRuns(b.content); if (c !== '' && c !== undefined && !(Array.isArray(c) && !c.length)) o.c = c }
    const props = Object.fromEntries(Object.entries(b.props ?? {}).filter(([k, v]) => DEFAULT_PROPS[k] !== v && !(k === 'level' && b.type !== 'heading' && v === 1)))
    if (Object.keys(props).length) o.p = props
    if (b.children?.length) o.k = slimBlocks(b.children)
    return o
  })
}
export function fullBlocks(blocks: Any[]): Any[] {
  return (blocks ?? []).map((o: Any) => {
    const type = TYPE_BACK[o.t] ?? o.t
    const b: Any = { type, props: { ...(o.p ?? {}) }, content: type === 'table' ? o.c : fullRuns(o.c), children: fullBlocks(o.k ?? []) }
    if (type === 'checkListItem' && b.props.checked === undefined) b.props.checked = false
    if (type === 'heading' && b.props.level === undefined) b.props.level = 1
    if (['image', 'divider', 'audio', 'video', 'file'].includes(type) && !o.c) delete b.content
    return b
  })
}

// ---------------------------------------------------------------- notes
/** Note fields left out when they hold their usual value. */
const NOTE_DEFAULTS: Record<string, unknown> = { color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', image: null }
/** Worked out again on arrival from the content. */
const DERIVED = new Set(['preview', 'checklist', 'words', 'image'])
const isEmptyList = (v: unknown) => Array.isArray(v) && v.length === 0

export function slimNote(n: Any): Any {
  const o: Any = {}
  for (const [k, v] of Object.entries(n)) {
    if (DERIVED.has(k) || v === undefined) continue
    if (k in NOTE_DEFAULTS && NOTE_DEFAULTS[k] === v) continue
    if (k === 'labels' && isEmptyList(v)) continue
    if (k === 'rev' && v === n.updatedAt) continue
    o[k] = k === 'content' ? slimBlocks(v as Any[]) : v
  }
  return o
}
export function fullNote(o: Any, derive: (blocks: Any[]) => object): Any {
  const content = fullBlocks(o.content ?? [])
  return { ...NOTE_DEFAULTS, labels: [], ...o, content, rev: o.rev ?? o.updatedAt, ...derive(content) }
}

// ---------------------------------------------------------------- compression with a dictionary
/**
 * Format 2's dictionary: shapes and words notes are made of. Deflate can point back into it from the
 * very first byte, which is what makes short notes short. NEVER EDIT — a changed dictionary would make
 * every format-2 link unreadable. (To improve it, add format 3.)
 */
const DICT_TEXT = [
  ' the and to of a in is for that on with as it be this are or was by at from have not you we they an will can your our has but all if more one about which their there what when out up so no time new also just like into than only other then some them these its how do should need make use first two may get work any well way most even over after back here because before through each week day today plan team project meeting notes next steps action items decision summary question answer idea review update status risk issue cost price budget date due done open task tasks follow',
  'January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday 2026-',
  ' 📅 2026-10-',
  '"},{"t":"p","c":"',
  '"},{"t":"b","c":"',
  '"},{"t":"n","c":"',
  '"},{"t":"x","c":"',
  '"},{"t":"x","c":"","p":{"checked":true}},',
  '"},{"t":"h","c":"","p":{"level":2}},{"t":"h","c":"","p":{"level":3}},{"t":"q","c":"',
  '{"t":"tb","c":{"type":"tableContent","columnWidths":[null,null],"headerRows":1,"rows":[{"cells":[{"type":"tableCell","content":[{"type":"text","text":"","styles":{}}],"props":{"colspan":1,"rowspan":1,"backgroundColor":"default","textColor":"default","textAlignment":"left"}}]}]}}',
  '{"t":"i","p":{"url":"data:image/webp;base64,","caption":"","previewWidth":',
  ',"b"],[" ","i"],{"l":"https://","c":"',
  '{"v":2,"from":"","at":17,"notes":[{"id":"","title":"","position":17,"createdAt":17,"updatedAt":17,"content":[{"t":"p","c":"',
  '"labels":[{"id":"","name":"","color":"',
  '"memo":{"status":"done","style":"minutes","audio":[],"duration":',
  '"series":"","color":"yellow","pinned":true,"parentId":"","icon":"',
].join('')
const DICT = strToU8(DICT_TEXT)

export const compress = (json: string) => deflateSync(strToU8(json), { level: 9, mem: 12, dictionary: DICT })
export const decompress = (bytes: Uint8Array) => strFromU8(inflateSync(bytes, { dictionary: DICT }))
