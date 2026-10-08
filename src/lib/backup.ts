// V5.9 backups: a gentle reminder, optional automatic backups into a folder you choose (Chrome/Edge
// on laptops and Android tablets), and a preview before restoring. Nothing ever leaves the device.
import { collectBackup, db, download, mergeBackup, revOf, type Backup } from './db'
import { todayKey } from './templates'
import type { Note } from '../types'
import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from './mobile'

const DAY = 86400e3
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: object) => Promise<PermissionState>
  requestPermission?: (o: object) => Promise<PermissionState>
}

export const canUseFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Live "last backup" time for small status lines (sidebar). */
export function useLastBackup() {
  const [t, setT] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    const read = () => { lastBackup().then(setT).catch(() => setT(null)) }
    read(); document.addEventListener('folio:backup', read)
    return () => document.removeEventListener('folio:backup', read)
  }, [])
  return t
}
export function backupStatus(t: number | null | undefined, noteCount: number) {
  if (t === undefined) return { text: '', late: false }
  if (!t) return { text: noteCount ? 'Not backed up yet' : 'Notes stay in this browser', late: noteCount >= 5 }
  const d = Math.floor((Date.now() - t) / DAY)
  return { text: `Backed up ${d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}`, late: d >= 7 }
}

export async function lastBackup() { return ((await db.meta.get('lastBackup'))?.value as number | undefined) ?? null }
async function markBackedUp() { await db.meta.put({ key: 'lastBackup', value: Date.now() }); document.dispatchEvent(new CustomEvent('folio:backup')) }

export async function backupFolder() { return ((await db.meta.get('backupDir'))?.value as DirHandle | undefined) ?? null }
export async function chooseFolder() {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker
  const dir = await pick({ id: 'folio-backups', mode: 'readwrite', startIn: 'documents' })
  await db.meta.put({ key: 'backupDir', value: dir })
  await writeToFolder(dir)
  return dir
}
export async function stopFolder() { await db.meta.delete('backupDir') }

async function permitted(dir: DirHandle, ask: boolean) {
  let p = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  if (p !== 'granted' && ask) p = (await dir.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
  return p === 'granted'
}

/** One file per day (folio-backup-YYYY-MM-DD.json); keeps the newest 10 and tidies away older ones. */
async function writeToFolder(dir: DirHandle) {
  const name = `folio-backup-${todayKey()}.json`
  const file = await dir.getFileHandle(name, { create: true })
  const w = await file.createWritable()
  await w.write(new Blob([JSON.stringify(await collectBackup())], { type: 'application/json' }))
  await w.close()
  const old: string[] = []
  for await (const [n] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) if (/^folio-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)) old.push(n)
  for (const n of old.sort().reverse().slice(10)) await dir.removeEntry(n).catch(() => undefined)
  await markBackedUp()
  return name
}

/** Back up now: into the chosen folder if there is one, otherwise as a download. */
export async function backupNow(): Promise<string> {
  const dir = await backupFolder()
  if (dir && (await permitted(dir, true))) return `Saved ${await writeToFolder(dir)} in “${dir.name}”`
  download(`folio-backup-${todayKey()}.json`, new Blob([JSON.stringify(await collectBackup())], { type: 'application/json' }))
  await markBackedUp()
  return 'Backup downloaded'
}

/** Called quietly at start-up: if a folder is set and still allowed, keep a daily backup there. */
export async function autoBackup() {
  const dir = await backupFolder(); if (!dir) return false
  const last = await lastBackup()
  if (last && Date.now() - last < DAY) return false
  if (!(await permitted(dir, false))) return false // needs a click — the reminder will offer it
  await writeToFolder(dir)
  return true
}

/**
 * V6.2: why this browser's notes could disappear without anyone deleting them.
 * 'safari' — Safari (and every iPhone/iPad browser) may clear a site's data after 7 days without a visit,
 *            unless it's added to the Home Screen / Dock.
 * 'eviction' — the browser hasn't promised to keep Folio's storage, so it may clear it when space runs low.
 */
export type BackupRisk = null | 'safari' | 'eviction'
export async function backupRisk(): Promise<BackupRisk> {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const safari = isIOS || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox|Android/.test(ua))
  if (safari && !isStandalone()) return 'safari'
  try { if (navigator.storage?.persisted && !(await navigator.storage.persisted())) return 'eviction' } catch { /* unknown */ }
  return null
}

/**
 * Whether to show the reminder: some notes worth keeping, and no recent backup — a week normally,
 * sooner when the browser might clear its storage on its own.
 */
export async function needsReminder(noteCount: number) {
  const risk = await backupRisk()
  if (noteCount < (risk ? 3 : 5)) return false
  const snooze = (await db.meta.get('backupSnooze'))?.value as number | undefined
  if (snooze && Date.now() < snooze) return false
  const last = await lastBackup()
  if (last) return Date.now() - last > (risk ? 3 : 7) * DAY
  const first = await db.notes.orderBy('updatedAt').first()
  return !!first && Date.now() - Math.min(first.createdAt, first.updatedAt) > (risk ? 1 : 3) * DAY
}
export async function snoozeReminder(days = 3) { await db.meta.put({ key: 'backupSnooze', value: Date.now() + days * DAY }) }

// ---------------------------------------------------------------- restore with a preview
export interface RestorePreview { data: Backup; total: number; added: number; updated: number; same: number; older: number; exportedAt: string; device?: string; sample: string[] }

export async function previewBackup(file: File): Promise<RestorePreview> {
  let data: Backup
  try { data = JSON.parse(await file.text()) } catch { throw new Error('That file isn’t a Folio backup.') }
  if (data?.app !== 'folio' || !Array.isArray(data.notes)) throw new Error('That file isn’t a Folio backup.')
  let added = 0, updated = 0, same = 0, older = 0
  const sample: string[] = []
  for (const n of data.notes as Note[]) {
    const cur = await db.notes.get(n.id)
    if (!cur) { added++; if (sample.length < 5 && n.trashedAt === null) sample.push(n.title || 'Untitled') }
    else if (revOf(cur) < revOf(n)) updated++
    else if (revOf(cur) === revOf(n)) same++
    else older++
  }
  return { data, total: data.notes.length, added, updated, same, older, exportedAt: data.exportedAt, device: data.device, sample }
}
export const applyRestore = (p: RestorePreview) => mergeBackup(p.data)
