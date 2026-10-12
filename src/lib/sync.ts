// V6.4 "Sync my devices": two of your own Folios swap what changed since they last met.
// There is no server and no background sync — you start it, both devices take part, and it ends.
//
// What travels is a "sync bundle": the notes this device changed since the other one last
// confirmed a sync (every change stamps a note's `rev`), plus notebooks. Over Wi-Fi the pictures and
// recordings those notes use follow separately, by id, only if the other device lacks them.
// With QR codes only, small pictures ride inside the bundle.
//
// Merging, for each incoming note:
//  · not here yet → added
//  · here, and unchanged here since the last sync with that device → replaced by the incoming one
//  · changed on both devices (or different on a first sync) → the newer edit keeps the note and the
//    other version is kept beside it as a copy — the same choice, and the same copy, on both devices
// Moving a note to Trash travels like any other change; nothing is ever deleted for good.
// Locked notes and template drafts stay on their own device.
import { db, revOf } from './db'
import { REF, collectRefs, isRef } from './blobs'
import { compress, decompress, fullNote, slimNote } from './parcelCodec'
import { derive } from './preview'
import { browserLabel } from './device'
import type { Label, Note } from '../types'

export const SYNC_MAGIC = 0x59 // "Y"
const SYNC_VERSION = 1

export interface Peer { id: string; name: string; since: number; lastSync: number; gotAt: number }
export interface Bundle {
  v: 1; from: { id: string; name: string }; at: number; full: boolean; ack: number | null
  notes: Note[]; labels: Label[]
  /** QR mode only: small pictures, by id. */
  blobs?: { id: string; type: string; data: string }[]
}
export interface SyncResult { added: number; updated: number; trashed: number; conflicts: { id: string; title: string }[]; same: number }

// ---------------------------------------------------------------- who we are, and who we know
export async function deviceId(): Promise<string> {
  const row = await db.meta.get('deviceId')
  if (row?.value) return row.value as string
  const id = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
  await db.meta.put({ key: 'deviceId', value: id })
  return id
}
export const deviceName = () => browserLabel()

export async function getPeers(): Promise<Peer[]> { return ((await db.meta.get('syncPeers'))?.value as Peer[] | undefined) ?? [] }
async function savePeer(p: Peer) { const all = (await getPeers()).filter((x) => x.id !== p.id); await db.meta.put({ key: 'syncPeers', value: [...all, p] }) }
export async function forgetPeer(id: string) { await db.meta.put({ key: 'syncPeers', value: (await getPeers()).filter((x) => x.id !== id) }) }
async function peer(id: string) { return (await getPeers()).find((p) => p.id === id) ?? null }

/** The other device confirmed it has everything up to `at` (this device's clock). */
export async function confirmSent(peerId: string, name: string, at: number) {
  const p = (await peer(peerId)) ?? { id: peerId, name, since: 0, lastSync: 0, gotAt: 0 }
  await savePeer({ ...p, name, since: Math.max(p.since, at), lastSync: Date.now() })
}

// ---------------------------------------------------------------- building a bundle
const syncable = (n: Note) => !n.locked && !n.templateDraft

/** Notes to send to `peerId`: everything changed since it last confirmed, or everything on a first sync. */
export async function buildBundle(peerId: string | null, opts: { full?: boolean; skip?: Map<string, number> } = {}): Promise<Bundle> {
  const p = peerId ? await peer(peerId) : null
  const full = opts.full || !p
  const since = full ? 0 : p!.since
  const at = Date.now()
  const notes = (await db.notes.toArray()).filter((n) => syncable(n) && revOf(n) > since && opts.skip?.get(n.id) !== revOf(n))
  const used = new Set(notes.flatMap((n) => n.labels))
  const labels = (await db.labels.toArray()).filter((l) => full || used.has(l.id))
  return { v: 1, from: { id: await deviceId(), name: deviceName() }, at, full, ack: p?.gotAt || null, notes, labels }
}

/** Every picture / recording id the notes use. */
export function refsOf(notes: Note[]): Set<string> {
  const ids = new Set<string>()
  for (const n of notes) {
    collectRefs(n.content ?? [], ids)
    for (const u of [n.cover, n.image, ...(n.memo?.audio ?? [])]) if (isRef(u)) ids.add(u.slice(REF.length))
  }
  return ids
}

/** QR mode: put small pictures (not recordings) in the bundle while it stays under `budget` bytes. */
export async function addSmallImages(b: Bundle, budget = 40_000): Promise<{ included: number; left: number }> {
  const out: NonNullable<Bundle['blobs']> = []
  let used = 0, left = 0
  for (const id of refsOf(b.notes)) {
    const rec = await db.blobs.get(id)
    if (!rec || !rec.type.startsWith('image/')) continue
    if (used + rec.size > budget) { left++; continue }
    out.push({ id, type: rec.type, data: await toB64(rec.blob) }); used += rec.size
  }
  if (out.length) b.blobs = out
  return { included: out.length, left }
}

// ---------------------------------------------------------------- bytes
export function encodeBundle(b: Bundle): Uint8Array {
  const body = compress(JSON.stringify({ ...b, notes: b.notes.map(slimNote) }))
  const out = new Uint8Array(body.length + 2); out[0] = SYNC_MAGIC; out[1] = SYNC_VERSION; out.set(body, 2)
  return out
}
export const isBundle = (bytes: Uint8Array) => bytes[0] === SYNC_MAGIC
export function decodeBundle(bytes: Uint8Array): Bundle {
  if (bytes[0] !== SYNC_MAGIC) throw new Error('That isn’t a Folio sync code.')
  if (bytes[1] > SYNC_VERSION) throw new Error('The other device has a newer Folio. Update this one and try again.')
  const raw = JSON.parse(decompress(bytes.subarray(2)))
  return { ...raw, notes: (raw.notes ?? []).map((o: unknown) => fullNote(o, derive)) }
}

