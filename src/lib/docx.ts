// Notes → a real Word document (.docx): headings, lists (nested, numbered lists restart properly),
// checklists, quotes, code, tables with header rows, images at their natural size, links, colours.
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions, type ParagraphChild,
} from 'docx'
import type { Note } from '../types'
import type { Doc, Options } from './exporter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any
const TEXT: Record<string, string> = { gray: '787774', brown: '64473A', red: 'C4332E', orange: 'C0620B', yellow: 'A07A00', green: '3B7A57', blue: '0B6E99', purple: '6940A5', pink: 'AD1A72' }
const BG: Record<string, string> = { gray: 'EBECED', brown: 'E9E5E3', red: 'FBE4E4', orange: 'F6E9D9', yellow: 'FBF3DB', green: 'DDEDEA', blue: 'DDEBF1', purple: 'EAE4F2', pink: 'F4DFEB' }
const FONT = 'Calibri', MONO = 'Consolas', SERIF = 'Georgia'
const MAX_W = 600 // px at 96 dpi ≈ 6.25 in, the text width of an A4/Letter page with normal margins

const titleOf = (n: Note) => n.title?.trim() || 'Untitled'

function runs(content: unknown, base: Partial<IRunOptions> = {}): ParagraphChild[] {
  if (typeof content === 'string') return content ? [new TextRun({ text: content, ...base })] : []
  if (!Array.isArray(content)) return []
  const out: ParagraphChild[] = []
  for (const it of content as Block[]) {
    if (it.type === 'link') {
      // web links stay clickable; links to other notes become their words
      if (typeof it.href === 'string' && /^(https?:|mailto:)/.test(it.href)) out.push(new ExternalHyperlink({ link: it.href, children: runs(it.content, { ...base, style: 'Hyperlink' }) as TextRun[] }))
      else out.push(...runs(it.content, base))
      continue
    }
    if (it.type !== 'text' || !it.text) continue
    const s = it.styles ?? {}
    // a line break inside a block (shift+enter) becomes a Word line break
    it.text.split('\n').forEach((line: string, i: number) => {
      out.push(new TextRun({
        ...base, text: line, break: i ? 1 : undefined,
        bold: s.bold || base.bold, italics: s.italic || base.italics, strike: s.strike, underline: s.underline ? {} : undefined,
        font: s.code ? MONO : base.font, color: s.textColor && TEXT[s.textColor] ? TEXT[s.textColor] : base.color,
        shading: s.backgroundColor && BG[s.backgroundColor] ? { type: ShadingType.CLEAR, color: 'auto', fill: BG[s.backgroundColor] } : s.code ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } : undefined,
      }))
    })
  }
  return out
}

async function imageRun(url: string): Promise<ImageRun | null> {
  const m = url.match(/^data:image\/([\w+.-]+);base64,(.*)$/)
  if (!m) return null
  try {
    let type = m[1] === 'jpeg' ? 'jpg' : m[1]
    let bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: `image/${m[1]}` }))
    let { width: w, height: h } = bmp
    // Word can't show webp/avif/svg: redraw those as PNG
    if (!['png', 'jpg', 'gif', 'bmp'].includes(type)) {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (!blob) return null
      bytes = new Uint8Array(await blob.arrayBuffer()); type = 'png'
    }
    bmp.close?.()
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
    return new ImageRun({ type: type as 'png', data: bytes, transformation: { width: w, height: h } })
  } catch { return null }
}

