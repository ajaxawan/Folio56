// Share links: a self-contained, optionally encrypted bundle of notes carried inside
// a link's #fragment. Browsers never send the fragment to the web server, so no server
// (not even the one hosting Folio) ever sees the notes.
//
// Binary layout (before base64url):  'F' | version | flags | [salt16 iv12] | payload
//   flags bit0 = encrypted (AES-GCM, key from the parcel code via PBKDF2)
//   payload    = deflate(JSON { v, from, at, notes, labels })

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { appUrl } from './paths'
import type { Label, Note } from '../types'
import { b64, openBytes, sealBytes, unb64 } from './crypto'
import { db, descendants, revOf } from './db'
import { externalize, inlineRefs, isData, isRef, storeDataUrl, toDataUrl, type StoredBlob } from './blobs'

const MAGIC = 0x46
const VERSION = 1
export const LINK_KEY = 'p'
/** Links longer than this get a warning — some chat apps truncate very long URLs. */
export const LINK_SOFT_LIMIT = 8000
/** Beyond this, most apps refuse or mangle the link. */
export const LINK_HARD_LIMIT = 60_000

export interface ParcelContent { v: 1; from: string; at: number; notes: Note[]; labels: Label[] }

// ---------- base64url ----------
const toUrl = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromUrl = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)

// ---------- codes ----------
const WORDS = ('amber anchor apple arrow aspen atlas autumn badge bamboo basil beacon berry birch bloom bramble breeze brook cabin cactus camel candle canyon cedar cherry cinder clover cobalt comet coral cotton crane cricket crystal dahlia daisy delta desert dove dune ember falcon fern fig flint forest fossil fox galaxy garnet ginger glacier grape harbor hazel heron honey indigo iris island ivory jade jasmine juniper kettle kiwi lagoon lantern lemon lilac linen lotus lunar maple marble meadow mint moss nectar nova oak ocean olive onyx orbit otter pebble pepper pine planet plum polar poppy prism quartz quill raven reef river robin saffron sage sequoia shadow silver sparrow spruce stone summit sunset thistle thunder tulip tundra velvet violet walnut willow wren zephyr').split(' ')

export function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(4))
  const w = (i: number) => WORDS[r[i] % WORDS.length]
  return `${w(0)}-${w(1)}-${w(2)}-${String(r[3] % 90 + 10)}`
}
const normCode = (c: string) => c.trim().toLowerCase().replace(/\s+/g, '-')

// ---------- collect ----------
/** The notes to send: the chosen ones plus their sub-pages. Locked notes are left out (their cipher is tied to this device's passcode). */
export async function collect(ids: string[]) {
  const all = await db.notes.toArray()
  const want = new Set(ids.flatMap((id) => [id, ...descendants(all, id)]))
  const picked = all.filter((n) => want.has(n.id) && n.trashedAt === null)
  // Recordings never fit in a link: they stay on this device (the write-up and transcript travel).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noAudio = (bs: any[]): any[] => (bs ?? []).filter((b) => !['audio', 'video', 'file'].includes(b?.type)).map((b) => (b.children?.length ? { ...b, children: noAudio(b.children) } : b))
  const notes = await Promise.all(picked.filter((n) => !n.locked).map(async (n) => ({
    ...n,
    memo: n.memo ? { ...n.memo, audio: [], status: n.memo.status === 'done' ? 'done' as const : 'error' as const, error: n.memo.status === 'done' ? undefined : 'The recording stayed on the device it was made on.' } : undefined,
    content: await inlineRefs(noAudio(n.content)),
    image: isRef(n.image) ? await toDataUrl(n.image) : n.image,
    cover: isRef(n.cover) ? await toDataUrl(n.cover) : n.cover,
  })))
  const labelIds = new Set(notes.flatMap((n) => n.labels))
  const labels = (await db.labels.toArray()).filter((l) => labelIds.has(l.id))
  return { notes, labels, skippedLocked: picked.length - notes.length }
}

/** Remove embedded images (data: URLs) so a parcel fits in a link. Returns how many were removed. */
export function stripImages(notes: Note[]) {
  let removed = 0
  const out = notes.map((n) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (bs: any[]): any[] => bs.filter((b) => {
      if (b.type === 'image' && String(b.props?.url ?? '').startsWith('data:')) { removed++; return false }
      return true
    }).map((b) => (b.children?.length ? { ...b, children: walk(b.children) } : b))
    return { ...n, content: walk(structuredClone(n.content ?? [])), image: n.image?.startsWith('data:') ? null : n.image }
  })
  return { notes: out, removed }
}

