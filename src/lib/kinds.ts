// V6.2: notes and pages are different things.
//  · Notes are quick: cards on the home screen, Keep-style.
//  · Pages are deep: long documents with pages inside, in the Pages tree, Notion-style.
// Nothing is migrated: a note without a kind is worked out from where it sits — anything in a page
// tree (it has a parent, or pages inside) is a page; everything else is a note. Choosing "Turn into
// a page / note" stores the kind, and that choice always wins. Old backups and links just work.
import type { Note } from '../types'

/** Ids of every page, worked out in one pass over all notes. */
export function pageIds(notes: Note[]): Set<string> {
  const hasKids = new Set<string>()
  for (const n of notes) if (n.parentId && n.trashedAt === null) hasKids.add(n.parentId)
  const out = new Set<string>()
  for (const n of notes) {
    if (n.kind === 'page' || (n.kind === undefined && !n.daily && !n.deck && (!!n.parentId || hasKids.has(n.id)))) out.add(n.id)
  }
  return out
}
/** The same test for one note, when you know whether it has pages inside. */
export const isPage = (n: Note, hasKids: boolean) => n.kind === 'page' || (n.kind === undefined && !n.daily && !n.deck && (!!n.parentId || hasKids))
