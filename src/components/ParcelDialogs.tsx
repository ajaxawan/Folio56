import { Camera, Check, ClipboardPaste, Copy, Image as ImageIcon, KeyRound, Link2, Lock, QrCode, RefreshCw, Send, Share2 } from 'lucide-react'
import { BeamScanner, BeamSend } from './Beam'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { friendlyDate, senderName } from '../lib/device'
import {
  accept, collect, fromHash, isEncrypted, LINK_HARD_LIMIT, LINK_SOFT_LIMIT, NeedsCode, newCode, pack, preview, shrinkImages, stripImages, toLink, unpack, WrongCode,
  type Incoming, type ParcelContent,
} from '../lib/parcel'
import { closeParcel, useParcelRequest } from '../lib/parcelBus'
import { Modal, Segmented, Switch } from './ui'

/** Pictures ride along in a beam while it stays under about 100 codes. */
const BEAM_IMAGES_MAX = 24_000
const primary = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[14px] font-medium text-on-accent hover:opacity-90 disabled:opacity-50'
const secondary = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2 disabled:opacity-50'

/** Mounted once in App; shows whichever share dialog was requested. */
export function ParcelHost({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const req = useParcelRequest()
  if (!req) return null
  return req.kind === 'send'
    ? <SendDialog ids={req.ids} />
    : <ReceiveDialog key={req.link ?? (req.scan ? 'scan' : 'paste')} link={req.link} scan={req.scan} onOpenNote={onOpenNote} />
}

// ---------------------------------------------------------------- Send

type Built = { url: string; images: number; withImages: boolean }

function SendDialog({ ids }: { ids: string[] | 'all' }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof collect>> | null>(null)
  const [at] = useState(() => Date.now())
  const [protect, setProtect] = useState(true)
  const [code, setCode] = useState(newCode)
  const [settledCode, setSettledCode] = useState(code)
  const [codeInLink, setCodeInLink] = useState(false)
  const [images, setImages] = useState<boolean | null>(null) // null = decide automatically
  const [link, setLink] = useState<Built | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // V6.3: the same notes as a link, or beamed as QR codes
  const [mode, setMode] = useState<'link' | 'beam'>('link')
  const [beam, setBeam] = useState<{ bytes: Uint8Array; link: string; images: number; withImages: boolean } | null>(null)

  useEffect(() => {
    (async () => {
      const list = ids === 'all' ? (await db.notes.filter((n) => n.trashedAt === null && !n.parentId && !n.templateDraft).primaryKeys()) as string[] : ids
      setInfo(await collect(list))
    })()
  }, [ids])

  // Re-encrypt only after typing pauses (each build runs PBKDF2).
  useEffect(() => { const t = setTimeout(() => setSettledCode(code), 350); return () => clearTimeout(t) }, [code])

  const from = senderName()
  const activeCode = protect && settledCode.trim() ? settledCode : null
  const content = useMemo<ParcelContent | null>(() => info && { v: 1, from, at, notes: info.notes, labels: info.labels }, [info, from, at])

  useEffect(() => {
    if (!content) return
    let live = true
    ;(async () => {
      const slim = stripImages(content.notes)
      const without = toLink(await pack({ ...content, notes: slim.notes }, activeCode), activeCode, codeInLink)
      let url = without, withImages = false
      if (slim.removed && images !== false) {
        // pictures are redrawn smaller first, so many more links can keep them
        const full = toLink(await pack({ ...content, notes: await shrinkImages(content.notes) }, activeCode), activeCode, codeInLink)
        // Automatic: keep images only while the link stays comfortably short.
        if (images === true || full.length <= LINK_SOFT_LIMIT) { url = full; withImages = true }
      }
      if (live) setLink({ url, images: slim.removed, withImages })
    })()
    return () => { live = false }
  }, [content, activeCode, codeInLink, images])

  useEffect(() => {
    if (mode !== 'beam' || !content) return
    let live = true
    ;(async () => {
      // Beam goes screen to camera, so there's no code; pictures stay while the loop stays short.
      const slim = stripImages(content.notes)
      let bytes = await pack({ ...content, notes: slim.notes }, null), withImages = false
      if (slim.removed && images !== false) {
        const full = await pack({ ...content, notes: await shrinkImages(content.notes) }, null)
        if (images === true || full.length <= BEAM_IMAGES_MAX) { bytes = full; withImages = true }
      }
      if (live) setBeam({ bytes, link: toLink(bytes, null, false), images: slim.removed, withImages })
    })()
    return () => { live = false }
  }, [mode, content, images])

  const count = info?.notes.length ?? 0
  const chosen = ids === 'all' ? null : ids.length
  const subpages = chosen !== null ? Math.max(0, count - chosen + (info?.skippedLocked ?? 0)) : 0
  const tooLong = !!link && link.url.length > LINK_HARD_LIMIT
  const long = !!link && link.url.length > LINK_SOFT_LIMIT

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1600) } catch { /* clipboard blocked */ }
  }

  return (
    <Modal title={<span className="flex items-center gap-2"><Send size={17} /> {mode === 'beam' ? 'Share with Beam' : 'Share as a link'}</span>} onClose={closeParcel}>
      {!info ? <p className="text-[14px] text-muted">Packing…</p> : count === 0 ? (
        <p className="text-[14px] text-muted">{info.skippedLocked ? 'Locked notes can’t be shared. Remove the lock first.' : 'Nothing to share.'}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">
            <span className="font-medium text-ink">{count} note{count === 1 ? '' : 's'}</span>
            {subpages > 0 && ` · ${subpages} sub-page${subpages === 1 ? '' : 's'} included`}
            {info.skippedLocked > 0 && ` · ${info.skippedLocked} locked skipped`}
          </p>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'link', label: <span className="flex items-center justify-center gap-1.5"><Link2 size={14} /> Link</span> }, { value: 'beam', label: <span className="flex items-center justify-center gap-1.5"><QrCode size={14} /> Beam (QR)</span> }]} />

          {mode === 'beam' ? (
            <>
              {beam && beam.images > 0 && (
                <Switch label={<span className="flex items-center gap-2 text-[13.5px]"><ImageIcon size={14} className="text-muted" /> Include {beam.images} image{beam.images === 1 ? '' : 's'} <span className="text-faint">(more codes)</span></span>}
                  checked={beam.withImages} onChange={(v) => setImages(v)} />
              )}
              <BeamSend bytes={beam?.bytes ?? null} link={beam?.link ?? null} />
            </>
          ) : (<>

          <div className="rounded-xl border border-line p-3">
            <Switch label={<span className="flex items-center gap-2 text-[14px]"><Lock size={15} /> Protect with a code</span>} checked={protect} onChange={setProtect} />
            {protect && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="Link code"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[15px] tracking-wide text-accent-ink outline-none focus:border-accent" />
                  <button type="button" title="New code" aria-label="New code" onClick={() => setCode(newCode())} className="rounded-lg bg-wash p-2.5 hover:bg-wash-2"><RefreshCw size={15} /></button>
                  <button type="button" title="Copy code" aria-label="Copy code" onClick={() => copy(code, 'code')} className="rounded-lg bg-wash p-2.5 hover:bg-wash-2">{copied === 'code' ? <Check size={15} /> : <Copy size={15} />}</button>
                </div>
                <p className="mt-1.5 text-[12px] text-faint">Encrypted on this device. Send the code separately — or put it in the link below.</p>
                <div className="mt-1"><Switch label={<span className="text-[13.5px]">Put the code in the link <span className="text-faint">(anyone with it can open)</span></span>} checked={codeInLink} onChange={setCodeInLink} /></div>
              </>
            )}
          </div>

          {link && link.images > 0 && (
            <Switch label={<span className="flex items-center gap-2 text-[13.5px]"><ImageIcon size={14} className="text-muted" /> Include {link.images} image{link.images === 1 ? '' : 's'} <span className="text-faint">(makes the link longer)</span></span>}
              checked={link.withImages} onChange={(v) => setImages(v)} />
          )}

          {link ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <Link2 size={14} className="shrink-0 text-muted" />
                <span className="truncate font-mono text-[12px] text-muted" title={link.url} data-testid="share-link">{link.url}</span>
              </div>
              <p className={`text-[12px] leading-[1.5] ${tooLong || long ? 'text-warn' : 'text-faint'}`}>
                {link.url.length.toLocaleString()} characters · the notes travel inside the link — no server ever sees them.
                {tooLong ? ' Too long for one link: share fewer notes, leave images out, or use Settings → Export all.' : long ? ' Some chat apps cut very long links.' : ''}
              </p>
              <div className="flex gap-2">
                <button type="button" className={primary} disabled={tooLong} onClick={() => copy(link.url, 'link')}>{copied === 'link' ? <Check size={16} /> : <Copy size={16} />} {copied === 'link' ? 'Copied' : 'Copy link'}</button>
                {!!navigator.share && <button type="button" className={secondary} disabled={tooLong} onClick={() => navigator.share({ url: link.url, title: 'Folio56' }).catch(() => {})}><Share2 size={16} /> Share…</button>}
              </div>
            </div>
          ) : <p className="text-[13px] text-muted">Packing…</p>}
          </>)}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Receive