// ---------- encode / decode ----------
export async function pack(content: ParcelContent, code: string | null): Promise<Uint8Array> {
  const payload = deflateSync(strToU8(JSON.stringify(content)), { level: 9 })
  if (!code) return concat([Uint8Array.of(MAGIC, VERSION, 0), payload])
  const { salt, iv, data } = await sealBytes(payload, normCode(code))
  return concat([Uint8Array.of(MAGIC, VERSION, 1), salt, iv, data])
}

export class NeedsCode extends Error { constructor() { super('This link is protected. Enter its code.') } }
export class WrongCode extends Error { constructor() { super("That code doesn't open this link.") } }

export const isEncrypted = (bytes: Uint8Array) => (bytes[2] & 1) === 1

export async function unpack(bytes: Uint8Array, code?: string | null): Promise<ParcelContent> {
  if (bytes[0] !== MAGIC) throw new Error("This isn't a Folio link.")
  if (bytes[1] > VERSION) throw new Error('This link was made by a newer Folio. Update the app and try again.')
  let payload = bytes.subarray(3)
  if (isEncrypted(bytes)) {
    if (!code) throw new NeedsCode()
    try { payload = await openBytes(bytes.subarray(3, 19), bytes.subarray(19, 31), bytes.subarray(31), normCode(code)) } catch { throw new WrongCode() }
  }
  const c = JSON.parse(strFromU8(inflateSync(payload))) as ParcelContent
  if (!Array.isArray(c.notes)) throw new Error('This link is incomplete — ask for it again.')
  return c
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

// ---------- link ----------
/** Link with the parcel in the #fragment. `withCode` puts the code in the link too (anyone with the link can open it). */
export function toLink(bytes: Uint8Array, code: string | null, withCode: boolean) {
  const base = appUrl()
  const frag = `${LINK_KEY}=${toUrl(b64(bytes))}${withCode && code ? `.${normCode(code)}` : ''}`
  return `${base}#${frag}`
}

export function fromHash(hash: string) {
  const m = hash.replace(/^#/, '').match(new RegExp(`^${LINK_KEY}=([A-Za-z0-9_-]+)(?:\\.([a-z0-9-]+))?$`))
  if (!m) return null
  return { bytes: unb64(fromUrl(m[1])), code: m[2] ?? null }
}

// ---------- receive ----------
export type Incoming = { note: Note; status: 'new' | 'newer' | 'same' | 'older' }

export async function preview(c: ParcelContent): Promise<Incoming[]> {
  const out: Incoming[] = []
  for (const note of c.notes) {
    const cur = await db.notes.get(note.id)
    const status = !cur ? 'new' : revOf(note) > revOf(cur) ? 'newer' : revOf(note) === revOf(cur) ? 'same' : 'older'
    out.push({ note, status })
  }
  return out
}

/** Adds / updates the chosen notes. Labels are matched by id, then by name, so nothing is duplicated. */
export async function accept(c: ParcelContent, ids: Set<string>) {
  const chosen = c.notes.filter((n) => ids.has(n.id))
  const local = await db.labels.toArray()
  const byName = new Map(local.map((l) => [l.name.toLowerCase(), l.id]))
  const remap = new Map<string, string>()
  const newLabels: Label[] = []
  for (const l of c.labels) {
    if (local.some((x) => x.id === l.id)) remap.set(l.id, l.id)
    else if (byName.has(l.name.toLowerCase())) remap.set(l.id, byName.get(l.name.toLowerCase())!)
    else { remap.set(l.id, l.id); newLabels.push(l) }
  }
  const incomingIds = new Set(chosen.map((n) => n.id))
  let added = 0, updated = 0
  const pending = new Map<string, StoredBlob>()
  await db.transaction('rw', [db.notes, db.labels, db.blobs], async () => {
    if (newLabels.length) await db.labels.bulkPut(newLabels)
    for (const raw of chosen) {
      const exists = await db.notes.get(raw.id)
      const parentOk = !raw.parentId || incomingIds.has(raw.parentId) || !!(await db.notes.get(raw.parentId))
      const n: Note = {
        ...raw,
        labels: raw.labels.map((id) => remap.get(id) ?? id).filter((id, i, a) => a.indexOf(id) === i),
        parentId: parentOk ? raw.parentId : null,
        locked: false, cipher: null, trashedAt: null,
        rev: revOf(raw),
        content: externalize(raw.content, pending),
        image: isData(raw.image) ? storeDataUrl(raw.image, pending) : raw.image,
        cover: isData(raw.cover) ? storeDataUrl(raw.cover, pending) : raw.cover,
      }
      await db.notes.put(n)
      if (exists) updated++; else added++
    }
    await db.blobs.bulkPut([...pending.values()])
  })
  return { added, updated }
}
