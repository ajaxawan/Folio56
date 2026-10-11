// V6.3 Folio Beam: send notes from one screen to another camera as a stream of QR codes.
// Nothing goes through a server, the internet or a chat app — the light from one screen carries it.
//
// The parcel bytes (the same packed notes a share link carries) are cut into blocks. The first pass
// shows every block once; after that come "mixed" codes, each about half the blocks XOR-ed together
// (a random linear fountain code). Almost any mixed code fills whatever gap a receiver has, so it can
// start at any moment and needs only a few codes more than there are blocks, however many it misses.
//
// Each code is "FB:" + Base45 (RFC 9285) of a 12-byte header and one block. Base45 uses only the
// characters QR's alphanumeric mode stores in 5.5 bits, so codes stay small and easy to read.
// Pure functions only, so they can be tested anywhere.

export const BEAM_PREFIX = 'FB:'
export const BLOCK = 240
const MAGIC = 0x42 // "B"
const VERSION = 1
const HEADER = 12

// ---------------------------------------------------------------- Base45
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
export function toBase45(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    let x = bytes[i] * 256 + bytes[i + 1]
    const c = x % 45; x = (x - c) / 45
    const d = x % 45; const e = (x - d) / 45
    out += B45[c] + B45[d] + B45[e]
  }
  if (bytes.length % 2) { const x = bytes[bytes.length - 1]; out += B45[x % 45] + B45[Math.floor(x / 45)] }
  return out
}
export function fromBase45(s: string): Uint8Array {
  const v = [...s].map((ch) => { const i = B45.indexOf(ch); if (i < 0) throw new Error('bad base45'); return i })
  const out: number[] = []
  for (let i = 0; i < v.length; i += 3) {
    if (i + 2 < v.length) { const x = v[i] + v[i + 1] * 45 + v[i + 2] * 2025; if (x > 65535) throw new Error('bad base45'); out.push(x >> 8, x & 255) }
    else if (i + 1 < v.length) { const x = v[i] + v[i + 1] * 45; if (x > 255) throw new Error('bad base45'); out.push(x) }
    else throw new Error('bad base45')
  }
  return Uint8Array.from(out)
}

// ---------------------------------------------------------------- which blocks a code holds
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/**
 * The blocks code number `k` carries, as a bit mask. Codes below `n` are the blocks themselves;
 * later ones mix about half the blocks at random, so almost any code helps whatever is missing.
 */
export function maskOf(k: number, n: number, sid: number): Uint32Array {
  const m = new Uint32Array(Math.ceil(n / 32))
  if (k < n) { m[k >> 5] |= 1 << (k & 31); return m }
  const r = rng(Math.imul(sid + 1, 2654435761) ^ Math.imul(k + 1, 40503))
  let any = false
  for (let i = 0; i < n; i++) if (r() < 0.5) { m[i >> 5] |= 1 << (i & 31); any = true }
  if (!any) { const i = Math.floor(r() * n); m[i >> 5] |= 1 << (i & 31) }
  return m
}
const lowBit = (m: Uint32Array) => { for (let w = 0; w < m.length; w++) if (m[w]) return w * 32 + (31 - Math.clz32(m[w] & -m[w])); return -1 }
const hasBit = (m: Uint32Array, i: number) => (m[i >> 5] >>> (i & 31)) & 1

// ---------------------------------------------------------------- sending
export interface BeamSender { n: number; sid: number; bytes: number; frame: (k: number) => string; order: (step: number) => number }

