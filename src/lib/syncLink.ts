// V6.4 Sync over Wi-Fi: the two devices swap a few QR codes to connect, then talk to each other
// directly over the local network (WebRTC data channel). No server is involved — there isn't even a
// STUN server, so the link only forms between devices that can reach each other on the same network.
//
// Handshake: device A shows its offer as Beam codes → device B scans it and shows its answer →
// device A scans that. Then, over the channel:
//   hello {id,name} → want {full} → bundle (bytes) → need {ids} → blob… → blobs-done → applied {at}
// Both sides run the same steps at once, so changes flow both ways in one go.
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { applyBundle, buildBundle, confirmSent, decodeBundle, deviceId, deviceName, encodeBundle, getPeers, missingRefs, type SyncResult } from './sync'
import { db } from './db'

export const SIGNAL_MAGIC = 0x53 // "S"
const SDP_DICT = strToU8('v=0\r\no=- 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate: 1 udp 2113937151 .local  typ host generation 0 network-cost 999\r\na=ice-ufrag:\r\na=ice-pwd:\r\na=ice-options:trickle\r\na=fingerprint:sha-256 \r\na=setup:actpass\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n')

export function encodeSignal(kind: 'offer' | 'answer', sdp: string): Uint8Array {
  const body = deflateSync(strToU8(sdp), { level: 9, dictionary: SDP_DICT })
  const out = new Uint8Array(body.length + 2); out[0] = SIGNAL_MAGIC; out[1] = kind === 'offer' ? 0x6f : 0x61; out.set(body, 2)
  return out
}
export const isSignal = (b: Uint8Array) => b[0] === SIGNAL_MAGIC && (b[1] === 0x6f || b[1] === 0x61)
export function decodeSignal(b: Uint8Array): { kind: 'offer' | 'answer'; sdp: string } {
  if (!isSignal(b)) throw new Error('That isn’t a Folio sync code.')
  return { kind: b[1] === 0x6f ? 'offer' : 'answer', sdp: strFromU8(inflateSync(b.subarray(2), { dictionary: SDP_DICT })) }
}

const waitIce = (pc: RTCPeerConnection, ms = 3000) => new Promise<void>((res) => {
  if (pc.iceGatheringState === 'complete') return res()
  const t = setTimeout(res, ms)
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res() } })
})
// Local network only: no STUN/TURN servers, nothing leaves the network.
const newPc = () => new RTCPeerConnection({ iceServers: [] })

export interface Link { pc: RTCPeerConnection; channel: Promise<RTCDataChannel> }

/** Device A: make the offer to show. */
export async function startOffer(): Promise<Link & { signal: Uint8Array; accept: (answer: Uint8Array) => Promise<void> }> {
  const pc = newPc()
  const dc = pc.createDataChannel('folio-sync', { ordered: true })
  const channel = new Promise<RTCDataChannel>((res) => { dc.onopen = () => res(dc) })
  await pc.setLocalDescription(await pc.createOffer())
  await waitIce(pc)
  return {
    pc, channel, signal: encodeSignal('offer', pc.localDescription!.sdp),
    accept: async (answer) => {
      const s = decodeSignal(answer)
      if (s.kind !== 'answer') throw new Error('That’s the start code. Scan the code the other device shows after it joins.')
      await pc.setRemoteDescription({ type: 'answer', sdp: s.sdp })
    },
  }
}

/** Device B: answer a scanned offer. */
export async function answerOffer(offer: Uint8Array): Promise<Link & { signal: Uint8Array }> {
  const s = decodeSignal(offer)
  if (s.kind !== 'offer') throw new Error('That’s a reply code. On the other device, start the sync, then scan its code.')
  const pc = newPc()
  const channel = new Promise<RTCDataChannel>((res) => { pc.ondatachannel = (e) => { const dc = e.channel; if (dc.readyState === 'open') res(dc); else dc.onopen = () => res(dc) } })
  await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp })
  await pc.setLocalDescription(await pc.createAnswer())
  await waitIce(pc)
  return { pc, channel, signal: encodeSignal('answer', pc.localDescription!.sdp) }
}

/** Waits for the channel, or gives up (devices not on the same network, or kept apart by the router). */
export function connect(link: Link, ms = 20_000): Promise<RTCDataChannel> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('nolink')), ms)
    link.pc.addEventListener('connectionstatechange', () => { if (link.pc.connectionState === 'failed') { clearTimeout(t); rej(new Error('nolink')) } })
    link.channel.then((c) => { clearTimeout(t); res(c) })
  })
}

// ---------------------------------------------------------------- the conversation
export interface SyncProgress { phase: string; sent: number; got: number; files: number }
export interface SyncSummary extends SyncResult { peer: string; sent: number; files: number }

const CHUNK = 16 * 1024

