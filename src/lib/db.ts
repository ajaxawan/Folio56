import Dexie, { type EntityTable } from 'dexie'
import { nanoid } from 'nanoid'
import type { ColorKey, Label, Note, Template, Version } from '../types'
import { decryptJSON, encryptJSON } from './crypto'
import { derive } from './preview'
import { b64 as toB64, unb64 } from './crypto'
import { collectRefs, externalize, inlineRefs, isData, isRef, REF, storeDataUrl, type StoredBlob } from './blobs'
import { BUILTIN_TEMPLATES, dailyTitle, todayKey } from './templates'

export const db = new Dexie('folio') as Dexie & {
  notes: EntityTable<Note, 'id'>
  labels: EntityTable<Label, 'id'>
  versions: EntityTable<Version, 'id'>
  templates: EntityTable<Template, 'id'>
  meta: EntityTable<{ key: string; value: unknown }, 'key'>
  blobs: EntityTable<StoredBlob, 'id'>
}

db.version(1).stores({
  notes: 'id, parentId, updatedAt, trashedAt, *labels',
  labels: 'id, name',
})
db.version(2).stores({
  notes: 'id, parentId, updatedAt, trashedAt, *labels, daily',
  labels: 'id, name',
  versions: 'id, noteId, at',
  templates: 'id, name',
  meta: 'key',
}).upgrade((tx) => tx.table('notes').toCollection().modify((n: Note) => {
  n.position ??= n.updatedAt
  n.locked ??= false
  n.cipher ??= null
  n.daily ??= null
  n.words ??= derive(n.content ?? []).words
}))
// V5.2: images stored once as binary blobs (see blobs.ts)
db.version(3).stores({ blobs: 'id' })

const EMPTY = { preview: '', checklist: [], image: null, words: 0 }

// Every change stamps `rev`, so merging backups from other devices picks the latest state —
// including pins, archive and trash, which don't touch updatedAt.
db.notes.hook('creating', (_k, obj) => { obj.rev ??= obj.updatedAt ?? Date.now() })
db.notes.hook('updating', (mods) => ('rev' in (mods as object) ? undefined : { rev: Date.now() }))
export const revOf = (n: Note) => n.rev ?? n.updatedAt

export async function nextPosition() {
  const all = await db.notes.toArray()
  return all.reduce((m, n) => Math.max(m, n.position ?? 0), 0) + 1
}

export async function createNote(partial: Partial<Note> = {}): Promise<Note> {
  const now = Date.now()
  const content = partial.content ?? []
  const note: Note = {
    id: nanoid(12), title: '', color: 'default', pinned: false, archived: false, trashedAt: null,
    parentId: null, labels: [], locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none',
    position: await nextPosition(), createdAt: now, updatedAt: now,
    ...partial, content, ...derive(content),
  }
  await db.notes.add(note)
  return note
}

export function updateNote(id: string, changes: Partial<Note>) {
  const extra = changes.content ? derive(changes.content) : {}
  return db.notes.update(id, { ...changes, ...extra, updatedAt: Date.now() })
}

/** Update metadata without bumping "edited" time (pin, colour, order…) */
export const patchNote = (id: string, changes: Partial<Note>) => db.notes.update(id, changes)
export const patchMany = (ids: string[], changes: Partial<Note>) => db.notes.bulkUpdate(ids.map((key) => ({ key, changes })))

/** Save content of a locked note: encrypt, keep cards blank. */
export async function saveLockedContent(id: string, content: unknown[], passcode: string, title?: string) {
  // Images go inside the encrypted content, never left readable in the image store.
  const cipher = await encryptJSON(await inlineRefs(content), passcode)
  await db.notes.update(id, { cipher, content: [], ...EMPTY, words: derive(content).words, ...(title !== undefined ? { title } : {}), updatedAt: Date.now() })
}

export async function lockNote(id: string, passcode: string) {
  const n = await db.notes.get(id); if (!n) return
  await saveLockedContent(id, n.content, passcode)
  await db.notes.update(id, { locked: true })
  await db.versions.where('noteId').equals(id).delete() // history would leak plain text
}

