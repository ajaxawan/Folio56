import { useSyncExternalStore } from 'react'

/** What the Sync dialog should show. Anything in the app can open it. */
export type SyncRequest = null | { start?: 'home' | 'join'; bytes?: Uint8Array }
let current: SyncRequest = null
const subs = new Set<() => void>()
const emit = (r: SyncRequest) => { current = r; subs.forEach((f) => f()) }
export const openSync = (r: Exclude<SyncRequest, null> = {}) => emit(r)
export const closeSync = () => emit(null)
export const useSyncRequest = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => current)
