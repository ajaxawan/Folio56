import { AlertTriangle, Download, RefreshCw, Sparkles } from 'lucide-react'
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { exportAll } from '../lib/db'

/**
 * Catches a crash in part of the app and shows a calm screen instead of a blank page.
 * Notes are saved continuously to this device, so reloading never loses work.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; area?: 'app' | 'editor'; onBack?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[folio] crash', error, info.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const editor = this.props.area === 'editor'
    return (
      <div role="alert" className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-pop p-6 text-center text-ink shadow-2xl">
          <AlertTriangle className="mx-auto mb-3 text-warn" size={28} />
          <h2 className="font-title text-[20px] font-semibold">{editor ? 'This note hit a snag' : 'Something went wrong'}</h2>
          <p className="mt-2 text-[14px] leading-6 text-muted">Your notes are saved on this device — nothing was lost. {editor ? 'Go back and open it again.' : 'Reloading usually fixes it.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {editor && this.props.onBack && <button type="button" onClick={() => { this.setState({ error: null }); this.props.onBack!() }} className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-on-accent">Back to notes</button>}
            <button type="button" onClick={() => location.reload()} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[14px] ${editor ? 'bg-wash hover:bg-wash-2' : 'bg-accent font-medium text-on-accent'}`}><RefreshCw size={15} /> Reload</button>
            <button type="button" onClick={() => exportAll()} className="flex items-center gap-2 rounded-lg bg-wash px-4 py-2 text-[14px] hover:bg-wash-2"><Download size={15} /> Export a backup</button>
          </div>
          <details className="mt-4 text-left text-[12px] text-faint"><summary className="cursor-pointer">Details</summary><pre className="mt-2 whitespace-pre-wrap break-words font-mono">{String(error?.message ?? error)}</pre></details>
        </div>
      </div>
    )
  }
}

/** "A new version is ready" — the app never swaps itself out from under you mid-sentence. */
export function UpdateToast() {
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
    import('virtual:pwa-register').then(({ registerSW }) => {
      const fn = registerSW({ onNeedRefresh: () => setUpdate(() => fn) })
    }).catch(() => {})
  }, [])
  if (!update || hidden) return null
  return (
    <div role="status" className="animate-rise fixed bottom-20 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-pop py-1.5 pl-4 pr-1.5 text-[13.5px] text-ink shadow-2xl md:bottom-6">
      <Sparkles size={15} className="text-accent" /> A new version of Folio is ready
      <button type="button" onClick={() => setHidden(true)} className="rounded-full px-3 py-1.5 text-muted hover:bg-wash">Later</button>
      <button type="button" onClick={() => update(true)} className="rounded-full bg-accent px-3.5 py-1.5 font-medium text-on-accent">Update</button>
    </div>
  )
}