const STATUS: Record<Incoming['status'], { label: string; tone: string }> = {
  new: { label: 'New', tone: 'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] text-accent-ink' },
  newer: { label: 'Update', tone: 'bg-amber-400/15 text-star' },
  same: { label: 'Already here', tone: 'bg-wash text-faint' },
  older: { label: 'Older copy', tone: 'bg-wash text-faint' },
}

function ReceiveDialog({ link, scan: startScan, onOpenNote }: { link?: string; scan?: boolean; onOpenNote: (id: string) => void }) {
  const initial = link ? fromHash(link) : null
  const initialBytes = initial?.bytes, initialCode = initial?.code ?? null
  const [bytes, setBytes] = useState<Uint8Array | null>(initialBytes ?? null)
  const [pasted, setPasted] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [needCode, setNeedCode] = useState(false)
  const [content, setContent] = useState<ParcelContent | null>(null)
  const [items, setItems] = useState<Incoming[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ added: number; updated: number; first?: string } | null>(null)
  const [scanning, setScanning] = useState(!!startScan)

  const load = async (b: Uint8Array, c: string | null) => {
    setErr(''); setBusy(true)
    try {
      const parcel = await unpack(b, c)
      const list = await preview(parcel)
      setContent(parcel); setItems(list); setNeedCode(false)
      setPicked(new Set(list.filter((i) => i.status === 'new' || i.status === 'newer').map((i) => i.note.id)))
    } catch (e) {
      if (e instanceof NeedsCode || e instanceof WrongCode) setNeedCode(true)
      if (!(e instanceof NeedsCode)) setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  const start = (b: Uint8Array, c: string | null) => {
    setBytes(b)
    if (isEncrypted(b) && !c) setNeedCode(true); else void load(b, c)
  }

  useEffect(() => {
    if (initialBytes) start(initialBytes, initialCode ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPasted = (text: string) => {
    const m = text.match(/#p=[A-Za-z0-9_.-]+/)
    const p = m && fromHash(m[0])
    if (!p) return setErr("That doesn't look like a Folio link.")
    setErr(''); if (p.code) setCode(p.code); start(p.bytes, p.code)
  }
  const pasteFromClipboard = async () => { try { const t = await navigator.clipboard.readText(); setPasted(t); openPasted(t) } catch { setErr('Paste the link into the box instead.') } }

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const doImport = async () => {
    if (!content) return
    setBusy(true)
    try {
      const r = await accept(content, picked)
      const tops = content.notes.filter((n) => picked.has(n.id) && (!n.parentId || !picked.has(n.parentId)))
      setDone({ ...r, first: tops.length === 1 ? tops[0].id : undefined })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const byId = new Map(items.map((i) => [i.note.id, i]))
  const depth = (n: Incoming['note']) => { let d = 0, p = n.parentId; while (p && byId.has(p) && d < 4) { d++; p = byId.get(p)!.note.parentId } return d }

  return (
    <Modal title={<span className="flex items-center gap-2">{scanning && !bytes ? <QrCode size={18} /> : <Link2 size={18} />} {done ? 'Added to Folio' : scanning && !bytes ? 'Receive with Beam' : 'Open a shared link'}</span>} onClose={closeParcel}>
      {done ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent"><Check size={28} strokeWidth={3} /></div>
          <p className="text-[15px]">{done.added > 0 && `${done.added} added`}{done.added > 0 && done.updated > 0 && ' · '}{done.updated > 0 && `${done.updated} updated`}{!done.added && !done.updated && 'Nothing imported'}</p>
          <div className="flex gap-2">
            {done.first && <button type="button" className={primary} onClick={() => { closeParcel(); onOpenNote(done.first!) }}>Open note</button>}
            <button type="button" className={done.first ? secondary : primary} onClick={closeParcel}>Done</button>
          </div>
        </div>
      ) : !bytes && scanning ? (
        <div className="space-y-3">
          <BeamScanner onResult={(r) => { setScanning(false); if ('bytes' in r) start(r.bytes, null); else { setPasted(r.link); openPasted(r.link) } }} />
          <button type="button" className={secondary + ' w-full'} onClick={() => setScanning(false)}><Link2 size={15} /> Paste a link instead</button>
        </div>
      ) : !bytes ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); openPasted(pasted) }}>
          <p className="text-[13.5px] leading-5 text-muted">Folio links open by themselves when you tap them. If a link opened in another browser, paste it here.</p>
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} placeholder="https://…/#p=…" spellCheck={false}
            className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent" />
          {err && <p className="text-[13px] text-danger">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={() => { setErr(''); setScanning(true) }}><Camera size={16} /> Scan a code</button>
            {!!navigator.clipboard?.readText && <button type="button" className={secondary} onClick={pasteFromClipboard}><ClipboardPaste size={16} /> Paste</button>}
            <button className={primary} disabled={!pasted.trim()}>Open</button>
          </div>
        </form>
      ) : needCode && !content ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void load(bytes, code) }}>
          <p className="text-[13.5px] text-muted">This link is protected. Enter the code the sender gave you.</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 focus-within:border-accent">
            <KeyRound size={16} className="text-muted" />
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="word-word-word-00" spellCheck={false} autoCapitalize="off" autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-[15px] outline-none" />
          </div>
          {err && <p className="text-[13px] text-danger">{err}</p>}
          <button className={primary + ' w-full'} disabled={busy || !code.trim()}>{busy ? 'Opening…' : 'Open'}</button>
        </form>
      ) : content ? (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">From <span className="text-ink">{content.from || 'another device'}</span> · {friendlyDate(content.at)} · {items.length} note{items.length === 1 ? '' : 's'}</p>
          <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
            {items.map((i) => (
              <label key={i.note.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-wash" style={{ paddingLeft: 8 + depth(i.note) * 18 }}>
                <input type="checkbox" checked={picked.has(i.note.id)} onChange={() => toggle(i.note.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 truncate text-[14px]">{i.note.icon ? `${i.note.icon} ` : ''}{i.note.title || cleanPreview(i.note.preview) || 'Untitled'}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
              </label>
            ))}
          </div>
          {err && <p className="text-[13px] text-danger">{err}</p>}
          <button type="button" className={primary + ' w-full'} disabled={busy || picked.size === 0} onClick={doImport}>
            {busy ? 'Adding…' : `Add ${picked.size} note${picked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : (
        <p className="text-[13.5px] text-muted">{err || 'Opening…'}</p>
      )}
    </Modal>
  )
}

// Card previews carry invisible markers (heading / code / table) — drop them for a plain title.
const MARKERS = new RegExp('[\\u0001-\\u0003]', 'g')
const cleanPreview = (p?: string) => p?.split('\n')[0]?.replace(MARKERS, '')
