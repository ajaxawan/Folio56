// A tiny app-wide toast: toast('Archived', undoFn) from anywhere; <Toaster/> shows it.
export interface ToastMsg { id: number; msg: string; undo?: () => void }
let n = 0
export function toast(msg: string, undo?: () => void) {
  document.dispatchEvent(new CustomEvent<ToastMsg>('folio:toast', { detail: { id: ++n, msg, undo } }))
}