interface Ctx { list: number }
async function blocksToDocx(blocks: Block[], level: number, ctx: Ctx, out: (Paragraph | Table)[]) {
  let numbering = false
  for (const b of blocks ?? []) {
    const indent = level ? { left: 360 * level } : undefined
    if (b.type === 'numberedListItem') { if (!numbering) { ctx.list++; numbering = true } } else numbering = false
    const align = b.props?.textAlignment === 'center' ? AlignmentType.CENTER : b.props?.textAlignment === 'right' ? AlignmentType.RIGHT : b.props?.textAlignment === 'justify' ? AlignmentType.JUSTIFIED : undefined
    const shade = b.props?.backgroundColor && BG[b.props.backgroundColor] ? { type: ShadingType.CLEAR, color: 'auto', fill: BG[b.props.backgroundColor] } : undefined
    const color = b.props?.textColor && TEXT[b.props.textColor] ? TEXT[b.props.textColor] : undefined
    switch (b.type) {
      case 'heading': {
        const lv = b.props?.level ?? 1
        out.push(new Paragraph({ heading: lv === 1 ? HeadingLevel.HEADING_1 : lv === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: runs(b.content, { color }), alignment: align, indent, shading: shade }))
        break
      }
      case 'bulletListItem': out.push(new Paragraph({ children: runs(b.content, { color }), bullet: { level: Math.min(level, 8) }, shading: shade })); break
      case 'numberedListItem': out.push(new Paragraph({ children: runs(b.content, { color }), numbering: { reference: 'numbers', level: Math.min(level, 8), instance: ctx.list }, shading: shade })); break
      case 'checkListItem': {
        const done = !!b.props?.checked
        out.push(new Paragraph({ indent: { left: 360 * level + 360, hanging: 360 }, children: [new TextRun({ text: done ? '☒\t' : '☐\t', font: 'Segoe UI Symbol' }), ...runs(b.content, done ? { color: '8A8F98', strike: true } : { color })] }))
        break
      }
      case 'quote': out.push(new Paragraph({ children: runs(b.content, { italics: true, color: color ?? '555B66' }), indent: { left: 360 * level + 240 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'D1D5DB', space: 10 } }, spacing: { before: 120, after: 120 } })); break
      case 'codeBlock': {
        const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((c: Block) => c.text ?? '').join('')
        out.push(new Paragraph({ indent, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6F8FA' }, spacing: { before: 120, after: 120 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 }, left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 }, right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 } },
          children: text.split('\n').map((line: string, i: number) => new TextRun({ text: line, font: MONO, size: 19, break: i ? 1 : undefined })) }))
        break
      }
      case 'divider': out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D9DDE3', space: 1 } }, spacing: { before: 120, after: 240 } })); break
      case 'image': {
        const run = typeof b.props?.url === 'string' ? await imageRun(b.props.url) : null
        if (run) out.push(new Paragraph({ children: [run], alignment: AlignmentType.CENTER, spacing: { before: 120, after: b.props?.caption ? 40 : 160 } }))
        if (b.props?.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.props.caption, italics: true, color: '6B7280', size: 19 })], spacing: { after: 160 } }))
        break
      }
      case 'table': {
        const rows: Block[] = b.content?.rows ?? []
        const header = (b.content?.headerRows ?? 1) > 0
        const cols = Math.max(1, ...rows.map((r) => r.cells?.length ?? 0))
        if (!rows.length) break
        out.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((r, ri) => new TableRow({
            tableHeader: header && ri === 0,
            children: Array.from({ length: cols }, (_, ci) => {
              const cell = r.cells?.[ci]
              const content = Array.isArray(cell) ? cell : cell?.content
              const bg = !Array.isArray(cell) && cell?.props?.backgroundColor && BG[cell.props.backgroundColor] ? BG[cell.props.backgroundColor] : header && ri === 0 ? 'F3F4F6' : undefined
              return new TableCell({
                shading: bg ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: runs(content, header && ri === 0 ? { bold: true } : {}) })],
              })
            }),
          })),
        }))
        out.push(new Paragraph({ children: [], spacing: { after: 120 } }))
        break
      }
      default: {
        const kids = runs(b.content, { color })
        out.push(new Paragraph({ children: kids, alignment: align, indent, shading: shade }))
      }
    }
    if (b.children?.length) await blocksToDocx(b.children, level + 1, ctx, out)
  }
}

/** One .docx holding the given notes; each note starts on a new page, pages inside follow their parent. */
export async function docxFor(docs: Doc[], labels: Record<string, string>, o: Options): Promise<Blob> {
  const ctx: Ctx = { list: 0 }
  const body: (Paragraph | Table)[] = []
  for (const [i, d] of docs.entries()) {
    const n = d.note
    body.push(new Paragraph({
      heading: d.depth ? HeadingLevel.HEADING_1 : HeadingLevel.TITLE, pageBreakBefore: i > 0,
      children: [new TextRun({ text: `${n.icon ? n.icon + ' ' : ''}${titleOf(n)}` })],
    }))
    if (o.details) {
      const parts = [`Created ${new Date(n.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, `Edited ${new Date(n.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`]
      const ls = n.labels.map((l) => labels[l]).filter(Boolean); if (ls.length) parts.push(ls.join(', '))
      body.push(new Paragraph({ children: [new TextRun({ text: parts.join(' · '), color: '6B7280', size: 19 })], spacing: { after: 240 } }))
    }
    await blocksToDocx(o.images ? d.blocks : d.blocks.filter((b: Block) => b.type !== 'image'), 0, ctx, body)
  }
  const doc = new Document({
    creator: 'Folio', title: docs.length === 1 ? titleOf(docs[0].note) : 'Folio export', description: 'Exported from Folio',
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: '1F2328' }, paragraph: { spacing: { after: 100, line: 300 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: SERIF, size: 52, bold: true, color: '111827' }, paragraph: { spacing: { after: 120 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: '111827' }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 27, bold: true, color: '1F2937' }, paragraph: { spacing: { before: 280, after: 100 }, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '374151' }, paragraph: { spacing: { before: 220, after: 80 }, keepNext: true } },
      ],
      characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', basedOn: 'DefaultParagraphFont', run: { color: '2563EB', underline: {} } }],
    },
    numbering: {
      config: [{
        reference: 'numbers',
        levels: Array.from({ length: 9 }, (_, l) => ({
          level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l % 3], text: `%${l + 1}.`, alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 360 * (l + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: body }],
  })
  return Packer.toBlob(doc)
}
