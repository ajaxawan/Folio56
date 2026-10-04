// Images live once in their own table as real binary Blobs, referenced from notes as
// "folio-img:<hash>". The same picture in a note, its 40 history snapshots, a template or
// a duplicate is stored a single time. Old notes with inline data: URLs keep working.

import { useEffect, useState } from 'react'
import { coverCss } from './colors'
import { db } from './db'

export const REF = 'folio-img:'
export const isRef = (u: unknown): u is string => typeof u === 'string' && u.startsWith(REF)
export const isData = (u: unknown): u is string => typeof u === 'string' && u.startsWith('data:')

// ---------- hashing (synchronous so it can run inside a database transaction) ----------
function cyrb53(str: string, seed: number) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
/** 128-bit content id from the base64 payload. */
const idOf = (b64: string) => cyrb53(b64, 1) + cyrb53(b64, 7) + b64.length.toString(16)

export interface StoredBlob { id: string; blob: Blob; type: string; size: number; at: number }

/** data: URL → Blob without awaiting anything (safe inside a Dexie transaction). */
export function dataUrlToBlob(url: string): { blob: Blob; type: string; b64: string } | null {
  const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!m) return null
  const type = m[1] || 'application/octet-stream'
  if (m[2]) {
    const bin = atob(m[3]); const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { blob: new Blob([bytes], { type }), type, b64: m[3] }
  }
  const text = decodeURIComponent(m[3])
  return { blob: new Blob([text], { type }), type, b64: btoa(unescape(encodeURIComponent(text))) }
}

/** Store a data: URL (once) and return its reference. Synchronous parts only — call inside a transaction or not. */
export function storeDataUrl(url: string, pending?: Map<string, StoredBlob>): string {
  const d = dataUrlToBlob(url); if (!d) return url
  const id = idOf(d.b64)
  const rec: StoredBlob = { id, blob: d.blob, type: d.type, size: d.blob.size, at: Date.now() }
  if (pending) pending.set(id, rec); else void db.blobs.put(rec)
  return REF + id
}

/** Store an image file the user picked/pasted (already downscaled to a data URL by the caller). */
export async function putImage(dataUrl: string): Promise<string> {
  const pending = new Map<string, StoredBlob>()
  const ref = storeDataUrl(dataUrl, pending)
  await db.blobs.bulkPut([...pending.values()])
  return ref
}

// ---------- reading ----------
const urls = new Map<string, string>()
/** Object URL for a reference (kept for the session; cheap to reuse across cards and the editor). */
export async function urlFor(ref: string): Promise<string> {
  if (!isRef(ref)) return ref
  const hit = urls.get(ref); if (hit) return hit
  const rec = await db.blobs.get(ref.slice(REF.length))
  if (!rec) return ''
  const u = URL.createObjectURL(rec.blob)
  urls.set(ref, u)
  return u
}

/** React hook: resolves a reference (or passes through a normal URL). */
export function useImageUrl(src: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(src && !isRef(src) ? src : (src && urls.get(src)) || null)
  useEffect(() => {
    if (!src) { setUrl(null); return }
    if (!isRef(src)) { setUrl(src); return }
    let live = true
    urlFor(src).then((u) => { if (live) setUrl(u || null) })
    return () => { live = false }
  }, [src])
  return url
}

/** CSS background for a note cover: a gradient preset, a stored image, or an old inline image. */
export function useCoverCss(cover: string | null | undefined) {
  const url = useImageUrl(isRef(cover) ? cover : null)
  if (!cover) return null
  if (isRef(cover)) return url ? `center / cover no-repeat url("${url}")` : null
  return coverCss(cover)
}

export async function toDataUrl(ref: string): Promise<string> {
  if (!isRef(ref)) return ref
  const rec = await db.blobs.get(ref.slice(REF.length)); if (!rec) return ''
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(rec.blob) })
}

