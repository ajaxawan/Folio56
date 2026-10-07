import { ArrowLeft, Copy, Download, FilePlus2, LayoutTemplate, Pencil, Search, Star, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Template } from '../types'
import { pickFile } from '../lib/image'
import { usePhone } from '../lib/mobile'
import { toast } from '../lib/toast'
import {
  ALL_CATEGORIES, AUTO_HELP, MY, blankTemplate, blocksFor, deleteTemplate, duplicateTemplate, everyTemplate, exportTemplateFile, fieldsOf,
  getDefaults, importTemplateFile, instantiate, openDraft, setDefault, usage, type Defaults, type Field, type Values,
} from '../lib/templateKit'
import { TemplateThumb } from './TemplateThumb'
import { Switch } from './ui'

export type GalleryMode = 'new' | 'insert'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any

/**
 * The template gallery: browse by category, see a live preview of each page, answer the template's
 * questions and create — PowerPoint-style. Also where your own templates are edited, shared and managed.
 */
export function TemplateGallery({ mode = 'new', onClose, onCreated, onInsert, onEdit, labelIds = [] }: {
  mode?: GalleryMode; onClose: () => void; onCreated: (noteId: string) => void; onInsert?: (blocks: Block[]) => void
  onEdit: (draftNoteId: string) => void; labelIds?: string[]
}) {
  const phone = usePhone()
  const [all, setAll] = useState<Template[] | null>(null)
  const [used, setUsed] = useState<Record<string, { n: number; at: number }>>({})
  const [defaults, setDefaults] = useState<Defaults>({})
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [values, setValues] = useState<Values>({})
  const [busy, setBusy] = useState(false)
  const search = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [list, u, d] = await Promise.all([everyTemplate(), usage(), getDefaults()])
    setAll(list); setUsed(u); setDefaults(d)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!phone) search.current?.focus() }, [phone])

  const recent = useMemo(() => (all ?? []).filter((t) => used[t.id]).sort((a, b) => used[b.id].at - used[a.id].at).slice(0, 8), [all, used])
  const mine = useMemo(() => (all ?? []).filter((t) => !t.builtin), [all])
  const cats = useMemo(() => {
    const extra = [...new Set(mine.map((t) => t.category!).filter((c) => !ALL_CATEGORIES.includes(c)))]
    return ['All', ...(recent.length ? ['Recent'] : []), ...ALL_CATEGORIES.filter((c) => c !== MY), ...extra, MY]
  }, [mine, recent.length])
  const count = (c: string) => c === 'All' ? (all?.length ?? 0) : c === 'Recent' ? recent.length : c === MY ? mine.length : (all ?? []).filter((t) => t.category === c).length

  const shown = useMemo(() => {
    const list = all ?? []
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) return list.filter((t) => { const hay = `${t.name} ${t.description ?? ''} ${t.category ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
    if (cat === 'Recent') return recent
    if (cat === MY) return mine
    if (cat === 'All') return list
    return list.filter((t) => t.category === cat)
  }, [all, cat, q, recent, mine])

  const current = (all ?? []).find((t) => t.id === sel) ?? null
  const fields = useMemo(() => (current ? fieldsOf(current) : []), [current])
  useEffect(() => { setValues({}) }, [sel])

  const use = async (t: Template, vals: Values = values) => {
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'insert' && onInsert) onInsert(await blocksFor(t, vals))
      else onCreated((await instantiate(t, vals, { labels: labelIds })).id)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  const edit = async (t: Template) => {
    const id = await openDraft(t)
    if (t.builtin) toast(`Editing your own copy of “${t.name}” — the original stays as it is.`)
    onEdit(id)
  }
  const remove = async (t: Template) => {
    await deleteTemplate(t.id); setSel(null); await load()
    toast(`Deleted “${t.name}”`)
  }
  const importFile = async () => {
    const f = await pickFile('application/json,.json'); if (!f) return
    try { const t = await importTemplateFile(f); await load(); setCat(MY); setSel(t.id); toast(`Added “${t.name}” to your templates`) } catch (e) { toast((e as Error).message) }
  }
  const newBlank = async () => { const t = await blankTemplate(); onEdit(await openDraft(t)) }

  // keyboard: Esc closes (or backs out of a preview on phones); Enter uses the selected template
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (phone && sel) setSel(null); else onClose() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [phone, sel, onClose])

  const verb = mode === 'insert' ? 'Insert' : 'Create'
  const detail = current && (
    <Detail key={current.id} t={current} fields={fields} values={values} setValues={setValues} verb={verb} busy={busy} phone={phone}
      defaults={defaults} uses={used[current.id]?.n ?? 0}
      onUse={() => use(current)} onEdit={() => edit(current)} onDuplicate={async () => { const c = await duplicateTemplate(current); await load(); setCat(MY); setSel(c.id); toast(`Made a copy: “${c.name}”`) }}
      onExport={() => exportTemplateFile(current)} onDelete={() => remove(current)}
      onDefault={async (kind, on) => { await setDefault(kind, on ? current.id : null); setDefaults(await getDefaults()); toast(on ? (kind === 'new' ? `New notes will start from “${current.name}”` : `Today’s note will use “${current.name}”`) : 'Back to the usual blank page') }}
      onBack={() => setSel(null)} />
  )

  const grid = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 sm:px-5">
      {all === null ? <p className="py-16 text-center text-[14px] text-muted">Loading templates…</p>
        : shown.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-muted">
            {q ? <>No templates match “{q}”.</> : cat === MY ? <><p className="mb-3">You haven’t made any templates yet.</p><p className="text-[13px] text-faint">Open a note → ⋯ → <b className="font-medium">Save as template</b>, or start a blank one.</p></> : 'Nothing here yet.'}
          </div>
        ) : (
          <>
            {mode === 'new' && cat === 'All' && !q && (
              <p className="pb-3 text-[12.5px] text-faint">Pick a template to preview it. Double-click to {verb.toLowerCase()} straight away.</p>
            )}
            <ul className="grid grid-cols-2 gap-x-3.5 gap-y-5 sm:grid-cols-3 xl:grid-cols-4" aria-label="Templates">
              {shown.map((t) => (
                <li key={t.id}>
                  <button type="button" aria-label={t.name} aria-pressed={sel === t.id} onClick={() => setSel(t.id)} onDoubleClick={() => { if (!fieldsOf(t).length) use(t, {}); else setSel(t.id) }}
                    className={`group block w-full rounded-xl text-left outline-none transition ${sel === t.id ? 'tpl-selected' : ''}`}>
                    <div className="tpl-frame"><TemplateThumb t={t} /></div>
                    <div className="mt-2 flex items-start gap-1.5 px-0.5">
                      <span className="text-[14px] leading-5">{t.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 truncate text-[13.5px] font-medium leading-5 text-ink">
                          <span className="truncate">{t.name}</span>
                          {(defaults.new === t.id || defaults.daily === t.id) && <Star size={11} className="shrink-0 fill-current text-star" aria-label="Default" />}
                        </span>
                        <span className="block truncate text-[12px] leading-4 text-muted">{t.builtin ? t.category : 'Yours'}{t.children?.length ? ` · ${t.children.length + 1} pages` : ''}</span>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  )

  const nav = (
    <nav aria-label="Template categories" className={phone ? 'no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3' : 'flex w-[196px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line px-2.5 py-1'}>
      {cats.map((c) => (
        <button key={c} type="button" onClick={() => { setCat(c); setQ(''); if (!phone) setSel(null) }} aria-current={cat === c && !q ? 'true' : undefined}
          className={phone
            ? `shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${cat === c && !q ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-ink' : 'border-line text-ink-2'}`
            : `flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ${cat === c && !q ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] font-medium text-ink' : 'text-ink-2 hover:bg-wash hover:text-ink'}`}>
          <span>{c}</span>{!phone && <span className={`text-[11.5px] ${cat === c && !q ? 'text-ink-2' : 'text-muted'}`}>{count(c)}</span>}
        </button>
      ))}
      {!phone && (
        <div className="mt-auto space-y-0.5 border-t border-line pt-2">
          <button type="button" onClick={newBlank} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-2 hover:bg-wash hover:text-ink"><FilePlus2 size={14} /> New blank template</button>
          <button type="button" onClick={importFile} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-2 hover:bg-wash hover:text-ink"><Upload size={14} /> Import a template…</button>
        </div>
      )}
    </nav>
  )

  return createPortal(
    <div className={`animate-fade fixed inset-0 z-[60] flex justify-center bg-scrim ${phone ? 'items-end' : 'items-center p-4'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={mode === 'insert' ? 'Insert a template' : 'Templates'}
        className={`flex w-full flex-col overflow-hidden border-line bg-pop text-ink shadow-2xl ${phone ? 'animate-sheet h-[94dvh] rounded-t-3xl border-t' : 'animate-pop h-[min(880px,92vh)] max-w-[1200px] rounded-2xl border'}`}>
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
          {phone && sel ? (
            <button type="button" onClick={() => setSel(null)} className="-ml-1 flex items-center gap-1 rounded-lg px-1.5 py-1 text-[14px] text-ink-2"><ArrowLeft size={18} /> Templates</button>
          ) : (
            <h2 className="flex items-center gap-2 text-[17px] font-semibold"><LayoutTemplate size={18} className="text-accent" />{mode === 'insert' ? 'Insert a template' : 'Templates'}</h2>
          )}
          {!(phone && sel) && (
            <label className="relative ml-auto flex min-w-0 max-w-[340px] flex-1 items-center">
              <Search size={15} className="pointer-events-none absolute left-3 text-muted" />
              <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates"
                className="w-full rounded-full border border-line bg-canvas py-1.5 pl-9 pr-3 text-[14px] outline-none focus:border-accent" />
            </label>
          )}
          <button type="button" aria-label="Close" title="Close" onClick={onClose} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-wash ${phone && sel ? 'ml-auto' : ''}`}><X size={18} /></button>
        </header>
        {phone ? (
          sel && detail ? <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">{detail}</div> : (
            <>
              {nav}
              {grid}
              <div className="flex shrink-0 gap-2 border-t border-line px-4 py-2.5 pb-[max(env(safe-area-inset-bottom),10px)] text-[13px]">
                <button type="button" onClick={newBlank} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-wash py-2"><FilePlus2 size={14} /> Blank template</button>
                <button type="button" onClick={importFile} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-wash py-2"><Upload size={14} /> Import</button>
              </div>
            </>
          )
        ) : (
          <div className="flex min-h-0 flex-1 border-t border-line">
            {nav}
            <div className="flex min-w-0 flex-1 flex-col pt-4">{grid}</div>
            {detail && <aside aria-label="Template preview" className="animate-fade flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line px-5 py-4">{detail}</aside>}
          </div>
        )}
      </div>
    </div>, document.body)
}

