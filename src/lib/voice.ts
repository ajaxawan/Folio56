// Voice memos (V5.3): settings, the Groq client, and the record → transcript → write-up pipeline.
// Audio and text leave the device only when the person has added their own Groq key, and only
// for the request that needs it. Nothing else changes about Folio's local-only storage.

import { nanoid } from 'nanoid'
import type { Memo, MemoStyle, Note } from '../types'
import { REF } from './blobs'
import { createNote, db, patchNote, snapshot, updateNote } from './db'
import { aiOn } from './prefs'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------- settings
export interface VoiceSettings {
  key: string
  /** whisper-large-v3 copes best with accents and mixed languages; turbo is faster. */
  stt: 'whisper-large-v3' | 'whisper-large-v3-turbo'
  llm: string
  /** Spoken language hint for Whisper ('' = detect). */
  language: string
  /** Write-up language: same as spoken, or always English. */
  output: 'same' | 'en'
  keepAudio: boolean
  style: MemoStyle
}
export const VOICE_DEFAULTS: VoiceSettings = { key: '', stt: 'whisper-large-v3', llm: 'openai/gpt-oss-120b', language: '', output: 'same', keepAudio: true, style: 'minutes' }
// Stored in the meta table: never included in backups, exports or share links.
// With AI switched off, Folio behaves as if no key were saved: recordings stay audio notes and
// nothing is ever sent to Groq. (`raw` reads the stored key regardless, for the settings screen.)
export async function getVoiceSettings(raw = false): Promise<VoiceSettings> {
  const row = await db.meta.get('voice')
  const s = { ...VOICE_DEFAULTS, ...((row?.value as Partial<VoiceSettings>) ?? {}) }
  return raw || aiOn() ? s : { ...s, key: '' }
}
export async function saveVoiceSettings(p: Partial<VoiceSettings>) {
  const cur = await getVoiceSettings(true)
  await db.meta.put({ key: 'voice', value: { ...cur, ...p } })
}

export const STYLES: { value: MemoStyle; label: string; hint: string }[] = [
  { value: 'minutes', label: 'Meeting minutes', hint: 'Summary, discussion, decisions, action items' },
  { value: 'memo', label: 'Structured note', hint: 'Your thoughts, tidied into headings and lists' },
  { value: 'transcript', label: 'Transcript only', hint: 'Word for word, with timestamps' },
]

// ---------------------------------------------------------------- audio storage
/** Stores a recording once in the blob table and returns its reference (same store as images). */
export async function putAudio(blob: Blob) {
  const id = 'a' + nanoid(20)
  await db.blobs.put({ id, blob, type: blob.type || 'audio/mp4', size: blob.size, at: Date.now() })
  return REF + id
}
const blobOf = async (ref: string) => (await db.blobs.get(ref.slice(REF.length)))?.blob ?? null

// ---------------------------------------------------------------- Groq client
const BASE = 'https://api.groq.com/openai/v1'
export class GroqError extends Error { status: number; constructor(msg: string, status = 0) { super(msg); this.status = status } }

let useRelay = false
/**
 * Calls Groq straight from the browser. If the browser blocks that (some networks and privacy
 * extensions do), it falls back to this site's own /api/groq relay, which just forwards the request.
 */
async function groq(path: string, init: RequestInit, key: string, onWait?: (s: number) => void): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res: Response
    try {
      res = await fetch(useRelay ? `/api/groq?path=${encodeURIComponent(path)}` : BASE + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${key}` } })
    } catch (e) {
      if (!navigator.onLine) throw new GroqError("You're offline. Folio will keep the recording — try again when you're connected.")
      if (!useRelay) { useRelay = true; continue }
      throw new GroqError(`Couldn't reach Groq (${(e as Error).message}).`)
    }
    if (useRelay && res.status === 404) throw new GroqError("Couldn't reach Groq from this browser, and this copy of Folio has no relay. Deploy the whole project folder (with its api folder) to Vercel.")
    if (res.ok) return res.json()
    const body = await res.text().catch(() => '')
    let msg = ''
    try { msg = JSON.parse(body)?.error?.message ?? '' } catch { msg = body.slice(0, 200) }
    if (res.status === 429) {
      // Free-plan rate limit: wait as long as Groq asks, then try again.
      const wait = Math.min(65, Math.ceil(Number(res.headers.get('retry-after')) || parseWait(msg) || 10 * (attempt + 1)))
      onWait?.(wait)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (res.status === 401) throw new GroqError('Groq rejected the key. Check it in Settings → Voice & AI.', 401)
    if (res.status === 413) throw new GroqError('That piece of audio is too large for Groq.', 413)
    if (res.status >= 500 && attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue }
    throw new GroqError(msg || `Groq answered ${res.status}.`, res.status)
  }
  throw new GroqError("Groq's free limit is busy right now. Try again in a minute.", 429)
}
const parseWait = (msg: string) => { const m = msg.match(/try again in (?:(\d+)m)?([\d.]+)s/i); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) + 1 : 0 }