export function beamSender(data: Uint8Array, sid = Math.floor(Math.random() * 65536)): BeamSender {
  const n = Math.max(1, Math.ceil(data.length / BLOCK))
  if (n > 0xffff || data.length > 0xffffff) throw new Error('Too much to beam at once. Send fewer notes or leave the pictures out.')
  const block = (i: number) => { const b = new Uint8Array(BLOCK); b.set(data.subarray(i * BLOCK, Math.min(data.length, (i + 1) * BLOCK))); return b }
  const blocks = Array.from({ length: n }, (_, i) => block(i))
  const frame = (k: number) => {
    const body = new Uint8Array(BLOCK)
    const m = maskOf(k, n, sid)
    for (let i = 0; i < n; i++) if (hasBit(m, i)) xorInto(body, blocks[i])
    const h = Uint8Array.of(MAGIC, VERSION, sid >> 8, sid & 255, n >> 8, n & 255, (k >> 16) & 255, (k >> 8) & 255, k & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255)
    const out = new Uint8Array(HEADER + BLOCK); out.set(h); out.set(body, HEADER)
    return BEAM_PREFIX + toBase45(out)
  }
  // First pass: every block once. After that, only mixed codes — each fills a gap the receiver has.
  const order = (step: number) => (n === 1 ? 0 : step < n ? step : n + ((step - n) % 0xff0000))
  return { n, sid, bytes: data.length, frame, order }
}

// ---------------------------------------------------------------- receiving
export interface BeamProgress { n: number; have: number; done: boolean; codes: number }

export class BeamReceiver {
  sid = -1
  n = 0
  len = 0
  codes = 0
  /** Rows in echelon form, by their lowest block: what the codes seen so far say about the blocks. */
  private rows = new Map<number, { m: Uint32Array; d: Uint8Array }>()
  private seen = new Set<number>()

  /** Feed one scanned text. Returns progress, or null if it isn't a Beam code. */
  add(text: string): BeamProgress | null {
    if (!text.startsWith(BEAM_PREFIX)) return null
    let raw: Uint8Array
    try { raw = fromBase45(text.slice(BEAM_PREFIX.length)) } catch { return null }
    if (raw.length !== HEADER + BLOCK || raw[0] !== MAGIC || raw[1] !== VERSION) return null
    const sid = (raw[2] << 8) | raw[3], n = (raw[4] << 8) | raw[5], k = (raw[6] << 16) | (raw[7] << 8) | raw[8], len = (raw[9] << 16) | (raw[10] << 8) | raw[11]
    if (!n || len > n * BLOCK) return null
    if (sid !== this.sid || n !== this.n || len !== this.len) this.reset(sid, n, len) // a new beam started
    if (!this.seen.has(k) && this.rows.size < n) {
      this.seen.add(k); this.codes++
      this.insert(maskOf(k, n, sid), raw.slice(HEADER))
    }
    return this.progress()
  }

  progress(): BeamProgress { return { n: this.n, have: this.rows.size, done: this.n > 0 && this.rows.size === this.n, codes: this.codes } }

  /** The whole parcel, once every block is known. */
  result(): Uint8Array | null {
    if (!this.progress().done) return null
    const known: Uint8Array[] = []
    // back-substitute from the last block down
    for (let p = this.n - 1; p >= 0; p--) {
      const r = this.rows.get(p)!
      const d = r.d.slice()
      for (let i = p + 1; i < this.n; i++) if (hasBit(r.m, i)) xorInto(d, known[i])
      known[p] = d
    }
    const out = new Uint8Array(this.n * BLOCK)
    known.forEach((b, i) => out.set(b, i * BLOCK))
    return out.slice(0, this.len)
  }

  private reset(sid: number, n: number, len: number) {
    this.sid = sid; this.n = n; this.len = len; this.codes = 0
    this.rows = new Map(); this.seen = new Set()
  }

  private insert(m: Uint32Array, d: Uint8Array) {
    for (;;) {
      const p = lowBit(m)
      if (p < 0) return // nothing new in this code
      const r = this.rows.get(p)
      if (!r) { this.rows.set(p, { m, d }); return }
      for (let w = 0; w < m.length; w++) m[w] ^= r.m[w]
      xorInto(d, r.d)
    }
  }
}

function xorInto(a: Uint8Array, b: Uint8Array) { for (let j = 0; j < a.length; j++) a[j] ^= b[j] }