function Detail({ t, fields, values, setValues, verb, busy, phone, defaults, uses, onUse, onEdit, onDuplicate, onExport, onDelete, onDefault, onBack }: {
  t: Template; fields: Field[]; values: Values; setValues: (v: Values) => void; verb: string; busy: boolean; phone: boolean; defaults: Defaults; uses: number
  onUse: () => void; onEdit: () => void; onDuplicate: () => void; onExport: () => void; onDelete: () => void; onDefault: (k: keyof Defaults, on: boolean) => void; onBack: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  void onBack
  const act = 'flex items-center justify-center gap-1.5 rounded-lg bg-wash px-2.5 py-2 text-[13px] text-ink-2 hover:bg-wash-2 hover:text-ink'
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h3 className="flex items-center gap-2 text-[18px] font-semibold leading-6"><span>{t.emoji}</span>{t.name}</h3>
        {t.description && <p className="mt-1 text-[13px] leading-5 text-muted">{t.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] text-ink-2">
          <span className="rounded-full bg-wash px-2 py-0.5">{t.builtin ? t.category : `Yours · ${t.category}`}</span>
          {!!t.children?.length && <span className="rounded-full bg-wash px-2 py-0.5">{t.children.length + 1} pages</span>}
          {fields.length > 0 && <span className="rounded-full bg-wash px-2 py-0.5">{fields.length} {fields.length === 1 ? 'question' : 'questions'}</span>}
          {uses > 0 && <span className="rounded-full bg-wash px-2 py-0.5">Used {uses}×</span>}
        </div>
      </div>
      <div className={`tpl-frame overflow-y-auto ${phone ? 'max-h-[42dvh]' : 'max-h-[340px]'}`}><TemplateThumb t={t} large /></div>

      <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); onUse() }}>
        {fields.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">Fill in <span className="normal-case tracking-normal text-faint">· optional</span></legend>
            {fields.map((f, i) => {
              const k = f.label.toLowerCase()
              const common = { 'aria-label': f.label, value: values[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues({ ...values, [k]: e.target.value }), className: 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent' }
              return (
                <label key={f.label} className="flex flex-col gap-1 text-[12.5px] text-ink-2">
                  {f.label}
                  {f.kind === 'choice' ? (
                    <select {...common}><option value="">—</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  ) : <input {...common} type={f.kind === 'date' ? 'date' : 'text'} autoFocus={i === 0 && !phone} placeholder={f.kind === 'date' ? undefined : `Leave blank to fill in later`} />}
                </label>
              )
            })}
          </fieldset>
        )}
        <button type="submit" disabled={busy} className="rounded-xl bg-accent px-4 py-2.5 text-[14.5px] font-semibold text-on-accent disabled:opacity-60">
          {busy ? 'Working…' : verb === 'Insert' ? 'Insert into this note' : t.children?.length ? `Create ${t.children.length + 1} pages` : 'Create note'}
        </button>
      </form>

      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" className={act} onClick={onEdit} title={t.builtin ? 'Make your own copy and edit it' : 'Edit this template in the editor'}><Pencil size={14} /> {t.builtin ? 'Customise' : 'Edit'}</button>
        <button type="button" className={act} onClick={onDuplicate}><Copy size={14} /> Duplicate</button>
        <button type="button" className={act} onClick={onExport} title="Save as a file you can share"><Download size={14} /> Share file</button>
      </div>

      <div className="rounded-xl border border-line px-3 py-1">
        <Switch label={<span className="text-[13px]">Start every new note from this</span>} checked={defaults.new === t.id} onChange={(on) => onDefault('new', on)} />
        <Switch label={<span className="text-[13px]">Use for today’s daily note</span>} checked={defaults.daily === t.id || (!defaults.daily && t.id === 'tpl-daily')} onChange={(on) => onDefault('daily', on)} />
      </div>

      {!t.builtin && (confirmDelete ? (
        <div className="flex items-center gap-2 rounded-xl border border-danger/40 px-3 py-2 text-[13px]">
          <span className="flex-1">Delete “{t.name}”? Notes made from it stay.</span>
          <button type="button" className="rounded-md px-2 py-1 text-muted hover:bg-wash" onClick={() => setConfirmDelete(false)}>Keep</button>
          <button type="button" className="rounded-md bg-danger px-2.5 py-1 font-medium text-white" onClick={onDelete}>Delete</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[12.5px] text-muted hover:bg-wash hover:text-danger"><Trash2 size={13} /> Delete template</button>
      ))}

      <details className="text-[12px] text-faint">
        <summary className="cursor-pointer select-none hover:text-muted">How templates fill themselves in</summary>
        <p className="mt-1.5 leading-5">Write these anywhere in a template and they’re filled in when you use it: {AUTO_HELP.map(([k, v]) => <span key={k}><code className="rounded bg-wash px-1 text-ink-2">{k}</code> {v}; </span>)} Anything else in double braces, like <code className="rounded bg-wash px-1 text-ink-2">{'{{Client}}'}</code>, becomes a question. Add <code className="rounded bg-wash px-1 text-ink-2">:date</code> for a date, or <code className="rounded bg-wash px-1 text-ink-2">{'{{Status:Draft/Final}}'}</code> for a choice.</p>
      </details>
    </div>
  )
}