export async function testKey(key: string) {
  const r = await groq('/models', { method: 'GET' }, key)
  return (r?.data ?? []).map((m: any) => m.id as string) as string[]
}

const extFor = (type: string) => (/mp4|m4a|aac/.test(type) ? 'm4a' : /webm/.test(type) ? 'webm' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : /mpeg|mp3/.test(type) ? 'mp3' : 'm4a')

interface Seg { start: number; end: number; text: string }
async function transcribe(blob: Blob, s: VoiceSettings, onWait?: (n: number) => void): Promise<{ text: string; segments: Seg[]; duration: number }> {
  const fd = new FormData()
  fd.append('file', new File([blob], `memo.${extFor(blob.type)}`, { type: blob.type || 'audio/mp4' }))
  fd.append('model', s.stt)
  fd.append('response_format', 'verbose_json')
  fd.append('temperature', '0')
  if (s.language) fd.append('language', s.language)
  const r = await groq('/audio/transcriptions', { method: 'POST', body: fd }, s.key, onWait)
  return { text: r.text ?? '', segments: (r.segments ?? []).map((x: any) => ({ start: x.start, end: x.end, text: String(x.text ?? '').trim() })), duration: r.duration ?? 0 }
}

async function chat(messages: { role: string; content: string }[], s: VoiceSettings, maxTokens: number, onWait?: (n: number) => void): Promise<string> {
  const body: Record<string, unknown> = { model: s.llm, messages, temperature: 0.3, max_completion_tokens: maxTokens }
  if (s.llm.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low'
  const r = await groq('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, s.key, onWait)
  const out = r?.choices?.[0]?.message?.content ?? ''
  if (!out.trim()) throw new GroqError('The model returned an empty answer. Try again, or pick another model in Settings.')
  return out.trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, '$1')
}

// ---------------------------------------------------------------- prompts
const RULES = (s: VoiceSettings) => [
  'You turn spoken recordings and rough notes into clear, well-organised written documents.',
  s.output === 'en'
    ? 'Write in English, translating anything said in another language (for example Urdu or Hindi).'
    : 'Write in the main language of the source. If it mixes Urdu/Hindi with English, write in English.',
  'Never invent facts, names, numbers or dates. If something is unclear, write [unclear]. Keep technical terms, product names and figures exactly as said.',
  'Remove filler words, false starts and repetition. Output GitHub-flavoured Markdown only: no preamble, no closing remarks, no code fence around the whole answer.',
].join('\n')

const FORMATS: Record<Exclude<MemoStyle, 'transcript'>, string> = {
  minutes: `Write formal meeting minutes with exactly this structure:
# <short descriptive title of the meeting>
**Date:** {date} · **Length:** {length}
**Attendees:** <names mentioned, comma-separated, or "Not stated">

## Summary
<3–5 sentences: purpose of the meeting and the outcome>

## Discussion
<one ### subsection per topic, in the order discussed. Elaborate each point into full sentences: the context, what was said, the reasoning, options considered and concerns raised. Attribute views to people when the source makes it clear.>

## Decisions
<bullet list; "None recorded." if none>

## Action items
<a Markdown task list, one per line: "- [ ] **Owner** — task 📅 YYYY-MM-DD". The meeting was on {iso} — turn any deadline ("Friday", "next week", "end of month") into that calendar date. Use "Unassigned" when no owner is clear; leave out the 📅 date if no deadline was given.>

## Open questions
<bullet list; leave the section out if there are none>

## Next steps
<1–3 bullets>`,
  memo: `Rewrite this as a well-structured note:
# <short descriptive title>
<one or two sentence summary>

Then the content under clear ## headings, using bullet lists and short paragraphs where natural. Keep every idea, detail and example — tidy them, don't drop them.
If any to-dos or reminders were mentioned, end with "## To-do" as a Markdown task list ("- [ ] …"). Today is {iso}: if a to-do has a deadline, add it as " 📅 YYYY-MM-DD" at the end of the line.`,
  journal: `Write this as a personal journal entry, first person, in the speaker's own voice and tone — not a report.
No title and no headings. Short paragraphs. Keep the events, people, feelings and ideas; drop filler.
If they mentioned things they need to do, end with a Markdown task list ("- [ ] …"); today is {iso}, so add " 📅 YYYY-MM-DD" for any deadline.`,
}

const fmtTime = (sec: number) => { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}` }
const fmtLength = (sec: number) => (sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`)

