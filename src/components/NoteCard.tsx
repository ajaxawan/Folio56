import { SlideView } from './SlideView'
import { metaFor, themeOf } from '../lib/deckRender'
import { Archive, ArchiveRestore, Check, Table2, CheckSquare, Copy, FileText, Lock, MoreHorizontal, Palette, Pin, RotateCcw, Send, Square, Sun, BookOpen, Trash2, Mic, Star, Layers, ChevronRight, Presentation } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import { toast } from '../lib/toast'
import { surface } from '../lib/colors'
import { useCoverCss, useImageUrl } from '../lib/blobs'
import { labelColor } from './LabelMenu'
import { deleteForever, duplicateNote, patchNote, setTrashed, updateNote } from '../lib/db'
import { friendlyDate } from '../lib/device'
import { usePrefs } from '../lib/prefs'
import { toggleChecklistItem } from '../lib/preview'
import { dueState, friendlyDue, parseTask } from '../lib/tasks'
import type { Label, Note } from '../types'
import { ColorPicker } from './ColorPicker'
import { NotebookPicker } from './LabelPicker'
import { MenuItem, Popover } from './ui'
import { sendNotes } from '../lib/parcelBus'

function PreviewLines({ text, compact }: { text: string; compact: boolean }) {
  const lines = text.split('\n')
  const max = compact ? 6 : 9
  const cut = lines.length > max
  // consecutive code lines become one small code panel
  const parts: { kind: 'code' | 'line'; lines: string[] }[] = []
  for (const l of lines) {
    const code = l.startsWith('\u0002')
    const last = parts[parts.length - 1]
    if (code && last?.kind === 'code') last.lines.push(l.slice(1))
    else parts.push({ kind: code ? 'code' : 'line', lines: [code ? l.slice(1) : l] })
  }
  return (
    <div className={`relative ${cut ? 'max-h-[var(--clamp)] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]' : ''}`}
      style={{ ['--clamp' as string]: `${max * (compact ? 20 : 22)}px` }}>
      {parts.map((p, i) => {
        if (p.kind === 'code') return (
          <pre key={i} className="my-1.5 overflow-hidden rounded-lg border border-line border-t-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] bg-[#0d1117] px-2 py-1.5 font-mono text-[11.5px] leading-[17px] text-[#c9d1d9]">
            {p.lines.map((l, j) => <div key={j} className="truncate">{l || ' '}</div>)}
          </pre>
        )
        const l = p.lines[0]
        return l.startsWith('\u0001')
          ? <p key={i} className="mt-1 font-semibold text-ink first:mt-0">{l.slice(1)}</p>
          : l.startsWith('\u0003')
            ? <p key={i} className="my-1 inline-flex items-center gap-1.5 rounded-md bg-wash px-2 py-0.5 text-[12px] text-muted"><Table2 size={12} />{l.slice(1)}</p>
            : <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{l || ' '}</p>
      })}
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const blockText = (b: any): string => (Array.isArray(b?.content) ? b.content.map((c: any) => c.text ?? '').join('') : typeof b?.content === 'string' ? b.content : '')
/** Long, structured pages show their outline on the card instead of the first paragraph. */
function outlineOf(note: Note) {
  if (note.locked || note.words < 350 || !Array.isArray(note.content)) return null
  const heads: string[] = []
  let intro = ''
  for (const b of note.content) {
    if (b.type === 'heading' && !b.props?.isToggleable && (b.props?.level ?? 1) <= 2) { const t = blockText(b).trim(); if (t) heads.push(t) }
    else if (!intro && b.type === 'paragraph') intro = blockText(b).trim()
  }
  return heads.length >= 3 ? { heads, intro } : null
}
/** A steady little waveform for a recording (drawn from the note id, so it never jumps). */
function Wave({ seed, bars = 28 }: { seed: string; bars?: number }) {
  let h = 2166136261
  const vals = Array.from({ length: bars }, (_, i) => { for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return 0.25 + ((h >>> 0) % 1000) / 1000 * 0.75 })
  return (
    <svg viewBox={`0 0 ${bars * 4} 20`} className="h-5 w-full" preserveAspectRatio="none" aria-hidden>
      {vals.map((v, i) => <rect key={i} x={i * 4 + 0.6} y={10 - v * 9} width={2.4} height={v * 18} rx={1.2} fill="var(--color-accent)" opacity={0.45 + 0.55 * Math.sin((i / bars) * Math.PI)} />)}
    </svg>
  )
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export const NoteCard = memo(function NoteCard({ note, labels, childCount, selected, selecting, onOpen, onSelect, dragging, stack, onStack }: {
  note: Note; labels: Label[]; childCount: number; selected: boolean; selecting: boolean
  onOpen: (id: string) => void; onSelect: (id: string) => void; dragging?: boolean
  /** Series members when this card stands for a collapsed stack. */
  stack?: Note[]
  /** Expand / collapse the stack this note belongs to. */
  onStack?: (series: string) => void
}) {
  const { prefs, dark } = usePrefs()
  const [menu, setMenu] = useState<null | 'color' | 'more' | 'labels'>(null)
  const compact = prefs.density === 'compact'
  const s = surface(note.color, dark, prefs.cardStyle)
  const trashed = note.trashedAt !== null
  const noteLabels = labels.filter((l) => note.labels.includes(l.id))
  const maxChecks = compact ? 4 : 6
  const base = new Date(note.createdAt)
  const realChecks = note.checklist.map((c, i) => ({ ...c, i, p: parseTask(c.text, base) })).filter((c) => c.text.trim())
  const shownChecks = realChecks.slice(0, maxChecks)
  const done = realChecks.filter((c) => c.checked).length
  const empty = !note.title && !note.preview && !realChecks.length && !note.image && !note.locked
  const cover = useCoverCss(note.cover)
  const img = useImageUrl(note.locked ? null : note.image)
  const pad = compact ? 'px-3 pt-2.5 pb-2.5' : 'px-4 pt-3.5 pb-3'
  const glow = noteLabels[0] ? labelColor(noteLabels[0]) : null
  const outline = stack ? null : outlineOf(note)
  const audioMemo = note.memo && note.memo.duration > 0 ? note.memo : null

  // touch swipe: right = pin / unpin, left = archive (with Undo)
  const [dx, setDx] = useState(0)
  const sw = useRef<{ x: number; y: number; lock: null | 'x' | 'y' } | null>(null)
  const swipeOk = !trashed && !selecting && !stack
  const onPD = (e: React.PointerEvent) => { if (e.pointerType === 'touch' && swipeOk) sw.current = { x: e.clientX, y: e.clientY, lock: null } }
  const onPM = (e: React.PointerEvent) => {
    const st = sw.current; if (!st) return
    const x = e.clientX - st.x, y = e.clientY - st.y
    if (!st.lock) { if (Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) st.lock = 'x'; else if (Math.abs(y) > 10) { st.lock = 'y'; sw.current = null; return } }
    if (st.lock === 'x') setDx(Math.max(-130, Math.min(130, x)))
  }
  const swipedRef = useRef(false)
  const onPU = () => {
    const st = sw.current; sw.current = null
    if (st?.lock === 'x') {
      swipedRef.current = true; setTimeout(() => { swipedRef.current = false }, 300)
      if (dx > 80) { patchNote(note.id, { pinned: !note.pinned }); toast(note.pinned ? 'Unpinned' : 'Pinned', () => patchNote(note.id, { pinned: note.pinned })) }
      else if (dx < -80) { patchNote(note.id, { archived: !note.archived, pinned: false }); toast(note.archived ? 'Moved out of Archive' : 'Archived', () => patchNote(note.id, { archived: note.archived, pinned: note.pinned })) }
    }
    setDx(0)
  }

  const toggleCheck = (i: number, checked: boolean) => {
    if (note.locked || trashed) return
    updateNote(note.id, { content: toggleChecklistItem(note.content, i, checked) })
  }

  return (
    <div className="relative" onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}>
    {dx !== 0 && (
      <div aria-hidden className={`absolute inset-0 flex items-center rounded-xl px-4 text-[12.5px] font-semibold text-white ${dx > 0 ? 'justify-start bg-[color-mix(in_srgb,var(--color-accent)_75%,black)]' : 'justify-end bg-amber-700/90'}`}>
        {dx > 0 ? <span className="flex items-center gap-1.5"><Pin size={16} />{note.pinned ? 'Unpin' : 'Pin'}</span> : <span className="flex items-center gap-1.5">{note.archived ? 'Unarchive' : 'Archive'}<Archive size={16} /></span>}
      </div>
    )}
    <article
      onClick={() => { if (swipedRef.current) return; if (selecting) onSelect(note.id); else if (stack && note.series) onStack?.(note.series); else onOpen(note.id) }}
      data-note={note.id}
      data-stack={stack ? note.series ?? '' : undefined}
      className={`group relative cursor-pointer rounded-xl border transition-[box-shadow,transform,border-color] duration-150 ${prefs.layout === 'list' ? '' : 'fine:min-h-[96px]'} fine:hover:-translate-y-px fine:hover:shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] fine:hover:!border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] ${selected ? 'ring-2 ring-accent' : ''} ${dragging ? 'opacity-30' : ''} ${menu ? 'z-30' : ''}`}
      style={{
        background: s.background, borderColor: selected ? 'transparent' : s.borderColor,
        transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined, touchAction: 'pan-y',
        boxShadow: [
          glow ? `inset 0 2px 0 ${glow}` : '',
          prefs.cardStyle === 'subtle' && note.color !== 'default' ? `inset 3px 0 0 ${s.accent}` : '',
          'inset 0 1px 0 var(--color-highlight)',
          // stacked sheets behind notes that contain pages
          childCount > 0 || stack ? '5px 5px 0 -1px var(--color-card), 5px 5px 0 0 var(--color-line), 10px 10px 0 -2px var(--color-card), 10px 10px 0 -1px var(--color-line)' : '',
        ].filter(Boolean).join(', '),
      } as React.CSSProperties}
    >
      {glow && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-xl" style={{ background: `linear-gradient(to bottom, color-mix(in srgb, ${glow} 13%, transparent), transparent)` }} />}
      {note.pinned && !trashed && <span aria-hidden className="absolute -top-px right-11 z-10 h-6 w-3.5 bg-accent shadow-md [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]" />}
      {note.paper && note.paper !== 'none' && <div aria-hidden className={`pointer-events-none absolute inset-0 rounded-xl paper-${note.paper} dense`} />}
      {/* select circle */}
      {!trashed && (
        <button type="button" aria-label={selected ? 'Deselect' : 'Select'} onClick={(e) => { e.stopPropagation(); onSelect(note.id) }}
          className={`absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-opacity ${selected ? 'border-accent bg-accent text-on-accent opacity-100' : 'border-ink/70 bg-canvas text-ink opacity-0 fine:group-hover:opacity-100'} ${selecting && !selected ? 'opacity-100' : ''}`}>
          <Check size={13} strokeWidth={3} />
        </button>
      )}

      {note.deck && !note.locked && note.deck.slides[0] && (
        <div aria-hidden className="overflow-hidden rounded-t-[11px] border-b border-line/60"><SlideView slide={note.deck.slides[0]} theme={themeOf(note.deck.theme)} meta={metaFor(note.deck, 0)} /></div>
      )}
      {cover && !note.image && !note.deck && <div aria-hidden className={`${compact ? 'h-10' : 'h-16'} rounded-t-[11px]`} style={{ background: cover }} />}
      {img && !note.deck && (
        <img src={img} alt="" draggable={false} className={`block w-full rounded-t-[11px] object-cover ${compact ? 'max-h-36' : 'max-h-56'}`} />
      )}

      {!trashed && !selecting && (
        <button type="button" aria-label={note.pinned ? 'Unpin' : 'Pin'} onClick={(e) => { e.stopPropagation(); patchNote(note.id, { pinned: !note.pinned }) }}
          className={`absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:bg-wash ${note.image ? 'bg-black/35 text-white' : 'text-ink-2'} ${note.pinned ? 'opacity-100 coarse:hidden' : 'opacity-0 fine:group-hover:opacity-100 coarse:hidden'}`}>
          <Pin size={16} className={note.pinned ? 'fill-current' : ''} />
        </button>
      )}

      <div className={`relative ${pad} ${compact ? 'text-[13px] leading-5' : 'text-[14px] leading-[22px] max-sm:text-[13px] max-sm:leading-5'} text-ink-2 max-sm:px-3 max-sm:py-2.5`}>
        {!stack && note.series && onStack && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onStack(note.series!) }} title="Collapse the series back into a stack"
            className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] px-2 py-0.5 text-[11px] text-accent"><Layers size={11} /><span className="truncate">{note.series}</span></button>
        )}
        {(note.title || note.icon) && (
          <h3 className={`font-title mb-1.5 pr-7 font-semibold text-ink [overflow-wrap:anywhere] ${compact ? 'text-[15px] leading-5' : 'text-[18.5px] leading-[1.28] max-sm:text-[16.5px] max-sm:leading-[1.25]'}`}>
            {note.icon ? <span className="mr-1.5">{note.icon}</span> : note.daily && <Sun size={14} className="-mt-0.5 mr-1.5 inline text-amber-500" />}
            {note.title}
          </h3>
        )}

        {note.memo && note.memo.status !== 'done' && (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] px-2 py-0.5 text-[11.5px] text-accent">
            <Mic size={11} /> {note.memo.status === 'recorded' ? 'Recording · not written up' : note.memo.status === 'error' ? 'Write-up needs a retry' : 'Writing up…'}
          </p>
        )}
        {stack ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-accent"><Layers size={12} /> Series · {stack.length} notes</div>
            <ol className="space-y-0.5">
              {stack.slice(0, compact ? 4 : 5).map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); if (selecting) onSelect(note.id); else onOpen(m.id) }}
                    className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-[13px] text-ink-2 hover:text-ink">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-muted" /><span className="truncate">{m.title || 'Untitled'}</span>
                  </button>
                </li>
              ))}
            </ol>
            {stack.length > (compact ? 4 : 5) && <p className="mt-0.5 pl-2.5 text-[12px] text-muted">+ {stack.length - (compact ? 4 : 5)} more</p>}
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-faint">Tap to fan out <ChevronRight size={12} /></p>
          </div>
        ) : note.deck ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] px-2 py-0.5 text-[11.5px] text-accent"><Presentation size={12} /> Presentation · {note.deck.slides.length} slides</p>
        ) : note.locked ? (
          <p className="flex items-center gap-2 text-muted"><Lock size={14} /> Locked</p>
        ) : outline ? (
          <div>
            {audioMemo && <div className="mb-2 flex items-center gap-2"><Mic size={13} className="shrink-0 text-red-400" /><div className="min-w-0 flex-1"><Wave seed={note.id} /></div><span className="shrink-0 font-mono text-[11.5px] text-muted">{mmss(audioMemo.duration)}</span></div>}
            {outline.intro && <p className="mb-2 line-clamp-2 [overflow-wrap:anywhere]">{outline.intro}</p>}
            <ul className="space-y-0.5 border-l border-line pl-2.5">
              {outline.heads.slice(0, compact ? 4 : 6).map((h, i) => <li key={i} className="truncate text-[12.5px] text-ink-2">{h}</li>)}
              {outline.heads.length > (compact ? 4 : 6) && <li className="text-[12px] text-muted">+ {outline.heads.length - (compact ? 4 : 6)} more sections</li>}
            </ul>
            <p className="mt-2 text-[11.5px] text-faint">{Math.max(1, Math.round(note.words / 220))} min read · {outline.heads.length} sections{realChecks.length - done > 0 ? <span className="text-accent"> · {realChecks.length - done} open tasks</span> : null}</p>
          </div>
        ) : (
          <>
            {audioMemo && <div className="mb-2 flex items-center gap-2"><Mic size={13} className="shrink-0 text-red-400" /><div className="min-w-0 flex-1"><Wave seed={note.id} /></div><span className="shrink-0 font-mono text-[11.5px] text-muted">{mmss(audioMemo.duration)}</span></div>}
            {note.preview && <PreviewLines text={note.preview} compact={compact} />}
            {realChecks.length > 0 && (
              <div className={note.preview ? 'mt-2' : ''}>
                {realChecks.length > 2 && (
                  <div className="mb-2 flex items-center gap-2 text-[11.5px] text-muted">
                    <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90" aria-hidden>
                      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--color-wash-2)" strokeWidth="2.5" />
                      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={44} strokeDashoffset={44 * (1 - done / realChecks.length)} style={{ transition: 'stroke-dashoffset .4s ease' }} />
                    </svg>
                    {done} of {realChecks.length} done
                  </div>
                )}
                <ul className="space-y-0.5">
                  {shownChecks.map((it) => (
                    <li key={it.i} className={`flex items-start gap-2 ${it.checked ? 'text-muted' : ''}`}>
                      <button type="button" aria-label={it.checked ? 'Uncheck' : 'Check'} onClick={(e) => { e.stopPropagation(); if (!selecting) toggleCheck(it.i, !it.checked) }}
                        className="mt-[3px] shrink-0 rounded hover:text-accent">
                        {it.checked ? <CheckSquare size={16} className="tick text-accent" /> : <Square size={16} className="text-muted" />}
                      </button>
                      <span className="min-w-0 [overflow-wrap:anywhere]"><span className={`strike ${it.checked ? 'on' : ''}`}>{it.p.starred && <Star size={11} className="-mt-0.5 mr-1 inline fill-star text-star" />}{it.p.owner && <b className="font-semibold">{it.p.owner}: </b>}{it.p.text || it.text || '\u00a0'}</span>
                        {it.p.due && !it.checked && <span className={`ml-1.5 whitespace-nowrap text-[11px] ${dueState(it.p.due) === 'overdue' ? 'text-danger' : dueState(it.p.due) === 'today' ? 'text-accent' : 'text-muted'}`}>· {friendlyDue(it.p.due)}</span>}</span>
                    </li>
                  ))}
                  {realChecks.length > shownChecks.length && <li className="pl-6 text-[12px] text-muted">+ {realChecks.length - shownChecks.length} more</li>}
                </ul>
              </div>
            )}
          </>
        )}
        {empty && <p className="text-muted">Empty note</p>}

        {(noteLabels.length > 0 || childCount > 0 || prefs.layout === 'list') && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {childCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-[11.5px] text-ink-2"><FileText size={11} />{childCount}</span>}
            {noteLabels.slice(0, 3).map((l) => <span key={l.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] text-ink-2" style={{ background: `color-mix(in srgb, ${labelColor(l)} 16%, transparent)` }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: labelColor(l) }} /><span className="truncate">{l.name}</span></span>)}
            {noteLabels.length > 3 && <span className="text-[11.5px] text-muted">+{noteLabels.length - 3}</span>}
            {prefs.layout === 'list' && <span className="ml-auto text-[11.5px] text-faint">{friendlyDate(note.updatedAt)}</span>}
          </div>
        )}
      </div>

      {/* floating action pill (mouse only; touch uses long-press selection) */}
      {!selecting && (
        <div onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full border border-line bg-pop/95 p-0.5 shadow-lg backdrop-blur transition-opacity coarse:hidden ${menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          {trashed ? (
            <>
              <PillBtn label="Restore" onClick={() => setTrashed(note.id, false)}><RotateCcw size={15} /></PillBtn>
              <PillBtn label="Delete forever" onClick={() => deleteForever(note.id)}><Trash2 size={15} /></PillBtn>
            </>
          ) : (
            <>
              <div className="relative">
                <PillBtn label="Colour" onClick={() => setMenu(menu === 'color' ? null : 'color')}><Palette size={15} /></PillBtn>
                <Popover open={menu === 'color'} onClose={() => setMenu(null)} className="bottom-9 right-0"><ColorPicker value={note.color} onChange={(color) => patchNote(note.id, { color })} /></Popover>
              </div>
              <div className="relative">
                <PillBtn label="Notebook" onClick={() => setMenu(menu === 'labels' ? null : 'labels')}><BookOpen size={15} /></PillBtn>
                <Popover open={menu === 'labels'} onClose={() => setMenu(null)} className="bottom-9 right-0"><NotebookPicker selected={note.labels} onChange={(ids) => patchNote(note.id, { labels: ids })} /></Popover>
              </div>
              <PillBtn label={note.archived ? 'Unarchive' : 'Archive'} onClick={() => patchNote(note.id, { archived: !note.archived, pinned: false })}>
                {note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </PillBtn>
              <div className="relative">
                <PillBtn label="More" onClick={() => setMenu(menu === 'more' ? null : 'more')}><MoreHorizontal size={15} /></PillBtn>
                <Popover open={menu === 'more'} onClose={() => setMenu(null)} className="bottom-9 right-0 w-48">
                  {!note.locked && <MenuItem icon={<Send size={15} />} onClick={() => { setMenu(null); sendNotes([note.id]) }}>Share as link…</MenuItem>}
                  <MenuItem icon={<Copy size={15} />} onClick={() => { setMenu(null); duplicateNote(note) }}>Make a copy</MenuItem>
                  <MenuItem icon={<Trash2 size={15} />} danger onClick={() => { setMenu(null); setTrashed(note.id, true) }}>Move to trash</MenuItem>
                </Popover>
              </div>
            </>
          )}
        </div>
      )}
    </article>
    </div>
  )
})

function PillBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-ink-2 hover:bg-wash hover:text-ink">{children}</button>
  )
}
