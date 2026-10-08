import { FolderOpen, HardDriveDownload, ShieldCheck, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { applyRestore, backupFolder, backupNow, backupRisk, canUseFolder, chooseFolder, lastBackup, needsReminder, previewBackup, snoozeReminder, stopFolder, type BackupRisk, type RestorePreview } from '../lib/backup'
import { isIOS } from '../lib/mobile'
import { pickFile } from '../lib/image'
import { toast } from '../lib/toast'
import { Modal } from './ui'

const ago = (t: number | null) => {
  if (!t) return 'never'
  const d = Math.floor((Date.now() - t) / 86400e3)
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

/** A quiet reminder at the top of Notes when nothing has been backed up for a while. */
export function BackupReminder({ noteCount }: { noteCount: number }) {
  const [show, setShow] = useState(false)
  const [last, setLast] = useState<number | null>(null)
  const [risk, setRisk] = useState<BackupRisk>(null)
  const [folder, setFolder] = useState(true)
  const check = useCallback(() => { needsReminder(noteCount).then(setShow); lastBackup().then(setLast); backupRisk().then(setRisk); backupFolder().then((d) => setFolder(!!d)) }, [noteCount])
  useEffect(() => { check(); document.addEventListener('folio:backup', check); return () => document.removeEventListener('folio:backup', check) }, [check])
  if (!show) return null
  return (
    <div role="status" className="animate-pop relative mb-3 mt-1 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card/80 px-4 py-3 pr-11">
      <ShieldCheck size={18} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1 basis-[220px] text-[13.5px] leading-5 text-ink-2">
        <b className="font-medium text-ink">Keep a copy of your notes.</b> They live only in this browser{last ? ` — last backup ${ago(last)}` : ', and they haven’t been backed up yet'}.
        {risk === 'safari' && <span className="mt-0.5 block text-muted">Safari can clear a website’s data after 7 days without a visit. {isIOS ? 'Adding Folio56 to your Home Screen keeps it safe.' : 'Adding Folio56 to the Dock (File → Add to Dock) keeps it safe.'}</span>}
        {risk === 'eviction' && <span className="mt-0.5 block text-muted">This browser hasn’t promised to keep Folio56’s storage, so it may clear it if the device runs low on space.</span>}
      </p>
      <button type="button" onClick={async () => { try { toast(await backupNow()); setShow(false) } catch (e) { toast((e as Error).message) } }}
        className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-on-accent">Back up now</button>
      {canUseFolder() && !folder && (
        <button type="button" onClick={async () => { try { const d = await chooseFolder(); toast(`Backed up to “${d.name}”. Folio56 will keep a daily copy there.`); setShow(false) } catch { /* cancelled */ } }}
          className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-ink-2 hover:bg-wash">Back up daily to a folder…</button>
      )}
      <button type="button" aria-label="Remind me later" title="Remind me in a few days" onClick={() => { snoozeReminder(); setShow(false) }}
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-wash"><X size={16} /></button>
    </div>
  )
}

/** Settings → Backups: when, where, and restoring with a preview. */
export function BackupPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [last, setLast] = useState<number | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const refresh = useCallback(() => { lastBackup().then(setLast); backupFolder().then((d) => setFolder(d?.name ?? null)) }, [])
  useEffect(() => { refresh(); document.addEventListener('folio:backup', refresh); return () => document.removeEventListener('folio:backup', refresh) }, [refresh])
  const btn = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2'
  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] leading-5 text-muted">Notes live only in this browser on this device. Last backup: <b className="font-medium text-ink-2">{ago(last)}</b>.</p>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={async () => { try { onMessage(await backupNow()) } catch (e) { onMessage((e as Error).message) } }}><HardDriveDownload size={16} /> Back up now</button>
        <button type="button" className={btn} onClick={async () => {
          const f = await pickFile('application/json,.json'); if (!f) return
          try { setPreview(await previewBackup(f)) } catch (e) { onMessage((e as Error).message) }
        }}><Upload size={16} /> Restore…</button>
      </div>
      {canUseFolder() && (
        <div className="rounded-xl border border-line px-3 py-2.5 text-[13px]">
          {folder ? (
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-ink-2">Daily backups go to <b className="font-medium text-ink">{folder}</b></span>
              <button type="button" onClick={async () => { try { await chooseFolder(); refresh() } catch { /* cancelled */ } }} className="rounded-md px-2 py-1 text-muted hover:bg-wash hover:text-ink">Change</button>
              <button type="button" onClick={async () => { await stopFolder(); refresh(); onMessage('Automatic backups stopped.') }} className="rounded-md px-2 py-1 text-muted hover:bg-wash hover:text-ink">Stop</button>
            </div>
          ) : (
            <button type="button" onClick={async () => { try { const d = await chooseFolder(); refresh(); onMessage(`Backed up to “${d.name}”. Folio will keep a daily copy there.`) } catch { /* cancelled */ } }}
              className="flex w-full items-center gap-2 text-left text-ink-2 hover:text-ink">
              <FolderOpen size={15} className="shrink-0 text-accent" /><span className="flex-1">Back up automatically to a folder…</span><span className="text-[12px] text-faint">one file a day, last 10 kept</span>
            </button>
          )}
        </div>
      )}
      {preview && <RestoreDialog preview={preview} onClose={() => setPreview(null)} onDone={(n) => { setPreview(null); onMessage(n ? `Restored — ${n} note${n === 1 ? '' : 's'} added or updated.` : 'Nothing to restore — this device already has everything in that backup.') }} />}
    </div>
  )
}

function RestoreDialog({ preview: p, onClose, onDone }: { preview: RestorePreview; onClose: () => void; onDone: (changed: number) => void }) {
  const [busy, setBusy] = useState(false)
  const when = p.exportedAt ? new Date(p.exportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown date'
  const rows: [string, number, string][] = [
    ['New to this device', p.added, 'will be added'],
    ['Newer in the backup', p.updated, 'will be updated'],
    ['Same as here', p.same, 'left as they are'],
    ['Newer on this device', p.older, 'kept — your newer edits win'],
  ]
  return (
    <Modal title="Restore a backup" onClose={onClose}>
      <p className="mb-3 text-[13.5px] text-muted">Backup from {when}{p.device ? ` · ${p.device}` : ''} · {p.total} notes. Restoring never deletes anything on this device.</p>
      <ul className="mb-3 divide-y divide-line rounded-xl border border-line text-[14px]">
        {rows.map(([k, n, what]) => (
          <li key={k} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 text-ink-2">{k}</span>
            <span className={`tabular-nums font-semibold ${n && (k.startsWith('New to') || k.startsWith('Newer in')) ? 'text-accent-ink' : 'text-ink'}`}>{n}</span>
            <span className="w-44 text-right text-[12.5px] text-faint">{what}</span>
          </li>
        ))}
      </ul>
      {p.sample.length > 0 && <p className="mb-3 text-[12.5px] text-muted">Including: {p.sample.map((s) => `“${s}”`).join(', ')}{p.added > p.sample.length ? '…' : ''}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-muted hover:bg-wash">Cancel</button>
        <button type="button" disabled={busy || p.added + p.updated === 0} onClick={async () => { setBusy(true); try { onDone(await applyRestore(p)) } finally { setBusy(false) } }}
          className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50">{busy ? 'Restoring…' : p.added + p.updated ? `Restore ${p.added + p.updated} note${p.added + p.updated === 1 ? '' : 's'}` : 'Nothing to restore'}</button>
      </div>
    </Modal>
  )
}