/** Runs one sync over an open channel. Both devices call this at the same time. */
export function runSync(dc: RTCDataChannel, onProgress: (p: SyncProgress) => void): Promise<SyncSummary> {
  dc.binaryType = 'arraybuffer'
  dc.bufferedAmountLowThreshold = 256 * 1024
  const prog: SyncProgress = { phase: 'Saying hello…', sent: 0, got: 0, files: 0 }
  let over = false
  const tell = (phase?: string) => { if (over) return; if (phase) prog.phase = phase; onProgress({ ...prog }) }
  const send = (o: object) => dc.send(JSON.stringify(o))
  const drain = () => new Promise<void>((r) => { if (dc.bufferedAmount < 1024 * 1024) r(); else dc.addEventListener('bufferedamountlow', () => r(), { once: true }) })
  const sendBytes = async (head: object, bytes: Uint8Array) => {
    send({ ...head, size: bytes.length })
    for (let i = 0; i < bytes.length; i += CHUNK) { await drain(); dc.send(bytes.slice(i, i + CHUNK)) }
  }

  return new Promise((resolve, reject) => {
    let peerId = '', peerName = '', myAt = 0
    let result: SyncResult | null = null
    let gotApplied = false, sentApplied = false
    let incoming: { head: { t: string; size: number; id?: string; type?: string }; parts: Uint8Array[]; have: number } | null = null
    let waitingBlobs = 0, theirBundleAt = 0
    const fail = (e: unknown) => { try { dc.close() } catch { /* closed */ } reject(e instanceof Error ? e : new Error(String(e))) }
    const finish = () => {
      if (!(gotApplied && sentApplied && result)) return
      over = true
      setTimeout(() => { try { dc.close() } catch { /* closed */ } }, 300)
      resolve({ ...result, peer: peerName, sent: prog.sent, files: prog.files })
    }
    dc.onclose = () => { if (!(gotApplied && sentApplied)) fail(new Error('The other device closed the sync.')) }

    const afterBlobs = async () => {
      send({ t: 'applied', at: theirBundleAt }); sentApplied = true; finish()
    }
    const onWhole = async (head: { t: string; size: number; id?: string; type?: string }, bytes: Uint8Array) => {
      if (head.t === 'bundle') {
        tell('Merging…')
        const b = decodeBundle(bytes); theirBundleAt = b.at; prog.got = b.notes.length
        result = await applyBundle({ ...b, ack: null })
        const need = await missingRefs()
        waitingBlobs = -1 // until the other side says how many it has
        send({ t: 'need', ids: need })
        if (!need.length) { waitingBlobs = 0; await afterBlobs() }
        else tell(`Getting ${need.length} picture${need.length === 1 ? '' : 's'} and recordings…`)
      } else if (head.t === 'blob' && head.id) {
        const blob = new Blob([bytes as BlobPart], { type: head.type || 'application/octet-stream' })
        await db.blobs.put({ id: head.id, blob, type: blob.type, size: blob.size, at: Date.now() })
        prog.files++; tell()
      }
    }

    // Messages are handled strictly one after another (some steps wait on the database).
    let queue = Promise.resolve()
    dc.onmessage = (e) => { queue = queue.then(() => handle(e)) }
    const handle = async (e: MessageEvent) => {
      try {
        if (typeof e.data !== 'string') {
          if (!incoming) return
          const part = new Uint8Array(e.data as ArrayBuffer)
          incoming.parts.push(part); incoming.have += part.length
          if (incoming.have >= incoming.head.size) {
            const all = new Uint8Array(incoming.have); let o = 0
            for (const p of incoming.parts) { all.set(p, o); o += p.length }
            const head = incoming.head; incoming = null
            await onWhole(head, all)
          }
          return
        }
        const m = JSON.parse(e.data)
        if (m.t === 'hello') {
          peerId = m.id; peerName = m.name
          const known = (await getPeers()).some((p) => p.id === peerId)
          send({ t: 'want', full: !known })
          tell(`Connected to ${peerName}`)
        } else if (m.t === 'want') {
          const b = await buildBundle(peerId || null, { full: m.full })
          myAt = b.at; prog.sent = b.notes.length
          tell(`Sending ${b.notes.length} note${b.notes.length === 1 ? '' : 's'}…`)
          await sendBytes({ t: 'bundle' }, encodeBundle({ ...b, ack: null }))
        } else if (m.t === 'bundle' || m.t === 'blob') {
          incoming = { head: m, parts: [], have: 0 }
          if (m.size === 0) { const head = m; incoming = null; await onWhole(head, new Uint8Array(0)) }
        } else if (m.t === 'need') {
          for (const id of m.ids as string[]) {
            const rec = await db.blobs.get(id)
            if (rec) await sendBytes({ t: 'blob', id, type: rec.type }, new Uint8Array(await rec.blob.arrayBuffer()))
          }
          send({ t: 'blobs-done' })
        } else if (m.t === 'blobs-done') {
          if (waitingBlobs !== 0) { waitingBlobs = 0; await afterBlobs() }
        } else if (m.t === 'applied') {
          await confirmSent(peerId, peerName, m.at || myAt)
          gotApplied = true; finish()
        }
      } catch (err) { fail(err) }
    }

    ;(async () => { send({ t: 'hello', id: await deviceId(), name: deviceName() }) })().catch(fail)
  })
}
