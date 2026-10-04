import type { Cipher } from '../types'

// Passcode-based encryption for locked notes: PBKDF2(SHA-256, 250k) → AES-GCM 256.
// The passcode itself is never stored; only a verifier (an encrypted known string) is.

const enc = new TextEncoder()
const dec = new TextDecoder()
// Chunked so multi-MB payloads (backups with images) don't overflow the call stack.
export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function keyFrom(passcode: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptJSON(value: unknown, passcode: string): Promise<Cipher> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(passcode, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { iv: b64(iv), salt: b64(salt), data: b64(data) }
}

export async function decryptJSON<T = unknown>(c: Cipher, passcode: string): Promise<T> {
  const key = await keyFrom(passcode, unb64(c.salt))
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, key, unb64(c.data))
  return JSON.parse(dec.decode(data)) as T
}

/** Raw-bytes variant (used by parcels). Salt/iv are returned alongside the ciphertext. */
export async function sealBytes(bytes: Uint8Array, passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(passcode, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes as BufferSource))
  return { salt, iv, data }
}

export async function openBytes(salt: Uint8Array, iv: Uint8Array, data: Uint8Array, passcode: string) {
  const key = await keyFrom(passcode, salt)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource))
}

// ---- passcode session (memory only; cleared on reload or "Lock now") ----
let sessionPasscode: string | null = null
export const getSessionPasscode = () => sessionPasscode
export const setSessionPasscode = (p: string | null) => { sessionPasscode = p }