export async function unlockNote(id: string, passcode: string) {
  const n = await db.notes.get(id); if (!n?.cipher) return
  const pending = new Map<string, StoredBlob>()
  const content = externalize(await decryptJSON<unknown[]>(n.cipher, passcode), pending)
  await db.blobs.bulkPut([...pending.values()])
  await db.notes.update(id, { locked: false, cipher: null, content, ...derive(content) })
}

export async function readLocked(n: Note, passcode: string) {
  if (!n.cipher) return []
  return decryptJSON<unknown[]>(n.cipher, passcode)
}

export async function setTrashed(id: string | string[], trashed: boolean) {
  const all = await db.notes.toArray()
  const roots = Array.isArray(id) ? id : [id]
  const ids = roots.flatMap((r) => [r, ...descendants(all, r)])
  await patchMany(ids, { trashedAt: trashed ? Date.now() : null })
}

export async function deleteForever(id: string) {
  const all = await db.notes.toArray()
  const ids = [id, ...descendants(all, id)]
  await db.notes.bulkDelete(ids)
  await db.versions.where('noteId').anyOf(ids).delete()
}

export async function emptyTrash() {
  const trashed = await db.notes.filter((n) => n.trashedAt !== null).primaryKeys()
  await db.notes.bulkDelete(trashed)
  await db.versions.where('noteId').anyOf(trashed).delete()
}

export function descendants(all: Note[], id: string): string[] {
  const out: string[] = []
  const walk = (pid: string) => { for (const n of all) if (n.parentId === pid) { out.push(n.id); walk(n.id) } }
  walk(id)
  return out
}

export async function duplicateNote(n: Note) {
  const { id: _i, createdAt: _c, updatedAt: _u, position: _p, ...rest } = n
  void _i; void _c; void _u; void _p
  return createNote({ ...rest, daily: null, title: n.title ? `${n.title} (copy)` : '' })
}

// ---------- labels ----------
export async function createLabel(name: string) {
  const label = { id: nanoid(8), name: name.trim() }
  await db.labels.add(label)
  return label
}
export async function deleteLabel(id: string) {
  await db.transaction('rw', db.notes, db.labels, async () => {
    await db.labels.delete(id)
    const withLabel = await db.notes.where('labels').equals(id).toArray()
    for (const n of withLabel) await db.notes.update(n.id, { labels: n.labels.filter((l) => l !== id) })
  })
}
export async function addLabelToMany(ids: string[], labelId: string) {
  const notes = await db.notes.bulkGet(ids)
  await db.notes.bulkUpdate(notes.filter(Boolean).map((n) => ({ key: n!.id, changes: { labels: Array.from(new Set([...n!.labels, labelId])) } })))
}

// ---------- ordering ----------
/** Move `dragId` to sit just before `targetId` in a list sorted by position desc. */
export async function moveBefore(list: Note[], dragId: string, targetId: string, pinned?: boolean) {
  const others = list.filter((n) => n.id !== dragId)
  const ti = others.findIndex((n) => n.id === targetId)
  if (ti < 0) return
  const above = others[ti - 1]
  const target = others[ti]
  const pos = above ? (above.position + target.position) / 2 : target.position + 1
  await patchNote(dragId, { position: pos, ...(pinned !== undefined ? { pinned } : {}) })
}

// ---------- version history ----------
const MAX_VERSIONS = 40
/**
 * Which snapshots to keep: the latest 15 in full detail, then one per day for a month,
 * then one per week — at most 40. Recent work is fine-grained, old history stays useful but small.
 */