/** Splits long text into pieces of about `size` characters, at paragraph or sentence breaks. */
function chunk(text: string, size: number) {
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size)
    if (cut < size * 0.5) cut = rest.lastIndexOf('. ', size) + 1
    if (cut < size * 0.5) cut = size
    parts.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

// Groq's free plan allows about 8,000 tokens a minute for the big models, so long sources are
// condensed part by part first (map), then written up once (reduce).
const SINGLE_PASS_CHARS = 14000
const PART_CHARS = 9000

async function writeUp(source: string, kind: 'transcript' | 'notes', style: Exclude<MemoStyle, 'transcript'>, meta: { date: string; length: string; iso: string }, s: VoiceSettings, progress: (p: string) => void, extra = '') {
  const wait = (n: number) => progress(`Waiting ${n}s for Groq's free limit…`)
  let material = source
  if (source.length > SINGLE_PASS_CHARS) {
    const parts = chunk(source, PART_CHARS)
    const notes: string[] = []
    for (let i = 0; i < parts.length; i++) {
      progress(`Reading part ${i + 1} of ${parts.length}…`)
      notes.push(await chat([
        { role: 'system', content: RULES(s) },
        { role: 'user', content: `This is part ${i + 1} of ${parts.length} of a ${kind === 'transcript' ? 'recording transcript' : 'set of rough notes'}. Write detailed bullet-point notes of this part: every topic with its key points (who said what, when clear), decisions, action items with owners and dates, numbers and names. Do not summarise details away. No title.\n\n---\n${parts[i]}` },
      ], s, 1400, wait))
    }
    material = notes.map((n, i) => `### Part ${i + 1}\n${n}`).join('\n\n')
    kind = 'notes'
  }
  progress(style === 'minutes' ? 'Writing the minutes…' : 'Writing it up…')
  const format = FORMATS[style].replace('{date}', meta.date).replace('{length}', meta.length).replaceAll('{iso}', meta.iso)
  return chat([
    { role: 'system', content: RULES(s) },
    { role: 'user', content: `${format}${extra ? `\n\n${extra}` : ''}\n\nThe source is ${kind === 'transcript' ? 'a timestamped transcript of a recording' : 'notes taken from it'}:\n\n---\n${material}` },
  ], s, style === 'minutes' ? 3400 : 2600, wait)
}

// ---------------------------------------------------------------- markdown → blocks
let _parser: any = null
async function mdToBlocks(md: string): Promise<any[]> {
  if (!_parser) {
    const [{ BlockNoteEditor }, { schema }] = await Promise.all([import('@blocknote/core'), import('./editorSchema')])
    _parser = BlockNoteEditor.create({ schema } as any)
  }
  const { normalizeCode } = await import('./editorSchema')
  return normalizeCode(await Promise.resolve(_parser.tryParseMarkdownToBlocks(md)))
}
const text = (t: string) => [{ type: 'text', text: t, styles: {} }]

