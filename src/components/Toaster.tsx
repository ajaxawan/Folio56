import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ToastMsg } from '../lib/toast'

export function Toaster() {
  const [t, setT] = useState<ToastMsg | null>(null)
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent<ToastMsg>).detail)
    document.addEventListener('folio:toast', on)
    return () => document.removeEventListener('folio:toast', on)
  }, [])
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 4500); return () => clearTimeout(id) }, [t])
  if (!t) return null
  return (
    <div role="status" className="animate-pop fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[66] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-line bg-raised px-4 py-2.5 text-[13.5px] text-ink shadow-2xl md:bottom-8">
      <Check size={15} className="shrink-0 text-accent" /><span className="truncate">{t.msg}</span>
      {t.undo && <button type="button" onClick={() => { t.undo!(); setT(null) }} className="shrink-0 font-semibold text-accent">Undo</button>}
    </div>
  )
}
