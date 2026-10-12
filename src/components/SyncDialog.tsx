// V6.4 "Sync my devices": the dialog. Over Wi-Fi when the two devices can reach each other, with
// QR codes (Folio Beam) when they can't. You start it; it ends when both devices are up to date.
import { ArrowLeftRight, Check, Laptop, QrCode, RefreshCw, ScanLine, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { friendlyDate } from '../lib/device'
import { addSmallImages, applyBundle, buildBundle, decodeBundle, deviceName, encodeBundle, forgetPeer, getPeers, isBundle, justGot, rememberGot, type Peer, type SyncResult } from '../lib/sync'
import { answerOffer, connect, isSignal, runSync, startOffer, type Link, type SyncProgress, type SyncSummary } from '../lib/syncLink'
import { closeSync, useSyncRequest } from '../lib/syncBus'
import { BeamScanner, BeamSend } from './Beam'
import { DoneMark, Modal } from './ui'

const primary = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[14px] font-medium text-on-accent hover:opacity-90 disabled:opacity-50'
const secondary = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-wash px-3 py-2.5 text-[14px] hover:bg-wash-2 disabled:opacity-50'
const quiet = 'text-[13px] text-accent-ink underline-offset-2 hover:underline'

type Step =
  | { k: 'home' }
  | { k: 'offer'; signal: Uint8Array }
  | { k: 'scanAnswer' }
  | { k: 'scanOffer' }
  | { k: 'answer'; signal: Uint8Array }
  | { k: 'connecting' }
  | { k: 'syncing'; p: SyncProgress }
  | { k: 'done'; s: SyncSummary }
  | { k: 'nolink' }
  | { k: 'codesPick' }
  | { k: 'codesShow'; bytes: Uint8Array; to: string; reply: boolean; pics: { included: number; left: number }; count: number }
  | { k: 'codesScan' }
  | { k: 'codesGot'; r: SyncResult; from: { id: string; name: string }; replied: boolean }
  | { k: 'error'; msg: string }

export function SyncHost({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const req = useSyncRequest()
  if (!req) return null
  return <SyncDialog key={req.bytes ? 'bytes' : req.start ?? 'home'} start={req.start} bytes={req.bytes} onOpenNote={onOpenNote} />
}

function SyncDialog({ start, bytes, onOpenNote }: { start?: 'home' | 'join'; bytes?: Uint8Array; onOpenNote: (id: string) => void }) {
  const [step, setStep] = useState<Step>(start === 'join' ? { k: 'scanOffer' } : { k: 'home' })
  const [peers, setPeers] = useState<Peer[]>([])
  const link = useRef<(Link & { accept?: (a: Uint8Array) => Promise<void> }) | null>(null)
  const sentReply = useRef(false)
  const refreshPeers = () => getPeers().then((p) => setPeers(p.sort((a, b) => b.lastSync - a.lastSync)))

  useEffect(() => { refreshPeers(); return () => { try { link.current?.pc.close() } catch { /* closed */ } } }, [])
  useEffect(() => { if (bytes) void onScanned(bytes) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => setStep({ k: 'error', msg: (e as Error).message || 'Something went wrong.' })

  // ---- Wi-Fi
  /** The device that started waits briefly once it has the reply; the one that joined keeps its code up a while. */
  const run = async (l: Link, starter: boolean) => {
    if (starter) setStep({ k: 'connecting' })
    let dc: RTCDataChannel
    try { dc = await connect(l, starter ? 20_000 : 180_000) } catch { setStep({ k: 'nolink' }); return }
    try {
      const s = await runSync(dc, (p) => setStep({ k: 'syncing', p }))
      setStep({ k: 'done', s }); refreshPeers()
    } catch (e) { fail(e) }
  }
  const beginOffer = async () => {
    try { const o = await startOffer(); link.current = o; setStep({ k: 'offer', signal: o.signal }) } catch (e) { fail(e) }
  }

  // ---- anything scanned: a reply, an offer, or a bundle of changes
  const onScanned = async (b: Uint8Array) => {
    try {
      if (isSignal(b)) {
        if (b[1] === 0x61) { // an answer: we're the device that started
          if (!link.current?.accept) throw new Error('That’s a reply code. Start the sync on this device first.')
          await link.current.accept(b); void run(link.current, true)
        } else {
          const a = await answerOffer(b); link.current = a
          setStep({ k: 'answer', signal: a.signal })
          void run(a, false)
        }
      } else if (isBundle(b)) {
        const bundle = decodeBundle(b)
        const r = await applyBundle(bundle); rememberGot(bundle); refreshPeers()
        setStep({ k: 'codesGot', r, from: bundle.from, replied: sentReply.current })
      } else throw new Error('That code isn’t for syncing. To open shared notes, use Receive.')
    } catch (e) { fail(e) }
  }

  // ---- codes only
  const showCodes = async (to: string | null, reply: boolean) => {
    try {
      const b = await buildBundle(to, { skip: to ? justGot.get(to) : undefined })
      const pics = await addSmallImages(b)
      sentReply.current = true // we've sent ours: what comes back is their answer
      setStep({ k: 'codesShow', bytes: encodeBundle(b), to: to ?? '', reply, pics, count: b.notes.length })
    } catch (e) { fail(e) }
  }

  const scanning = step.k === 'scanAnswer' || step.k === 'scanOffer' || step.k === 'codesScan'
  const title = step.k === 'done' || step.k === 'codesGot' ? 'Synced' : step.k.startsWith('codes') ? 'Sync with codes' : 'Sync my devices'
  const icon = (n: string) => (/phone|android|iphone|ipad|tablet/i.test(n) ? <Smartphone size={16} className="shrink-0 text-muted" /> : <Laptop size={16} className="shrink-0 text-muted" />)

  return (
    <Modal title={<span className="flex items-center gap-2"><ArrowLeftRight size={17} /> {title}</span>} onClose={closeSync}>
      <div className="space-y-4" data-testid="sync" data-step={step.k}>
        {step.k === 'home' && (
          <>
            <p className="text-[13.5px] leading-6 text-ink-2">Bring two of your devices up to date with each other. Notes go straight from one to the other over your Wi-Fi — no account, no server, nothing online.</p>
            <ol className="space-y-1.5 text-[13px] leading-5 text-muted">
              <li><b className="text-ink">1.</b> On one device, tap <b className="text-ink-2">Start</b>.</li>
              <li><b className="text-ink">2.</b> On the other, tap <b className="text-ink-2">Join</b> and point its camera at the code.</li>
              <li><b className="text-ink">3.</b> Point the first device’s camera at the code that appears. Done.</li>
            </ol>
            <div className="flex gap-2">
              <button type="button" className={primary} onClick={beginOffer}><Wifi size={16} /> Start</button>
              <button type="button" className={secondary} onClick={() => setStep({ k: 'scanOffer' })}><ScanLine size={16} /> Join</button>
            </div>
            <button type="button" className={quiet} onClick={() => setStep({ k: 'codesPick' })}>Not on the same Wi-Fi? Sync with codes instead</button>
            {peers.length > 0 && (
              <div className="border-t border-line pt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Synced with</div>
                {peers.map((p) => (
                  <div key={p.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    {icon(p.name)}
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.name}</span>
                    <span className="shrink-0 text-[12px] text-faint">{p.lastSync ? friendlyDate(p.lastSync) : 'never'}</span>
                    <button type="button" aria-label={`Forget ${p.name}`} title="Forget this device (the next sync sends everything)" onClick={async () => { await forgetPeer(p.id); refreshPeers() }}
                      className="rounded p-1 text-faint opacity-0 hover:bg-wash hover:text-ink group-hover:opacity-100 focus:opacity-100 coarse:opacity-100"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12px] leading-[1.5] text-faint">Notes changed on both devices are kept twice, so nothing is lost. Locked notes stay on their own device. This is {deviceName()}.</p>
          </>
        )}

        {step.k === 'offer' && (
          <>
            <BeamSend bytes={step.signal} link={null} hint="On your other device: Settings → Sync my devices → Join (or Receive), and point its camera here." />
            <button type="button" className={primary + ' w-full'} onClick={() => setStep({ k: 'scanAnswer' })}><ScanLine size={16} /> Next: scan the code it shows</button>
          </>
        )}

        {step.k === 'answer' && (
          <>
            <BeamSend bytes={step.signal} link={null} hint="Now point the first device’s camera here. The sync starts by itself." />
          </>
        )}

        {scanning && (
          <BeamScanner onResult={(r) => { if ('bytes' in r) void onScanned(r.bytes); else fail(new Error('That’s a share link, not a sync code. Use Receive to open it.')) }} />
        )}
        {step.k === 'scanOffer' && <p className="text-center text-[12.5px] text-muted">Point the camera at the code on the device where you tapped Start.</p>}

        {(step.k === 'connecting' || step.k === 'syncing') && (
          <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
            <RefreshCw size={28} className="animate-spin text-accent" />
            <p className="text-[14.5px] text-ink">{step.k === 'connecting' ? 'Connecting over Wi-Fi…' : step.p.phase}</p>
            {step.k === 'syncing' && (step.p.sent > 0 || step.p.got > 0 || step.p.files > 0) && (
              <p className="text-[12.5px] tabular-nums text-muted">Sent {step.p.sent} · received {step.p.got}{step.p.files ? ` · ${step.p.files} files` : ''}</p>
            )}
            <p className="text-[12px] text-faint">Keep both devices open.</p>
          </div>
        )}

        {step.k === 'nolink' && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-line px-4 py-5 text-center">
              <WifiOff size={26} className="text-muted" />
              <p className="text-[14px] text-ink">The devices couldn’t reach each other over Wi-Fi.</p>
              <p className="text-[12.5px] leading-5 text-muted">Both need to be on the same network. Some guest and office networks keep devices apart, and mobile data won’t work.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondary} onClick={() => setStep({ k: 'home' })}>Try again</button>
              <button type="button" className={primary} onClick={() => setStep({ k: 'codesPick' })}><QrCode size={16} /> Sync with codes</button>
            </div>
          </div>
        )}

        {step.k === 'codesPick' && (
          <>
            <p className="text-[13.5px] leading-6 text-ink-2">This device shows its changes as moving codes; the other device scans them with <b className="text-ink">Receive</b>, then shows its own changes back. Slower than Wi-Fi, but it works anywhere.</p>
            <div className="text-[12px] font-semibold uppercase tracking-[.1em] text-muted">Which device?</div>
            <div className="space-y-1">
              {peers.map((p) => (
                <button key={p.id} type="button" onClick={() => showCodes(p.id, false)} className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left hover:border-accent/50">
                  {icon(p.name)}<span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span><span className="text-[12px] text-faint">changes since {friendlyDate(p.since || p.lastSync)}</span>
                </button>
              ))}
              <button type="button" onClick={() => showCodes(null, false)} className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-line px-3 py-2.5 text-left text-[14px] hover:border-accent/50">
                <QrCode size={16} className="shrink-0 text-muted" /> {peers.length ? 'Another device (sends everything)' : 'My other device (the first sync sends everything)'}
              </button>
            </div>
            <button type="button" className={quiet} onClick={() => setStep({ k: 'home' })}>Back to Wi-Fi sync</button>
          </>
        )}

        {step.k === 'codesShow' && (
          <>
            {step.count === 0
              ? <p className="rounded-xl bg-wash px-3 py-2.5 text-[13px] text-ink-2">Nothing changed here since the last sync — the code just says hello, so the other device can send its changes.</p>
              : <p className="text-[13px] text-muted"><b className="text-ink">{step.count} note{step.count === 1 ? '' : 's'}</b> to send{step.pics.included ? ` · ${step.pics.included} picture${step.pics.included === 1 ? '' : 's'}` : ''}{step.pics.left ? ` · ${step.pics.left} larger picture${step.pics.left === 1 ? '' : 's'} will come with the next Wi-Fi sync` : ''}</p>}
            <BeamSend bytes={step.bytes} link={null} hint={step.reply ? 'Point the first device’s camera here (it’s waiting to scan your changes).' : 'On the other device: Receive (or Sync my devices → Join) and point its camera here.'} />
            {step.reply
              ? <button type="button" className={primary + ' w-full'} onClick={closeSync}><Check size={16} /> Done</button>
              : <button type="button" className={primary + ' w-full'} onClick={() => setStep({ k: 'codesScan' })}><ScanLine size={16} /> Next: scan its changes</button>}
          </>
        )}

        {(step.k === 'done' || step.k === 'codesGot') && (
          <Summary r={step.k === 'done' ? step.s : step.r} peer={step.k === 'done' ? step.s.peer : step.from.name} sent={step.k === 'done' ? step.s.sent : undefined} files={step.k === 'done' ? step.s.files : 0}
            onOpen={(id) => { closeSync(); onOpenNote(id) }}>
            {step.k === 'codesGot' && !step.replied
              ? <div className="flex gap-2">
                  <button type="button" className={secondary} onClick={closeSync}>Not now</button>
                  <button type="button" className={primary} onClick={() => showCodes(step.from.id, true)}><QrCode size={16} /> Send my changes back</button>
                </div>
              : <button type="button" className={primary + ' w-full'} onClick={closeSync}><Check size={16} /> Done</button>}
          </Summary>
        )}

        {step.k === 'error' && (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl bg-wash px-3 py-3 text-[13.5px] text-ink-2">{step.msg}</p>
            <button type="button" className={secondary + ' w-full'} onClick={() => setStep({ k: 'home' })}>Start over</button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Summary({ r, peer, sent, files, onOpen, children }: { r: SyncResult; peer: string; sent?: number; files: number; onOpen: (id: string) => void; children: React.ReactNode }) {
  const got = r.added + r.updated + r.trashed
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <DoneMark size={48} />
        <p className="text-[15px] text-ink">Up to date with {peer}</p>
        <p className="text-[13px] tabular-nums text-muted" data-testid="sync-summary">
          {got === 0 && !r.conflicts.length ? 'Nothing new came in' : [r.added && `${r.added} new`, r.updated && `${r.updated} updated`, r.trashed && `${r.trashed} moved to Trash`].filter(Boolean).join(' · ')}
          {sent !== undefined && ` · ${sent} sent`}{files ? ` · ${files} files` : ''}
        </p>
      </div>
      {r.conflicts.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-1.5 text-[13px] text-ink-2"><b className="text-ink">Changed on both devices</b> — both versions are kept. Look them over and delete the one you don’t need.</p>
          {r.conflicts.map((c) => <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[13.5px] text-accent-ink hover:bg-wash">{c.title}</button>)}
        </div>
      )}
      {children}
    </div>
  )
}
