import { Lock } from 'lucide-react'
import { useState } from 'react'
import { checkPasscode, setPasscode } from '../lib/db'
import { setSessionPasscode } from '../lib/crypto'
import { Modal } from './ui'

/** mode "set": create a passcode. mode "enter": verify it. Resolves with the passcode (kept in memory for this session). */
export function PasscodeDialog({ mode, onDone, onCancel }: { mode: 'set' | 'enter'; onDone: (pass: string) => void; onCancel: () => void }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (mode === 'set') {
      if (a.length < 4) return setErr('Use at least 4 characters.')
      if (a !== b) return setErr("Passcodes don't match.")
      setBusy(true); await setPasscode(a)
    } else {
      setBusy(true)
      if (!(await checkPasscode(a))) { setBusy(false); return setErr('Wrong passcode.') }
    }
    setSessionPasscode(a); onDone(a)
  }
  return (
    <Modal title={<span className="flex items-center gap-2"><Lock size={17} /> {mode === 'set' ? 'Create a passcode' : 'Enter passcode'}</span>} onClose={onCancel} width="max-w-sm">
      <form onSubmit={submit} className="space-y-3">
        {mode === 'set' && <p className="text-[13px] leading-5 text-muted">Locked notes are encrypted on this device with this passcode. There is no recovery — if you forget it, locked notes can't be opened.</p>}
        <input autoFocus type="password" inputMode="text" autoComplete="off" value={a} onChange={(e) => setA(e.target.value)} placeholder="Passcode"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-[15px] outline-none focus:border-accent" />
        {mode === 'set' && <input type="password" autoComplete="off" value={b} onChange={(e) => setB(e.target.value)} placeholder="Confirm passcode"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-[15px] outline-none focus:border-accent" />}
        {err && <p className="text-[13px] text-red-500">{err}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-accent py-2.5 text-[14px] font-medium text-on-accent disabled:opacity-60">{busy ? 'Working…' : mode === 'set' ? 'Set passcode' : 'Unlock'}</button>
      </form>
    </Modal>
  )
}