// ---------------------------------------------------------------- merging
/** Title, content and placement — what a person would call "the same note". */
const sameNote = (a: Note, b: Note) => a.title === b.title && a.trashedAt === b.trashedAt && a.archived === b.archived && a.parentId === b.parentId && JSON.stringify(stripIds(a.content)) === JSON.stringify(stripIds(b.content))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripIds = (bs: any[]): any[] => (bs ?? []).map(({ id: _id, children, ...rest }) => ({ ...rest, children: stripIds(children ?? []) }))

/** Applies a bundle from another of your devices. Returns what changed (conflicts are kept as copies). */
export async function applyBundle(b: Bundle): Promise<SyncResult> {
  const me = await deviceId()
  if (b.from.id === me) throw new Error('That code came from this device.')
  const p = await peer(b.from.id)
  const firstTime = !p || b.full
  const base = p?.since ?? 0
  const res: SyncResult = { added: 0, updated: 0, trashed: 0, conflicts: [], same: 0 }

  // notebooks: by id, then by name, so nothing is doubled
  const local = await db.labels.toArray()
  const byName = new Map(local.map((l) => [l.name.toLowerCase(), l.id]))
  const remap = new Map<string, string>()
  const newLabels: Label[] = []
  for (const l of b.labels) {
    const hit = local.find((x) => x.id === l.id)
    if (hit) { remap.set(l.id, l.id); if (hit.name !== l.name || hit.color !== l.color) newLabels.push(l) }
    else if (byName.has(l.name.toLowerCase())) remap.set(l.id, byName.get(l.name.toLowerCase())!)
    else { remap.set(l.id, l.id); newLabels.push(l) }
  }

  const incomingIds = new Set(b.notes.map((n) => n.id))
  await db.transaction('rw', [db.notes, db.labels, db.blobs], async () => {
    if (newLabels.length) await db.labels.bulkPut(newLabels)
    if (b.blobs?.length) {
      const have = new Set((await db.blobs.bulkGet(b.blobs.map((x) => x.id))).filter(Boolean).map((x) => x!.id))
      await db.blobs.bulkPut(b.blobs.filter((x) => !have.has(x.id)).map((x) => { const blob = fromB64(x.data, x.type); return { id: x.id, blob, type: x.type, size: blob.size, at: Date.now() } }))
    }
    for (const raw of b.notes) {
      const n: Note = { ...raw, labels: raw.labels.map((id) => remap.get(id) ?? id).filter((id, i, a) => a.indexOf(id) === i), rev: revOf(raw) }
      if (n.parentId && !incomingIds.has(n.parentId) && !(await db.notes.get(n.parentId))) n.parentId = null
      const L = await db.notes.get(n.id)
      if (!L) { await db.notes.put(n); res.added++; continue }
      if (L.locked) continue // a locked note here is never overwritten
      if (revOf(L) === revOf(n) || sameNote(L, n)) { if (revOf(n) > revOf(L)) await db.notes.put(n); res.same++; continue }
      if (!firstTime && revOf(L) <= base) {
        // unchanged here since the last sync: take theirs
        await db.notes.put(n)
        if (n.trashedAt && !L.trashedAt) res.trashed++; else res.updated++
        continue
      }
      // Changed on both devices (or met for the first time with different copies). Both devices make
      // the same choice: the newer edit keeps the note, the other becomes a copy with the same id on
      // both — so after one sync they agree, and nothing is lost or doubled.
      const theirs = revOf(n) > revOf(L) || (revOf(n) === revOf(L) && b.from.id > me)
      const loser = theirs ? L : n
      const loserName = theirs ? deviceName() : b.from.name
      const copyId = 'c' + hash(`${n.id}:${revOf(loser)}`)
      if (theirs) await db.notes.put(n)
      if (!(await db.notes.get(copyId))) {
        const title = `${loser.title || 'Untitled'} (${loserName} version)`
        await db.notes.put({ ...loser, id: copyId, title, pinned: false, labels: theirs ? L.labels : n.labels, rev: revOf(loser), updatedAt: loser.updatedAt })
        res.conflicts.push({ id: copyId, title })
      }
    }
  })
  const prev = p ?? { id: b.from.id, name: b.from.name, since: 0, lastSync: 0, gotAt: 0 }
  await savePeer({ ...prev, name: b.from.name, gotAt: Math.max(prev.gotAt, b.at), lastSync: Date.now(), since: b.ack ? Math.max(prev.since, b.ack) : prev.since })
  return res
}

/** Picture / recording ids that notes here use but this device doesn't have (asked for over Wi-Fi). */
export async function missingRefs(): Promise<string[]> {
  const ids = [...refsOf((await db.notes.toArray()).filter((n) => n.trashedAt === null))]
  const have = await db.blobs.bulkGet(ids)
  return ids.filter((_, i) => !have[i])
}

// ---------------------------------------------------------------- helpers
/** Short stable id (FNV-1a, twice) — the same on every device for the same input. */
function hash(s: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}
async function toB64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function fromB64(data: string, type: string) {
  const bin = atob(data); const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Remembers, for this session, what just arrived from a device — so a reply doesn't send it straight back. */
export const justGot = new Map<string, Map<string, number>>()
export function rememberGot(b: Bundle) { justGot.set(b.from.id, new Map(b.notes.map((n) => [n.id, revOf(n)]))) }
