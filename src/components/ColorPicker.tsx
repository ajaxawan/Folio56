import { Check, Droplet } from 'lucide-react'
import { COLOR_KEYS, COLOR_NAMES, swatch } from '../lib/colors'
import { usePrefs } from '../lib/prefs'
import type { ColorKey } from '../types'

export function ColorPicker({ value, onChange }: { value?: ColorKey; onChange: (c: ColorKey) => void }) {
  const { dark } = usePrefs()
  return (
    <div className="grid grid-cols-6 gap-1.5 p-1 sm:flex">
      {COLOR_KEYS.map((k) => (
        <button key={k} type="button" title={COLOR_NAMES[k]} aria-label={COLOR_NAMES[k]} onClick={() => onChange(k)}
          className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${value === k ? 'border-accent' : k === 'default' ? 'border-line' : 'border-transparent'}`}
          style={{ background: swatch(k, dark) }}>
          {k === 'default' && value !== k && <Droplet size={14} className="text-muted" />}
          {value === k && <Check size={14} className="text-ink" />}
        </button>
      ))}
    </div>
  )
}
