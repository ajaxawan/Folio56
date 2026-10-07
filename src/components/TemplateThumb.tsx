import { memo } from 'react'
import type { Template } from '../types'
import { coverCss, surface } from '../lib/colors'
import { usePrefs } from '../lib/prefs'
import { autoValue, ctxNow, parseToken } from '../lib/templateKit'
import { useImageUrl, isRef } from '../lib/blobs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
const TOKEN = /(\{\{\s*[^{}]+?\s*\}\})/g

/** Text with {{tokens}}: automatic ones show what they'll become, questions show as placeholder chips. */
function Tokens({ text }: { text: string }) {
  if (!text.includes('{{')) return <>{text}</>
  const ctx = ctxNow()
  return <>{text.split(TOKEN).map((part, i) => {
    const m = part.match(/^\{\{\s*([^{}]+?)\s*\}\}$/)
    if (!m) return part
    const p = parseToken(m[1])
    if ('auto' in p) return <span key={i} className="tpl-auto">{autoValue(p.auto, ctx) || p.auto}</span>
    return <span key={i} className="tpl-field">{p.label}</span>
  })}</>
}
function Inline({ content }: { content: unknown }) {
  if (typeof content === 'string') return <Tokens text={content} />
  if (!Array.isArray(content)) return null
  return <>{content.map((it: Block, i: number) => {
    if (it.type === 'link') return <span key={i} className="tpl-link"><Inline content={it.content} /></span>
    if (it.type !== 'text') return null
    const s = it.styles ?? {}
    return <span key={i} style={{ fontWeight: s.bold ? 600 : undefined, fontStyle: s.italic ? 'italic' : undefined, textDecoration: s.strike ? 'line-through' : s.underline ? 'underline' : undefined, fontFamily: s.code ? 'var(--font-mono, monospace)' : undefined }}><Tokens text={it.text ?? ''} /></span>
  })}</>
}
const textLen = (c: unknown): number => (typeof c === 'string' ? c.length : Array.isArray(c) ? c.reduce((n: number, it: Block): number => n + (it.text?.length ?? textLen(it.content)), 0) : 0)

function Blocks({ blocks, limit }: { blocks: Block[]; limit: number }) {
  let num = 0
  return <>{blocks.slice(0, limit).map((b, i) => {
    if (b.type !== 'numberedListItem') num = 0
    const kids = b.children?.length ? <div className="pl-[1.2em]"><Blocks blocks={b.children} limit={6} /></div> : null
    switch (b.type) {
      case 'heading': return <div key={i} className="tpl-h font-title" data-level={b.props?.level ?? 2}><Inline content={b.content} /></div>
      case 'bulletListItem': return <div key={i}><div className="tpl-li"><span className="tpl-mark">•</span><span><Inline content={b.content} /></span></div>{kids}</div>
      case 'numberedListItem': return <div key={i}><div className="tpl-li"><span className="tpl-mark">{++num}.</span><span><Inline content={b.content} /></span></div>{kids}</div>
      case 'checkListItem': return <div key={i} className="tpl-li"><span className={`tpl-box ${b.props?.checked ? 'on' : ''}`} /><span className={b.props?.checked ? 'line-through opacity-60' : ''}><Inline content={b.content} /></span></div>
      case 'quote': return <div key={i} className="tpl-quote"><Inline content={b.content} /></div>
      case 'divider': return <hr key={i} className="tpl-hr" />
      case 'codeBlock': return <pre key={i} className="tpl-code"><Inline content={b.content} /></pre>
      case 'image': return <div key={i} className="tpl-img" />
      case 'table': {
        const rows: Block[] = b.content?.rows ?? []
        return (
          <table key={i} className="tpl-table"><tbody>
            {rows.slice(0, 6).map((r, ri) => <tr key={ri}>{(r.cells ?? []).map((c: Block, ci: number) => { const C = ri === 0 ? 'th' : 'td'; return <C key={ci}><Inline content={Array.isArray(c) ? c : c?.content} /></C> })}</tr>)}
          </tbody></table>
        )
      }
      default: return textLen(b.content) ? <p key={i} className="tpl-p"><Inline content={b.content} /></p> : <div key={i} className="h-[.6em]" />
    }
  })}</>
}

/** A live miniature of the page a template makes — its colour, cover, title and real content. */
export const TemplateThumb = memo(function TemplateThumb({ t, large }: { t: Template; large?: boolean }) {
  const { dark, prefs } = usePrefs()
  const look = surface(t.color ?? 'default', dark, prefs.cardStyle)
  const coverRef = useImageUrl(isRef(t.cover) ? t.cover : null)
  const cover = isRef(t.cover) ? (coverRef ? `center / cover no-repeat url("${coverRef}")` : null) : coverCss(t.cover)
  const paper = t.paper && t.paper !== 'none' ? `paper-${t.paper}` : ''
  return (
    <div aria-hidden className={`tpl-page ${large ? 'tpl-large' : 'tpl-small'} ${paper}`} style={{ background: look.background, borderColor: look.borderColor }}>
      {cover && <div className="tpl-cover" style={{ background: cover }} />}
      <div className="tpl-body">
        {t.icon && <div className="tpl-icon">{t.icon}</div>}
        <div className="tpl-title font-title">{t.title ? <Tokens text={t.title} /> : <span className="text-muted">{t.name}</span>}</div>
        <Blocks blocks={t.content ?? []} limit={large ? 200 : 16} />
        {!!t.children?.length && (
          <div className="tpl-pages">{t.children.map((p, i) => <div key={i} className="tpl-pagechip">{p.icon ?? '📄'} <Tokens text={p.title} /></div>)}</div>
        )}
      </div>
      {!large && <div className="tpl-fade" style={{ background: `linear-gradient(transparent, ${t.color && t.color !== 'default' ? 'transparent' : 'var(--color-card)'})` }} />}
    </div>
  )
})