/** Pulls a leading "# Title" off the write-up. */
function splitTitle(md: string) {
  const m = md.match(/^\s*#\s+(.+)\n?/)
  return m ? { title: m[1].replace(/[*_`]/g, '').trim(), body: md.slice(m[0].length) } : { title: '', body: md }
}

/** Transcript paragraphs: a new paragraph after a pause or about every minute, each with its time. */
function transcriptParagraphs(segs: Seg[]) {
  const paras: { at: number; text: string }[] = []
  for (const sg of segs) {
    const last = paras[paras.length - 1]
    const prevEnd = (last as any)?.end ?? -99
    if (!last || sg.start - prevEnd > 1.6 || sg.start - last.at > 60) paras.push({ at: sg.start, text: sg.text, ...{ end: sg.end } } as any)
    else { last.text += ' ' + sg.text; (last as any).end = sg.end }
  }
  return paras.filter((p) => p.text.trim())
}

// ---------------------------------------------------------------- pipeline
const running = new Set<string>()
export const isProcessing = (id: string) => running.has(id)

const memoOf = async (id: string) => (await db.notes.get(id))?.memo
async function setMemo(id: string, patch: Partial<Memo>) {
  const cur = await memoOf(id); if (!cur) return
  await patchNote(id, { memo: { ...cur, ...patch } })
}

const audioBlocks = (refs: string[]) => refs.map((url, i) => ({ type: 'audio', props: { url, name: refs.length > 1 ? `Recording, part ${i + 1}` : 'Recording', showPreview: true } }))

/**
 * Turns a recorded memo into a written page. Safe to call again after an error:
 * it reuses the saved transcript instead of transcribing twice.
 */
export async function processMemo(noteId: string, opts: { style?: MemoStyle } = {}) {
  if (running.has(noteId)) return
  const s = await getVoiceSettings()
  const note = await db.notes.get(noteId)
  if (!note?.memo) return
  const style = opts.style ?? note.memo.style
  if (!s.key) { await setMemo(noteId, { status: 'recorded', style, error: undefined, progress: undefined }); return }
  running.add(noteId)
  const progress = (p: string) => setMemo(noteId, { progress: p })
  try {
    let transcript = note.memo.transcript
    let duration = note.memo.duration
    if (!transcript && note.memo.source !== 'text') {
      await setMemo(noteId, { status: 'transcribing', style, error: undefined, progress: 'Transcribing…' })
      const all: Seg[] = []
      let offset = 0
      for (let i = 0; i < note.memo.audio.length; i++) {
        const blob = await blobOf(note.memo.audio[i]); if (!blob) continue
        if (note.memo.audio.length > 1) await progress(`Transcribing part ${i + 1} of ${note.memo.audio.length}…`)
        const r = await transcribe(blob, s, (n) => progress(`Waiting ${n}s for Groq's free limit…`))
        for (const sg of r.segments) all.push({ start: sg.start + offset, end: sg.end + offset, text: sg.text })
        if (!r.segments.length && r.text) all.push({ start: offset, end: offset + r.duration, text: r.text })
        offset += r.duration || 0
      }
      duration = Math.max(duration, offset)
      const paras = transcriptParagraphs(all)
      transcript = paras.map((p) => `[${fmtTime(p.at)}] ${p.text}`).join('\n')
      if (!transcript.trim()) throw new GroqError("No speech was found in the recording.")
      await setMemo(noteId, { transcript, duration })
    }
    let formal: any[] = []
    let title = note.title
    const when = new Date(note.createdAt)
    let followUp: Memo['followUp']
    let extra = ''
    if (style === 'minutes' && note.series) {
      // Carry over: the previous meeting in this series and what's still open from it.
      const prev = (await db.notes.filter((n) => n.series === note.series).toArray())
        .filter((n) => n.id !== note.id && n.trashedAt === null && !n.locked && n.createdAt < note.createdAt).sort((a, b) => b.createdAt - a.createdAt)[0]
      const open = prev ? prev.checklist.map((c, i) => ({ ...c, i })).filter((c) => !c.checked && c.text.trim()) : []
      if (prev && open.length) {
        const pd = new Date(prev.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        followUp = { fromNoteId: prev.id, fromTitle: prev.title || pd, items: open.map((c) => ({ index: c.i, text: c.text.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/, ''), status: 'unknown' as const })) }
        extra = `Open action items from the previous meeting in this series (${pd}):\n${followUp.items.map((it, n) => `[${n + 1}] ${it.text}`).join('\n')}\n\nAdd a section "## Follow-up from last meeting" right after the Summary, one line per item above, in exactly this form:\n- [n] ✅ <item> — <what was said> (only if this meeting says it is done)\n- [n] ⏳ <item> — <update> (still in progress or still open)\n- [n] ❔ <item> — not discussed\nDon't repeat these items under Action items unless they got a new owner or deadline.`
      }
    }
    if (style !== 'transcript') {
      await setMemo(noteId, { status: 'writing', style, error: undefined })
      let md = await writeUp(transcript ?? '', note.memo.source === 'text' ? 'notes' : 'transcript', style,
        { date: when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), length: duration ? fmtLength(duration) : 'Not recorded', iso: `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')} (${when.toLocaleDateString('en', { weekday: 'long' })})` }, s, progress, extra)
      if (followUp) {
        for (const m of md.matchAll(/^\s*[-*]\s*\[(\d+)\]\s*(✅|⏳|❔)/gmu)) {
          const it = followUp.items[Number(m[1]) - 1]
          if (it) it.status = m[2] === '✅' ? 'done' : m[2] === '⏳' ? 'open' : 'unknown'
        }
        md = md.replace(/^(\s*[-*]\s*)\[\d+\]\s*/gmu, '$1')
      }
      const split = splitTitle(md)
      if (note.series && (!note.title || note.title.startsWith('Voice memo'))) title = `${note.series} · ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      else if (split.title && (!note.title || note.title.startsWith('Voice memo'))) title = split.title
      formal = await mdToBlocks(split.body)
    }
    // Assemble the page: the write-up, then the recording, then the transcript (folded away).
    const fresh = await db.notes.get(noteId); if (!fresh?.memo) return
    if (fresh.content?.length && fresh.memo.v) await snapshot(fresh) // earlier write-up stays in history
    const keepAudio = s.keepAudio && fresh.memo.audio.length > 0
    const isTextSource = fresh.memo.source === 'text'
    const transcriptKids = isTextSource ? await mdToBlocks(transcript ?? '') : (transcript ?? '').split('\n').filter(Boolean).map((line) => ({ type: 'paragraph', content: text(line) }))
    const content = [
      ...formal,
      ...(keepAudio ? [{ type: 'heading', props: { level: 3 }, content: text('Recording') }, ...audioBlocks(fresh.memo.audio)] : []),
      ...(style === 'transcript'
        ? transcriptKids
        : [{ type: 'heading', props: { level: 3, isToggleable: true }, content: text(isTextSource ? 'Original notes' : 'Transcript'), children: transcriptKids }]),
    ]
    await updateNote(noteId, {
      title, content,
      memo: { ...fresh.memo, status: 'done', style, transcript, duration, audio: keepAudio ? fresh.memo.audio : [], progress: undefined, error: undefined, v: (fresh.memo.v ?? 0) + 1, ...(followUp ? { followUp } : {}) },
    })
  } catch (e) {
    await setMemo(noteId, { status: 'error', error: (e as Error).message || 'Something went wrong.', progress: undefined })
  } finally {
    running.delete(noteId)
  }
}

/** Creates the note for a finished recording, then starts the write-up if a key is set. */
export async function saveRecording(segments: Blob[], duration: number, style: MemoStyle, labels: string[], series: string | null = null) {
  const refs: string[] = []
  for (const b of segments) if (b.size) refs.push(await putAudio(b))
  const s = await getVoiceSettings()
  const when = new Date()
  const note = await createNote({
    title: `Voice memo · ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
    content: [{ type: 'heading', props: { level: 3 }, content: text('Recording') }, ...audioBlocks(refs)],
    labels, series,
    memo: { status: s.key ? 'transcribing' : 'recorded', style, audio: refs, duration, source: 'audio', v: 0 },
  })
  if (s.key) void processMemo(note.id)
  return note
}

