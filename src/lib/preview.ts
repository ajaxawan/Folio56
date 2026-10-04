import type { ChecklistItem } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = any

export function inlineText(content: AnyBlock): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(inlineText).join('')
  if (content.type === 'text') return content.text ?? ''
  if (content.type === 'link') return inlineText(content.content)
  if (content.type === 'tableContent') return (content.rows ?? []).map((r: AnyBlock) => (r.cells ?? []).map((c: AnyBlock) => inlineText(c.content ?? c)).join(' ')).join(' ')
  return ''
}

/** Pull card preview data (text, checklist, first image, word count) out of a BlockNote document. */
export function derive(blocks: AnyBlock[]): { preview: string; checklist: ChecklistItem[]; image: string | null; words: number } {
  const lines: string[] = []
  const checklist: ChecklistItem[] = []
  let image: string | null = null
  let words = 0
  const walk = (bs: AnyBlock[], depth: number) => {
    for (const b of bs ?? []) {
      const text = inlineText(b.content)
      words += (text.match(/\S+/g) ?? []).length
      const pad = '  '.repeat(depth)
      if (b.type === 'checkListItem') checklist.push({ text, checked: !!b.props?.checked })
      else if (b.type === 'image') { if (!image && b.props?.url) image = b.props.url }
      else if (b.type === 'bulletListItem') { if (text) lines.push(pad + '• ' + text) }
      else if (b.type === 'numberedListItem') { if (text) lines.push(pad + '– ' + text) }
      else if (b.type === 'heading') { if (text) lines.push('\u0001' + text) } // marker → bold line on cards
      else if (b.type === 'table') { const r = Math.max(0, (b.content?.rows?.length ?? 1) - 1); lines.push('\u0003Table · ' + r + (r === 1 ? ' row' : ' rows')) }
      else if (b.type === 'codeBlock') { const ls = text.split('\n').filter((l: string) => l.trim()); for (const l of ls.slice(0, 4)) lines.push('\u0002' + l.slice(0, 160)); if (ls.length > 4) lines.push('\u0002…') }
      else if (text || lines.length) lines.push(pad + text)
      if (b.children?.length) walk(b.children, depth + 1)
    }
  }
  walk(blocks, 0)
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return { preview: lines.join('\n').slice(0, 1200), checklist, image, words }
}

export function textToBlocks(text: string) {
  return text.split('\n').map((line) => ({ type: 'paragraph', content: line }))
}

export function checklistToBlocks(items: string[]) {
  return items.filter((t) => t.trim()).map((t) => ({ type: 'checkListItem', props: { checked: false }, content: t }))
}

/** Flip the n-th checklist item (document order) inside a BlockNote document. Returns a new array. */
export function toggleChecklistItem(blocks: AnyBlock[], n: number, checked: boolean): AnyBlock[] {
  let i = 0
  const walk = (bs: AnyBlock[]): AnyBlock[] => bs.map((b) => {
    let nb = b
    if (b.type === 'checkListItem') { if (i === n) nb = { ...b, props: { ...b.props, checked } }; i++ }
    if (b.children?.length) nb = { ...nb, children: walk(b.children) }
    return nb
  })
  return walk(blocks ?? [])
}

export function plainText(blocks: AnyBlock[]): string {
  const out: string[] = []
  const walk = (bs: AnyBlock[]) => { for (const b of bs ?? []) { out.push(inlineText(b.content)); if (b.children?.length) walk(b.children) } }
  walk(blocks)
  return out.join('\n')
}
