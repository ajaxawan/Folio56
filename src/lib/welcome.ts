// V6.2 first run: a short welcome on a brand-new browser, and a guide note that teaches by being used.
import { createNote, db } from './db'

type Run = string | { type: 'text'; text: string; styles: { bold?: boolean } }
/** "Type **[[** to link" → text runs with bold where the stars are. */
const rich = (s: string): Run[] => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => {
  const b = /^\*\*(.+)\*\*$/.exec(p)
  return b ? { type: 'text', text: b[1], styles: { bold: true } } : { type: 'text', text: p, styles: {} }
})
const h = (t: string) => ({ type: 'heading', props: { level: 2 }, content: t })
const p = (t: string) => ({ type: 'paragraph', content: rich(t) })
const todo = (t: string) => ({ type: 'checkListItem', props: { checked: false }, content: rich(t) })
const li = (t: string) => ({ type: 'bulletListItem', content: rich(t) })

export const WELCOME_TITLE = 'Welcome to Folio56'

export function welcomeBlocks() {
  return [
    p('This note is yours to keep, change or delete. Tick things off as you try them.'),
    h('Try these'),
    todo('Type **[[** and a few letters to link to another note'),
    todo('Type **/** for headings, tables, checklists, code and pictures'),
    todo('Press **Ctrl K** (or tap search) to find anything — typos are fine'),
    todo('Start a note from a template: type **/template**'),
    todo('Open a PDF in **Margins** and write notes beside it'),
    todo('Pick a theme you like in **Settings**'),
    h('Keep your notes safe'),
    p('Your notes live only in this browser, on this device. Nothing is uploaded, so a backup is the only spare copy.'),
    todo('Make your first backup: **Settings → Backups → Back up now**'),
    todo('Install Folio56 so it opens like an app and works offline'),
    h('Notes, pages and notebooks'),
    li('**Notes** are quick cards on the board — ideas, lists, minutes.'),
    li('**Pages** are for writing that grows: a project, a wiki, a book. Pages can hold pages. Turn a note into a page from its **⋯** menu.'),
    li('**Notebooks** in the sidebar keep notes and pages together by subject.'),
    h('Good to know'),
    li('AI stays off unless you switch it on in Settings, with your own free key.'),
    li('Each browser keeps its own notes. Move them with a backup file or a share link.'),
    li('Clearing this browser’s data clears your notes too — keep that backup.'),
  ]
}

export async function isWelcomed() { return !!(await db.meta.get('welcomed'))?.value }
export async function markWelcomed() { await db.meta.put({ key: 'welcomed', value: Date.now() }) }

/** Adds the guide note (pinned) and returns its id. */
export async function addWelcomeNote() {
  const n = await createNote({ title: WELCOME_TITLE, content: welcomeBlocks() as never, pinned: true })
  await markWelcomed()
  return n.id
}