export function thinPlan<T extends { id: string; at: number }>(versions: T[], now = Date.now()): string[] {
  const sorted = [...versions].sort((a, b) => b.at - a.at)
  const keep = new Set<string>(); const seen = new Set<string>()
  sorted.forEach((v, i) => {
    if (i < 15) { keep.add(v.id); return }
    const ageDays = (now - v.at) / 86400000
    const d = new Date(v.at)
    const bucket = ageDays <= 30 ? `d${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : `w${Math.floor(v.at / (7 * 86400000))}`
    if (!seen.has(bucket)) { seen.add(bucket); keep.add(v.id) }
  })
  const kept = sorted.filter((v) => keep.has(v.id)).slice(0, MAX_VERSIONS)
  const keepIds = new Set(kept.map((v) => v.id))
  return sorted.filter((v) => !keepIds.has(v.id)).map((v) => v.id)
}

export async function snapshot(n: Note) {
  if (n.locked || !n.content?.length) return
  const all = await db.versions.where('noteId').equals(n.id).toArray()
  const last = all.reduce<Version | undefined>((m, v) => (!m || v.at > m.at ? v : m), undefined)
  if (last && last.title === n.title && JSON.stringify(last.content) === JSON.stringify(n.content)) return
  const v: Version = { id: nanoid(10), noteId: n.id, at: Date.now(), title: n.title, content: n.content, words: n.words }
  await db.versions.add(v)
  const drop = thinPlan([...all, v])
  if (drop.length) await db.versions.bulkDelete(drop)
}

/** Apply the keep-plan to every note's history (Settings → Storage). */
export async function thinAllHistory() {
  const all = await db.versions.toArray()
  const by = new Map<string, Version[]>()
  for (const v of all) by.set(v.noteId, [...(by.get(v.noteId) ?? []), v])
  // history of notes that no longer exist is dropped too
  const live = new Set(await db.notes.toCollection().primaryKeys() as string[])
  const drop: string[] = []
  for (const [noteId, list] of by) drop.push(...(live.has(noteId) ? thinPlan(list) : list.map((v) => v.id)))
  await db.versions.bulkDelete(drop)
  return drop.length
}

// ---------- templates ----------
export async function allTemplates(): Promise<Template[]> {
  return [...BUILTIN_TEMPLATES, ...(await db.templates.toArray())]
}
export async function saveAsTemplate(n: Note, name: string) {
  await db.templates.add({ id: nanoid(10), name, emoji: '📄', title: n.title, content: n.content })
}
export async function createFromTemplate(t: Template, extra: Partial<Note> = {}) {
  return createNote({ title: t.title, content: structuredClone(t.content), ...extra })
}

// ---------- daily note ----------
export async function openDaily(date = new Date()): Promise<Note> {
  const key = todayKey(date)
  const existing = await db.notes.where('daily').equals(key).filter((n) => n.trashedAt === null).first()
  if (existing) return existing
  const at = new Date(date); at.setHours(9, 0, 0, 0)
  const isToday = key === todayKey()
  return createFromTemplate(BUILTIN_TEMPLATES[0], { title: dailyTitle(date), daily: key, icon: '☀️', ...(isToday ? {} : { createdAt: at.getTime() }) })
}

/** Add a task to a daily note: fills the first empty checkbox, else appends after the last one. */
export async function addDailyTask(text: string, date = new Date()) {
  const n = await openDaily(date)
  if (n.locked) return n
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = structuredClone(n.content ?? [])
  const empty = content.findIndex((b) => b.type === 'checkListItem' && !(typeof b.content === 'string' ? b.content : (b.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')).trim())
  const item = { type: 'checkListItem', props: { checked: false }, content: text }
  if (empty >= 0) content[empty] = { ...content[empty], content: [{ type: 'text', text, styles: {} }] }
  else {
    let last = -1; content.forEach((b, i) => { if (b.type === 'checkListItem') last = i })
    content.splice(last >= 0 ? last + 1 : content.length, 0, item)
  }
  await updateNote(n.id, { content })
  return n
}

// ---------- passcode ----------
const VERIFIER = 'folio-passcode-ok'
export async function hasPasscode() { return !!(await db.meta.get('passcode')) }
export async function setPasscode(pass: string) { await db.meta.put({ key: 'passcode', value: await encryptJSON(VERIFIER, pass) }) }
export async function checkPasscode(pass: string) {
  const row = await db.meta.get('passcode'); if (!row) return false
  try { return (await decryptJSON(row.value as never, pass)) === VERIFIER } catch { return false }
}

// ---------- backup ----------
export interface Backup { app: 'folio'; version: 2 | 3; exportedAt: string; device?: string; notes: Note[]; labels: Label[]; templates: Template[]; blobs?: { id: string; type: string; data: string }[] }

/** Everything worth keeping, as one plain object (locked notes stay encrypted inside it). */
export async function collectBackup(device?: string): Promise<Backup> {
  const notes = await db.notes.toArray(), templates = await db.templates.toArray()
  // Images travel once each, base64-encoded, next to the notes that use them.
  const ids = new Set<string>()
  for (const n of notes) { collectRefs(n.content, ids); for (const u of [n.cover, n.image]) if (isRef(u)) ids.add(u.slice(REF.length)) }
  for (const t of templates) collectRefs(t.content, ids)
  const blobs: NonNullable<Backup['blobs']> = []
  for (const id of ids) { const b = await db.blobs.get(id); if (b) blobs.push({ id, type: b.type, data: toB64(new Uint8Array(await b.blob.arrayBuffer())) }) }
  return { app: 'folio', version: 3, exportedAt: new Date().toISOString(), device, notes, labels: await db.labels.toArray(), templates, blobs }
}

export async function exportAll() {
  download(`folio-backup-${todayKey()}.json`, new Blob([JSON.stringify(await collectBackup())], { type: 'application/json' }))
}
export function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
/** Merge a backup into this device: newer edits win, nothing local is deleted. Returns how many notes changed. */
export async function mergeBackup(data: Partial<Backup>) {
  if (data?.app !== 'folio') throw new Error('Not a Folio backup file')
  let changed = 0
  const pending = new Map<string, StoredBlob>()
  for (const b of data.blobs ?? []) { const blob = new Blob([unb64(b.data) as BlobPart], { type: b.type }); pending.set(b.id, { id: b.id, blob, type: b.type, size: blob.size, at: Date.now() }) }
  await db.transaction('rw', [db.notes, db.labels, db.templates, db.blobs], async () => {
    await db.labels.bulkPut(data.labels ?? [])
    await db.templates.bulkPut((data.templates ?? []).map((t) => ({ ...t, content: externalize(t.content, pending) })))
    for (const raw of (data.notes ?? []) as Note[]) {
      const defaults: Partial<Note> = { position: raw.updatedAt, locked: false, cipher: null, daily: null, words: 0 }
      const n = { ...defaults, ...raw } as Note
      // older backups carry images inline — store them once like everything else
      if (!n.locked) n.content = externalize(n.content, pending)
      if (isData(n.cover)) n.cover = storeDataUrl(n.cover, pending)
      if (isData(n.image)) n.image = storeDataUrl(n.image, pending)
      const cur = await db.notes.get(n.id)
      if (!cur || revOf(cur) < revOf(n)) { await db.notes.put({ ...n, rev: revOf(n) }); changed++ }
    }
    await db.blobs.bulkPut([...pending.values()])
  })
  return changed
}

export async function importAll(file: File) {
  const data = JSON.parse(await file.text())
  await mergeBackup(data)
  return (data.notes ?? []).length as number
}

export type { ColorKey }

/** The note that quick-added tasks go into (created on first use). */
export async function inboxNote() {
  const id = (await db.meta.get('inboxId'))?.value as string | undefined
  const cur = id ? await db.notes.get(id) : undefined
  if (cur && cur.trashedAt === null) return cur
  const n = await createNote({ title: 'Inbox', icon: '📥' })
  await db.meta.put({ key: 'inboxId', value: n.id })
  return n
}
/** Append a checklist item to a note. */
export async function addTaskTo(noteId: string, text: string) {
  const n = await db.notes.get(noteId); if (!n) return
  const content = [...(n.content ?? [])]
  // drop a trailing empty paragraph so the list stays tidy
  while (content.length && content[content.length - 1]?.type === 'paragraph' && !(Array.isArray(content[content.length - 1].content) ? content[content.length - 1].content.length : content[content.length - 1].content)) content.pop()
  content.push({ type: 'checkListItem', props: { checked: false }, content: [{ type: 'text', text, styles: {} }] })
  await updateNote(noteId, { content })
}