/** "Formalise with AI" for a typed note: the current text becomes the source. */
export async function formaliseText(note: Note, markdown: string, style: Exclude<MemoStyle, 'transcript'>) {
  await snapshot(note)
  const memo: Memo = { status: 'writing', style, audio: note.memo?.audio ?? [], duration: note.memo?.duration ?? 0, source: 'text', transcript: markdown, v: note.memo?.v ?? 0 }
  await patchNote(note.id, { memo })
  await processMemo(note.id, { style })
}

/** Rough size of a source for the UI ("about 3 minutes of reading for the model"). */
export const tooShort = (md: string) => md.replace(/\s+/g, ' ').trim().length < 40

/** Every series name in use, most recent first. */
export async function seriesNames(): Promise<string[]> {
  const seen = new Map<string, number>()
  await db.notes.each((n) => { if (n.series && n.trashedAt === null) seen.set(n.series, Math.max(seen.get(n.series) ?? 0, n.updatedAt)) })
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

/** Tick, in the previous meeting's note, the items this meeting said are done. */
export async function applyFollowUp(noteId: string) {
  const n = await db.notes.get(noteId); const f = n?.memo?.followUp; if (!n?.memo || !f) return 0
  const prev = await db.notes.get(f.fromNoteId)
  const done = f.items.filter((i) => i.status === 'done')
  if (prev) {
    const { setChecked } = await import('./tasks')
    let c = prev.content
    for (const it of done) c = setChecked(c, it.index, true)
    await updateNote(prev.id, { content: c })
  }
  await patchNote(noteId, { memo: { ...n.memo, followUp: { ...f, applied: true } } })
  return done.length
}

// ---------------------------------------------------------------- dictation & journal
/** Speech → text for inserting into the page being written. `tidy` fixes punctuation and drops filler words. */
export async function dictate(blobs: Blob[], tidy: boolean, onProgress?: (p: string) => void): Promise<string> {
  const s = await getVoiceSettings()
  if (!s.key) throw new GroqError('Add your free Groq key in Settings → Voice & AI to dictate.')
  let raw = ''
  for (const b of blobs) { onProgress?.('Transcribing…'); raw += (raw ? ' ' : '') + (await transcribe(b, s, (n) => onProgress?.(`Waiting ${n}s for Groq…`))).text.trim() }
  if (!raw.trim()) throw new GroqError('No speech was heard.')
  if (!tidy) return raw.trim()
  onProgress?.('Tidying…')
  return chat([
    { role: 'system', content: RULES(s) },
    { role: 'user', content: `Clean up this dictation so it can go straight into a document: fix punctuation and capitalisation, drop filler words and false starts, split into paragraphs. Keep the speaker's wording and language. Use a Markdown list only if they were clearly listing things; turn spoken to-dos into "- [ ] …". Output only the cleaned text.\n\n---\n${raw}` },
  ], s, 1500)
}

/** Markdown → editor blocks (for inserting dictation). */
export const markdownToBlocks = (md: string) => mdToBlocks(md)

/** Spoken journal: written up in the speaker's voice and added to today's daily note. */
export async function saveJournalEntry(segments: Blob[], duration: number, onProgress?: (p: string) => void) {
  const { openDaily } = await import('./db')
  const daily = await openDaily()
  const s = await getVoiceSettings()
  const at = new Date()
  const refs: string[] = []
  if (s.keepAudio || !s.key) for (const b of segments) if (b.size) refs.push(await putAudio(b))
  let body: any[] = []
  let failed = ''
  if (s.key) {
    try {
      onProgress?.('Transcribing…')
      let raw = ''
      for (const b of segments) raw += ' ' + (await transcribe(b, s, (n) => onProgress?.(`Waiting ${n}s for Groq…`))).text
      onProgress?.('Writing your entry…')
      const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
      const md = await writeUp(raw.trim(), 'transcript', 'journal', { date: at.toDateString(), length: fmtLength(duration), iso }, s, (p) => onProgress?.(p))
      body = await mdToBlocks(md)
    } catch (e) { failed = (e as Error).message }
  }
  const fresh = await db.notes.get(daily.id)
  const content = [...(fresh?.content ?? [])]
  while (content.length && content[content.length - 1]?.type === 'paragraph' && !(content[content.length - 1].content?.length)) content.pop()
  content.push(
    { type: 'heading', props: { level: 3 }, content: text(`🎙 ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`) },
    ...body,
    ...(failed ? [{ type: 'paragraph', content: text(`(Not written up: ${failed})`) }] : []),
    ...(!s.key ? [{ type: 'paragraph', content: text('(Add a Groq key in Settings → Voice & AI to have entries written up.)') }] : []),
    ...audioBlocks(refs),
  )
  await updateNote(daily.id, { content })
  return daily
}

/** One-off question to the user's Groq model (Margins: explain a passage, summarise a page, tidy text). */
export async function askAI(system: string, user: string, maxTokens = 900, onWait?: (s: number) => void): Promise<string> {
  const s = await getVoiceSettings()
  if (!s.key) throw new GroqError(aiOn() ? 'Add your free Groq key in Settings → AI to use this.' : 'AI features are off. You can turn them on in Settings → AI.')
  return chat([{ role: 'system', content: system }, { role: 'user', content: user }], s, maxTokens, onWait)
}
