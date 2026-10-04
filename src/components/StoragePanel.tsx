import { Eraser, History, ImageOff, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cleanUnusedImages } from '../lib/blobs'
import { db, emptyTrash, thinAllHistory } from '../lib/db'
import { ensurePersistent } from '../lib/maintenance'

interface Breakdown { notes: number; images: number; imageCount: number; history: number; historyCount: number; wallpaper: number; other: number; trashed: number; usage: number; quota: number; persisted: boolean | null }

const size = (x: unknown) => new Blob([JSON.stringify(x)]).size
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`)

async function measure(): Promise<Breakdown> {
  let notes = 0, trashed = 0, images = 0, imageCount = 0, history = 0, historyCount = 0, other = 0, wallpaper = 0
  await db.notes.each((n) => { notes += size(n); if (n.trashedAt !== null) trashed++ })
  await db.blobs.each((b) => { images += b.size; imageCount++ })
  await db.versions.each((v) => { history += size(v); historyCount++ })
  await db.templates.each((t) => { other += size(t) })
  await db.labels.each((l) => { other += size(l) })
  const wp = (await db.meta.get('wallpaperImage'))?.value
  if (wp instanceof Blob) wallpaper = wp.size
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null
  return { notes, images, imageCount, history, historyCount, wallpaper, other, trashed, usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted }
}

/** Settings → Storage: what's using space on this device, and one-tap ways to free it. */
export function StoragePanel() {
  const [b, setB] = useState<Breakdown | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const refresh = useCallback(() => { measure().then(setB) }, [])
  useEffect(refresh, [refresh])

  const act = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setMsg('')
    try { setMsg(await fn()) } catch (e) { setMsg((e as Error).message) } finally { setBusy(null); refresh() }
  }

  if (!b) return <p className="text-[13px] text-muted">Measuring…</p>
  const parts = [
    { key: 'notes', label: 'Notes', bytes: b.notes, tone: 'var(--color-accent)' },
    { key: 'images', label: `Images (${b.imageCount})`, bytes: b.images, tone: 'color-mix(in srgb, var(--color-accent) 65%, #f0b35e)' },
    { key: 'history', label: `History (${b.historyCount})`, bytes: b.history, tone: 'color-mix(in srgb, var(--color-accent) 45%, #b59cff)' },
    { key: 'wallpaper', label: 'Wallpaper', bytes: b.wallpaper, tone: 'color-mix(in srgb, var(--color-accent) 30%, #5fcfc0)' },
    { key: 'other', label: 'Labels & templates', bytes: b.other, tone: 'var(--color-faint)' },
  ]
  const total = parts.reduce((a, p) => a + p.bytes, 0) || 1
  const btn = 'flex items-center justify-center gap-1.5 rounded-lg bg-wash px-2.5 py-2 text-[12.5px] hover:bg-wash-2 disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-wash" role="img" aria-label="Storage breakdown">
        {parts.map((p) => p.bytes > 0 && <span key={p.key} style={{ width: `${(p.bytes / total) * 100}%`, background: p.tone }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.tone }} /><span className="flex-1 text-muted">{p.label}</span><span className="tabular-nums text-ink-2">{fmtBytes(p.bytes)}</span></li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-[12px] text-faint">
        {b.persisted ? <ShieldCheck size={14} className="text-accent" /> : <ShieldAlert size={14} className="text-warn" />}
        {b.persisted ? 'Protected: the browser won’t clear Folio to free space.' : 'Not protected yet — the browser may clear data if space runs low. Install Folio as an app, or export a backup.'}
        {b.usage > 0 && <span className="ml-auto shrink-0 tabular-nums">{fmtBytes(b.usage)} used</span>}
      </p>
      {!b.persisted && <button type="button" className={btn} onClick={() => act('persist', async () => ((await ensurePersistent()) ? 'Storage is now protected.' : 'The browser said no — it usually allows this once Folio is installed or used regularly.'))}><ShieldCheck size={14} /> Ask to protect storage</button>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn} disabled={!!busy} onClick={() => act('img', async () => { const r = await cleanUnusedImages(); return r.count ? `Removed ${r.count} unused image${r.count === 1 ? '' : 's'} (${fmtBytes(r.freed)}).` : 'No unused images.' })}><ImageOff size={14} /> Clean up images</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => act('hist', async () => { const n = await thinAllHistory(); await cleanUnusedImages(); return n ? `Trimmed ${n} old snapshot${n === 1 ? '' : 's'}.` : 'History is already trim.' })}><History size={14} /> Trim history</button>
        <button type="button" className={btn} disabled={!!busy || !b.historyCount} onClick={() => confirm('Delete all version history on this device? Your notes stay as they are.') && act('clear', async () => { const n = await db.versions.count(); await db.versions.clear(); await cleanUnusedImages(); return `Deleted ${n} snapshot${n === 1 ? '' : 's'}.` })}><Eraser size={14} /> Clear history</button>
        <button type="button" className={btn} disabled={!!busy || !b.trashed} onClick={() => confirm(`Permanently delete ${b.trashed} note${b.trashed === 1 ? '' : 's'} in the trash?`) && act('trash', async () => { await emptyTrash(); await cleanUnusedImages(); return 'Trash emptied.' })}><Trash2 size={14} /> Empty trash{b.trashed ? ` (${b.trashed})` : ''}</button>
      </div>
      <p className="text-[12px] text-faint">History keeps your last 15 versions of each note, then one a day for a month, then one a week. Images used in several places are stored once. Recently added images are kept for 10 minutes before cleanup.</p>
      {msg && <p className="text-[13px] text-ink-2">{msg}</p>}
    </div>
  )
}
