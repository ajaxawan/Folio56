import { ArrowRight, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, FilePlus2, FileText, LoaderCircle, Mic, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createNote, db, updateNote } from '../lib/db'
import { useAI } from '../lib/prefs'
import { plainText } from '../lib/preview'
import { collectTasks, friendlyDue, keyOf, setDue, type Task } from '../lib/tasks'
import { toast } from '../lib/toast'
import type { Note } from '../types'

const monday = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Items under a "Decisions" heading in meeting notes. */
function decisionsOf(n: Note): string[] {
  const out: string[] = []
  let inDec = false
  for (const b of n.content ?? []) {
    if (b.type === 'heading') { inDec = /decision/i.test(plainText([b])); continue }
    if (inDec && (b.type === 'bulletListItem' || b.type === 'numberedListItem' || b.type === 'paragraph')) { const t = plainText([b]).trim(); if (t) out.push(t) }
  }
  return out.slice(0, 6)
}

/**
 * The week at a glance, built only from your own notes: what got done, what's still open (carry it
 * to next week in one tap), what's coming, meetings and their decisions, and the notes you worked on.
 */
export function WeeklyReview({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
  const ai = useAI()
  const [offset, setOffset] = useState(0)
  const [summary, setSummary] = useState<{ busy?: boolean; text?: string; error?: string } | null>(null)
  const start = add(monday(new Date()), offset * 7), end = add(start, 7)
  const sk = keyOf(start), ek = keyOf(add(end, -1)), nextMon = keyOf(end), nextEnd = keyOf(add(end, 6))
  const inWeek = (t: number) => t >= +start && t < +end
  const live = useMemo(() => notes.filter((n) => n.trashedAt === null), [notes])

  const data = useMemo(() => {
    const tasks = collectTasks(live)
    const touched = live.filter((n) => inWeek(n.updatedAt) || inWeek(n.createdAt))
    const touchedIds = new Set(touched.map((n) => n.id))
    const done = tasks.filter((t) => t.checked && (touchedIds.has(t.noteId) || (t.due && t.due >= sk && t.due <= ek)))
    const open = tasks.filter((t) => !t.checked && t.due && t.due <= ek).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
    const doing = tasks.filter((t) => !t.checked && t.doing && !(t.due && t.due <= ek))
    const next = tasks.filter((t) => !t.checked && t.due && t.due >= nextMon && t.due <= nextEnd).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
    const meetings = touched.filter((n) => n.memo && inWeek(n.createdAt)).sort((a, b) => a.createdAt - b.createdAt)
    const created = touched.filter((n) => inWeek(n.createdAt) && !n.daily && !n.memo).sort((a, b) => b.createdAt - a.createdAt)
    const edited = touched.filter((n) => !inWeek(n.createdAt) && !n.daily).sort((a, b) => b.updatedAt - a.updatedAt)
    const journal = touched.filter((n) => n.daily && n.daily >= sk && n.daily <= ek).length
    return { done, open, doing, next, meetings, created, edited, journal }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sk])

  const carry = async (ts: Task[]) => {
    const byNote = new Map<string, Task[]>()
    for (const t of ts) byNote.set(t.noteId, [...(byNote.get(t.noteId) ?? []), t])
    for (const [id, items] of byNote) { const n = await db.notes.get(id); if (!n) continue; let c = n.content; for (const t of items) c = setDue(c, t.index, nextMon); await updateNote(id, { content: c }) }
    toast(`Moved ${ts.length} ${ts.length === 1 ? 'task' : 'tasks'} to ${friendlyDue(nextMon)}`)
  }
  const lines = () => [
    `Week of ${fmt(start)} – ${fmt(add(end, -1))}`,
    `Done (${data.done.length}): ${data.done.map((t) => t.text).join('; ') || '—'}`,
    `Still open (${data.open.length}): ${data.open.map((t) => `${t.text} (due ${t.due})`).join('; ') || '—'}`,
    `In progress: ${data.doing.map((t) => t.text).join('; ') || '—'}`,
    `Next week: ${data.next.map((t) => `${t.text} (${t.due})`).join('; ') || '—'}`,
    `Meetings: ${data.meetings.map((m) => `${m.title}${decisionsOf(m).length ? ` — decisions: ${decisionsOf(m).join('; ')}` : ''}`).join(' | ') || '—'}`,
    `New notes: ${data.created.map((n) => n.title || 'Untitled').join('; ') || '—'}`,
    `Edited notes: ${data.edited.map((n) => n.title || 'Untitled').join('; ') || '—'}`,
  ]
  const summarise = async () => {
    setSummary({ busy: true })
    try {
      const { askAI } = await import('../lib/voice')
      const text = await askAI('You write a short, warm weekly recap for the person whose notes these are. 3–5 sentences, second person, plain language. Mention what got done, what is still open and what is coming. Only use the facts given; never invent anything. No headings, no lists.', lines().join('\n'), 400)
      setSummary({ text })
    } catch (e) { setSummary({ error: (e as Error).message }) }
  }
  const saveAsNote = async () => {
    const t = (s: string) => [{ type: 'text', text: s, styles: {} }]
    const h = (s: string) => ({ type: 'heading', props: { level: 2 }, content: t(s) })
    const li = (s: string) => ({ type: 'bulletListItem', content: t(s) })
    const content = [
      ...(summary?.text ? [{ type: 'paragraph', content: t(summary.text) }] : []),
      h(`Done · ${data.done.length}`), ...(data.done.length ? data.done.map((x) => ({ type: 'checkListItem', props: { checked: true }, content: t(x.text) })) : [li('Nothing ticked off')]),
      h(`Still open · ${data.open.length}`), ...(data.open.length ? data.open.map((x) => li(`${x.text} — due ${friendlyDue(x.due!)} (${x.note.title || 'Untitled'})`)) : [li('Nothing overdue')]),
      h('Coming next week'), ...(data.next.length ? data.next.map((x) => li(`${x.text} — ${friendlyDue(x.due!)}`)) : [li('Nothing scheduled yet')]),
      ...(data.meetings.length ? [h('Meetings'), ...data.meetings.flatMap((m) => [li(m.title || 'Meeting'), ...decisionsOf(m).map((d) => li(`Decision: ${d}`))])] : []),
      h('Notes'), ...[...data.created, ...data.edited].slice(0, 20).map((n) => ({ type: 'bulletListItem', content: [{ type: 'link', href: `#note=${n.id}`, content: n.title || 'Untitled' }] })),
    ]
    const n = await createNote({ title: `Week of ${fmt(start)} – ${fmt(add(end, -1))}`, icon: '🗓️', content })
    onOpen(n.id)
  }

  const Section = ({ title, icon, count, action, children }: { title: string; icon: React.ReactNode; count?: number; action?: React.ReactNode; children: React.ReactNode }) => (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">{icon}{title}</span>
        {count !== undefined && <span className="text-[12px] text-faint">{count}</span>}
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  )
  const TaskList = ({ ts, empty, carryable }: { ts: Task[]; empty: string; carryable?: boolean }) => ts.length === 0
    ? <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13.5px] text-muted">{empty}</p>
    : (
      <ul className="overflow-hidden rounded-2xl border border-line bg-card">
        {ts.slice(0, 30).map((t) => (
          <li key={`${t.noteId}:${t.index}`} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
            <span className={`min-w-0 flex-1 text-[14.5px] ${t.checked ? 'text-muted line-through decoration-muted/50' : 'text-ink'}`}>{t.text}</span>
            {t.due && !t.checked && <span className={`shrink-0 text-[12px] ${t.due < keyOf(new Date()) ? 'text-danger' : 'text-muted'}`}>{friendlyDue(t.due)}</span>}
            <button type="button" onClick={() => onOpen(t.noteId)} className="max-w-[34%] shrink-0 truncate text-[12px] text-faint hover:text-accent">{t.note.title || 'Untitled'}</button>
            {carryable && <button type="button" onClick={() => carry([t])} title={`Move to ${friendlyDue(nextMon)}`} className="shrink-0 rounded-full p-1.5 text-muted hover:bg-wash hover:text-accent" aria-label={`Carry “${t.text}” to next week`}><ArrowRight size={15} /></button>}
          </li>
        ))}
      </ul>
    )
  const NoteList = ({ ns }: { ns: Note[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {ns.slice(0, 16).map((n) => (
        <button key={n.id} type="button" onClick={() => onOpen(n.id)} className="flex max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-ink-2 hover:border-accent/50 hover:text-ink">
          {n.icon ? <span>{n.icon}</span> : <FileText size={13} className="text-muted" />}<span className="truncate">{n.title || 'Untitled'}</span>
        </button>
      ))}
      {ns.length > 16 && <span className="px-2 py-1.5 text-[12.5px] text-faint">+{ns.length - 16} more</span>}
    </div>
  )

  const stats = [
    [data.done.length, 'done'], [data.open.length, 'still open'], [data.meetings.length, data.meetings.length === 1 ? 'meeting' : 'meetings'], [data.created.length + data.edited.length, 'notes worked on'], ...(data.journal ? [[data.journal, data.journal === 1 ? 'journal day' : 'journal days']] : []),
  ] as [number, string][]

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent">Weekly review</div>
          <h1 className="font-title text-[30px] font-bold tracking-tight">{offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `Week of ${fmt(start)}`}</h1>
          <p className="text-[13px] text-muted">{fmt(start)} – {fmt(add(end, -1))}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous week" onClick={() => { setOffset(offset - 1); setSummary(null) }} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-wash hover:text-ink"><ChevronLeft size={18} /></button>
          {offset !== 0 && <button type="button" onClick={() => { setOffset(0); setSummary(null) }} className="rounded-full px-2.5 py-1 text-[12.5px] text-muted hover:bg-wash hover:text-ink">This week</button>}
          <button type="button" aria-label="Next week" disabled={offset >= 0} onClick={() => { setOffset(offset + 1); setSummary(null) }} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-wash hover:text-ink disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {stats.map(([n, l]) => <span key={l} className="rounded-full bg-wash px-3 py-1.5 text-[13px] text-ink-2"><b className="font-semibold text-ink">{n}</b> {l}</span>)}
      </div>

      {ai && (
        <div className="mb-6 rounded-2xl border border-line bg-card/70 px-4 py-3">
          {summary?.text ? <p className="text-[14.5px] leading-relaxed text-ink-2">{summary.text}</p>
            : summary?.error ? <p className="text-[13.5px] text-danger">{summary.error}</p>
            : <button type="button" onClick={summarise} disabled={summary?.busy} className="flex items-center gap-2 text-[13.5px] text-ink-2 hover:text-ink">
                {summary?.busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} className="text-accent" />} {summary?.busy ? 'Writing a short recap…' : 'Write a short recap of my week (AI)'}
              </button>}
        </div>
      )}

      <Section title="Still open" icon={<CalendarClock size={15} className="text-danger" />} count={data.open.length}
        action={data.open.length > 1 && <button type="button" onClick={() => carry(data.open)} className="rounded-full px-2.5 py-1 text-[12.5px] font-medium text-accent-ink hover:bg-wash">Carry all to next week</button>}>
        <TaskList ts={data.open} empty="Nothing due this week is left open." carryable />
      </Section>
      {data.doing.length > 0 && (
        <Section title="In progress" icon={<CircleDot size={15} className="text-accent" />} count={data.doing.length}>
          <TaskList ts={data.doing} empty="" />
        </Section>
      )}
      <Section title="Done" icon={<CheckCircle2 size={15} className="text-success" />} count={data.done.length}>
        <TaskList ts={data.done} empty="Nothing ticked off in this week’s notes yet." />
      </Section>
      <Section title="Coming next week" icon={<CalendarClock size={15} className="text-muted" />} count={data.next.length}>
        <TaskList ts={data.next} empty="Nothing scheduled for next week yet." />
      </Section>
      {data.meetings.length > 0 && (
        <Section title="Meetings & decisions" icon={<Mic size={15} className="text-muted" />} count={data.meetings.length}>
          <ul className="space-y-2">
            {data.meetings.map((m) => (
              <li key={m.id} className="rounded-2xl border border-line bg-card px-4 py-3">
                <button type="button" onClick={() => onOpen(m.id)} className="text-left text-[14.5px] font-medium text-ink hover:text-accent">{m.title || 'Meeting'}</button>
                <span className="ml-2 text-[12px] text-faint">{new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                {decisionsOf(m).length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13.5px] text-ink-2">{decisionsOf(m).map((d, i) => <li key={i}>{d}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(data.created.length > 0 || data.edited.length > 0) && (
        <Section title="Notes you worked on" icon={<FileText size={15} className="text-muted" />} count={data.created.length + data.edited.length}>
          {data.created.length > 0 && <><p className="mb-1.5 px-1 text-[12px] text-faint">New</p><NoteList ns={data.created} /></>}
          {data.edited.length > 0 && <><p className="mb-1.5 mt-3 px-1 text-[12px] text-faint">Edited</p><NoteList ns={data.edited} /></>}
        </Section>
      )}

      <button type="button" onClick={saveAsNote} className="mx-auto mt-2 flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[13.5px] text-ink-2 hover:border-accent/50 hover:text-ink">
        <FilePlus2 size={15} /> Save this review as a note
      </button>
      <p className="mt-3 text-center text-[12px] text-faint">Built from your notes on this device. Weeks start on Monday.</p>
    </div>
  )
}
