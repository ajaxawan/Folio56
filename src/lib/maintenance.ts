// Quiet housekeeping after start-up: keep storage persistent, move old inline images
// into the image store, repair broken links, and trim what nobody uses any more.

import { cleanUnusedImages, migrateInlineImages } from './blobs'
import { db, thinAllHistory } from './db'
import type { Note } from '../types'

export interface Health { persisted: boolean | null; repaired: number; migrated: number; lastClean?: number }
export const health: Health = { persisted: null, repaired: 0, migrated: 0 }

/** Ask the browser not to evict Folio's data when the device runs low on space. */
export async function ensurePersistent() {
  try {
    if (!navigator.storage?.persist) return (health.persisted = null)
    health.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch { health.persisted = null }
  return health.persisted
}

/** Fix references that point nowhere (deleted parents, deleted labels, parent loops). Returns fixes made. */
export async function repair() {
  let fixed = 0
  await db.transaction('rw', db.notes, db.labels, async () => {
    const notes = await db.notes.toArray()
    const ids = new Set(notes.map((n) => n.id))
    const labelIds = new Set((await db.labels.toArray()).map((l) => l.id))
    const byId = new Map(notes.map((n) => [n.id, n]))
    for (const n of notes) {
      const changes: Partial<Note> = {}
      if (n.parentId && (!ids.has(n.parentId) || n.parentId === n.id)) changes.parentId = null
      else if (n.parentId) {
        // walk up; a loop means this page is its own ancestor
        const seen = new Set([n.id]); let p: string | null | undefined = n.parentId
        while (p && byId.has(p)) { if (seen.has(p)) { changes.parentId = null; break } seen.add(p); p = byId.get(p)!.parentId }
      }
      const labels = (n.labels ?? []).filter((l, i, a) => labelIds.has(l) && a.indexOf(l) === i)
      if (labels.length !== (n.labels ?? []).length) changes.labels = labels
      if (!Array.isArray(n.content)) changes.content = []
      if (Object.keys(changes).length) { await db.notes.update(n.id, { ...changes, rev: n.rev ?? n.updatedAt }); fixed++ }
    }
  })
  return fixed
}

const DAY = 86400000
export async function runMaintenance() {
  await ensurePersistent()
  try { health.migrated = (await migrateInlineImages()).moved } catch (e) { console.warn('[folio] image migration skipped', e) }
  try { health.repaired = await repair() } catch (e) { console.warn('[folio] repair skipped', e) }
  // V5.4: card previews now show a few lines of each code block — refresh them once.
  try {
    if (!(await db.meta.get('derive54'))?.value) {
      const { derive } = await import('./preview')
      await db.transaction('rw', db.notes, db.meta, async () => {
        const all = await db.notes.toArray()
        for (const n of all) if (!n.locked && Array.isArray(n.content)) { const d = derive(n.content); if (d.preview !== n.preview) await db.notes.update(n.id, { preview: d.preview }) }
        await db.meta.put({ key: 'derive54', value: Date.now() })
      })
    }
  } catch (e) { console.warn('[folio] preview refresh skipped', e) }
  const last = ((await db.meta.get('lastClean'))?.value as number | undefined) ?? 0
  if (Date.now() - last > DAY) {
    try { await thinAllHistory(); await cleanUnusedImages(); await db.meta.put({ key: 'lastClean', value: Date.now() }) } catch (e) { console.warn('[folio] cleanup skipped', e) }
  }
  health.lastClean = Date.now()
}