// ---------- walking documents ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
/** Returns a copy of the blocks with every image/file url passed through `fn`. */
export function mapUrls(blocks: Block[], fn: (u: string) => string): Block[] {
  if (!Array.isArray(blocks)) return blocks
  let changed = false
  const out = blocks.map((b: Block) => {
    let nb = b
    const u = b?.props?.url
    if (typeof u === 'string' && (isRef(u) || isData(u))) { const v = fn(u); if (v !== u) nb = { ...b, props: { ...b.props, url: v } } }
    if (b?.children?.length) { const kids = mapUrls(b.children, fn); if (kids !== b.children) nb = { ...nb, children: kids } }
    if (nb !== b) changed = true
    return nb
  })
  return changed ? out : blocks
}
export function collectRefs(blocks: Block[], into = new Set<string>()) {
  mapUrls(blocks, (u) => { if (isRef(u)) into.add(u.slice(REF.length)); return u })
  return into
}

/** data: URLs → references (stores blobs into `pending`). */
export const externalize = (blocks: Block[], pending: Map<string, StoredBlob>) => mapUrls(blocks, (u) => (isData(u) ? storeDataUrl(u, pending) : u))

/** references → data: URLs (for exports, share links and locked notes). */
export async function inlineRefs(blocks: Block[]): Promise<Block[]> {
  const ids = [...collectRefs(blocks)]
  const map = new Map<string, string>()
  for (const id of ids) map.set(REF + id, await toDataUrl(REF + id))
  return mapUrls(blocks, (u) => (isRef(u) ? map.get(u) || u : u))
}

// ---------- housekeeping ----------
/** Every image id still used by a note, its history, a template or a cover. */
export async function usedIds() {
  const used = new Set<string>()
  const add = (u?: string | null) => { if (isRef(u)) used.add(u.slice(REF.length)) }
  await db.notes.each((n) => { collectRefs(n.content, used); add(n.cover); add(n.image) })
  await db.versions.each((v) => { collectRefs(v.content, used) })
  await db.templates.each((t) => { collectRefs(t.content, used) })
  return used
}

/** Deletes images nothing refers to any more. Returns bytes freed. */
export async function cleanUnusedImages() {
  const used = await usedIds()
  let freed = 0
  const drop: string[] = []
  // Grace period: an image pasted a moment ago may not be saved into its note yet.
  const cutoff = Date.now() - 10 * 60 * 1000
  await db.blobs.each((b) => { if (!used.has(b.id) && b.at < cutoff) { drop.push(b.id); freed += b.size } })
  await db.blobs.bulkDelete(drop)
  return { freed, count: drop.length }
}

/**
 * One-time move of inline data: images into the blob table (notes, history, templates, covers).
 * Runs as a single transaction: it either fully happens or nothing changes.
 */
export async function migrateInlineImages() {
  if ((await db.meta.get('imagesMigrated'))?.value) return { moved: 0 }
  let moved = 0
  await db.transaction('rw', [db.notes, db.versions, db.templates, db.blobs, db.meta], async () => {
    const pending = new Map<string, StoredBlob>()
    const fix = (blocks: Block[]) => { const out = externalize(blocks, pending); if (out !== blocks) moved++; return out }
    const notes = await db.notes.toArray()
    for (const n of notes) {
      if (n.locked) continue
      const content = fix(n.content)
      const cover = isData(n.cover) ? storeDataUrl(n.cover, pending) : n.cover
      const image = isData(n.image) ? storeDataUrl(n.image, pending) : n.image
      if (content !== n.content || cover !== n.cover || image !== n.image) await db.notes.update(n.id, { content, cover, image, rev: n.rev ?? n.updatedAt })
    }
    const versions = await db.versions.toArray()
    for (const v of versions) { const content = fix(v.content); if (content !== v.content) await db.versions.update(v.id, { content }) }
    const templates = await db.templates.toArray()
    for (const t of templates) { const content = fix(t.content); if (content !== t.content) await db.templates.update(t.id, { content }) }
    await db.blobs.bulkPut([...pending.values()])
    await db.meta.put({ key: 'imagesMigrated', value: Date.now() })
  })
  return { moved }
}
