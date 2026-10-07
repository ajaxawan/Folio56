export type ColorKey =
  | 'default' | 'coral' | 'peach' | 'sand' | 'mint' | 'sage'
  | 'fog' | 'storm' | 'dusk' | 'blossom' | 'clay'

export interface ChecklistItem { text: string; checked: boolean }

export interface Cipher { iv: string; salt: string; data: string }

export interface Note {
  id: string
  title: string
  // BlockNote document (Block[]) as JSON. Empty when the note is locked.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any[]
  color: ColorKey
  pinned: boolean
  archived: boolean
  trashedAt: number | null
  parentId: string | null
  labels: string[]
  position: number
  locked: boolean
  cipher: Cipher | null
  daily: string | null // YYYY-MM-DD for daily notes
  icon?: string | null   // emoji
  cover?: string | null  // 'g:<preset>' gradient or data: URL image
  paper?: Paper
  // derived for cards + search
  preview: string
  checklist: ChecklistItem[]
  image: string | null
  words: number
  createdAt: number
  updatedAt: number
  /** Bumped on every local change (pin, trash, edit…) so backups merge the latest state. */
  rev?: number
  /** Voice memo / AI formalising state (V5.3). */
  memo?: Memo
  /** Series / stack name (V5.4): recurring meetings, numbered docs… shown as one stacked card. */
  series?: string | null
  /** V6: this note is a working copy of a template being edited (id of the template). Hidden everywhere else. */
  templateDraft?: string | null
  /** V6.1: this note is a presentation (slides + theme); its content mirrors the slides as an outline. */
  deck?: import('./lib/deck').Deck | null
}

export type MemoStyle = 'minutes' | 'memo' | 'transcript' | 'journal'
export type MemoStatus = 'recorded' | 'transcribing' | 'writing' | 'done' | 'error'
export interface Memo {
  status: MemoStatus
  style: MemoStyle
  /** Audio segments (blob references), in order. */
  audio: string[]
  /** Seconds of audio. */
  duration: number
  /** Timestamped transcript, kept so the write-up can be redone without re-transcribing. */
  transcript?: string
  /** "Transcribing part 2 of 3…" while working. */
  progress?: string
  error?: string
  /** Bumped whenever Folio rewrites the page, so an open editor reloads it. */
  v?: number
  /** Where the source text came from: a recording, or the note's own typed text. */
  source?: 'audio' | 'text'
  /** Open action items from the previous meeting in the series, and what this meeting said about them. */
  followUp?: { fromNoteId: string; fromTitle: string; items: { index: number; text: string; status: 'done' | 'open' | 'unknown' }[]; applied?: boolean }
}

export interface Label { id: string; name: string; color?: ColorKey }

export type Paper = 'none' | 'grid' | 'dots' | 'lines'

export interface Version {
  id: string
  noteId: string
  at: number
  title: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any[]
  words: number
}

/** A sub-page inside a multi-page template. */
export interface TemplatePage {
  title: string
  icon?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any[]
  children?: TemplatePage[]
}

export interface Template {
  id: string
  name: string
  emoji: string
  /** Title of the new note; may hold {{variables}} and {{fields}}. */
  title: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any[]
  builtin?: boolean
  // ---- V6 ----
  category?: string
  description?: string
  /** Look of the note it creates. */
  color?: ColorKey
  icon?: string | null
  cover?: string | null
  paper?: Paper
  labels?: string[]
  /** Sub-pages created under the new note. */
  children?: TemplatePage[]
  createdAt?: number
  updatedAt?: number
  /** Made just now to be edited (blank, or a copy of a built-in); discarding the edit removes it. */
  fresh?: boolean
}

export type View =
  | { kind: 'notes' }
  | { kind: 'pages' }
  | { kind: 'tasks' }
  | { kind: 'journal' }
  | { kind: 'margins' }
  | { kind: 'review' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; labelId: string }
