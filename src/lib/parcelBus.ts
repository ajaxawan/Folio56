import { useSyncExternalStore } from 'react'

/** What the Send / Receive dialogs should show. Anything in the app can open them without prop-drilling. */
export type ParcelRequest =
  | { kind: 'send'; ids: string[] | 'all' }
  | { kind: 'receive'; link?: string }
  | null

let current: ParcelRequest = null
const subs = new Set<() => void>()
const emit = (r: ParcelRequest) => { current = r; subs.forEach((f) => f()) }

export const sendNotes = (ids: string[] | 'all') => emit({ kind: 'send', ids })
export const receiveParcel = (src: Omit<Extract<ParcelRequest, { kind: 'receive' }>, 'kind'> = {}) => emit({ kind: 'receive', ...src })
export const closeParcel = () => emit(null)
export const useParcelRequest = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => current)
