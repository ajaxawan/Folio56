// "Copy as message": a note as clean text for WhatsApp/Signal or for email.
import { friendlyDue } from './tasks'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Drops recordings and (unless asked) the folded transcript / original notes. */
export function shareableBlocks(blocks: any[], includeFolded: boolean): any[] {
  const out: any[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (['audio', 'video', 'file'].includes(b.type)) continue
    const text = Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? '').join('') : String(b.content ?? '')
    if (b.type === 'heading' && /^recording$/i.test(text.trim()) && ['audio', undefined].includes(blocks[i + 1]?.type)) continue
    if (b.type === 'heading' && b.props?.isToggleable && !includeFolded) continue
    out.push(b)
  }
  return out
}

const dueWords = (s: string) => s.replace(/\s*📅\s*(\d{4}-\d{2}-\d{2})/g, (_m, d) => ` (due ${friendlyDue(d)})`)

/** Markdown puts a blank line between every block; messages read better with lists and headings kept tight. */
function tighten(lines: string[], isHeading: (l: string) => boolean) {
  const item = (l: string) => /^\s*(•|☐|☑|\[[ x]\]|\d+\.)\s/.test(l)
  return lines.filter((l, i) => {
    if (l.trim()) return true
    const prev = lines[i - 1] ?? '', next = lines[i + 1] ?? ''
    if (item(prev) && item(next)) return false
    if (isHeading(prev) && next.trim()) return false
    return true
  })
}

/** Markdown → WhatsApp / Signal / Telegram style text. */
export function toChat(title: string, md: string) {
  const lines = dueWords(md).replace(/\r/g, '').split('\n').map((l) => {
    let x = l
    x = x.replace(/^#{1,6}\s+(.*)$/, (_m, h) => `*${h.replace(/\*\*/g, '')}*`)
    x = x.replace(/^(\s*)[-*] \[ \] /, '$1☐ ').replace(/^(\s*)[-*] \[[xX]\] /, '$1☑ ')
    x = x.replace(/^(\s*)[-*] /, '$1• ')
    x = x.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (m0, p, t) => (p === '' && /^[•☐☑]/.test(t) ? m0 : `${p}*${t}*`))
    x = x.replace(/`([^`]+)`/g, '```$1```').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    return x
  })
  const tight = tighten(lines, (l) => /^\*[^*]+\*$/.test(l.trim()))
  return `*${title || 'Note'}*\n\n${tight.join('\n')}`.replace(/\n{3,}/g, '\n\n').trim()
}

/** Markdown → plain-text email body (works in any mail app). */
export function toEmail(title: string, md: string) {
  const lines = dueWords(md).replace(/\r/g, '').split('\n').map((l) => {
    const h = l.match(/^(#{1,6})\s+(.*)$/)
    if (h) { const t = h[2].replace(/\*\*/g, ''); return h[1].length <= 2 ? `\n${t.toUpperCase()}` : `\n${t}` }
    return l.replace(/^(\s*)[-*] \[ \] /, '$1[ ] ').replace(/^(\s*)[-*] \[[xX]\] /, '$1[x] ').replace(/^(\s*)[-*] /, '$1• ')
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>')
  })
  const tight = tighten(lines.flatMap((l) => l.split('\n')), (l) => /^[A-Z0-9][A-Z0-9 &·,:'’—-]+$/.test(l.trim()) && l.trim().length > 2)
  return { subject: title || 'Notes', body: tight.join('\n').replace(/\n{3,}/g, '\n\n').trim() }
}
