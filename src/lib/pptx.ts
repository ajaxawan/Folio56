// Deck → PowerPoint (.pptx), mirroring the on-screen layouts (16:9, 13.33 × 7.5 in) and the theme's
// colours and type. Speaker notes go into PowerPoint's notes. Loaded only when you download one.
import PptxGenJS from 'pptxgenjs'
import { themeOf, metaFor, type Deck } from './deck'
import { isRef, toDataUrl } from './blobs'
import { BODY, mix, palette, sceneFor, type Scene } from './deckDiagrams'
import type { DeckTheme, Slide } from './deckRender'

const IN = (px: number) => px / 96
const PT = (px: number) => Math.round(px * 0.75)
const hex = (c: string) => c.replace('#', '').toUpperCase()
const FACE = { serif: 'Georgia', sans: 'Calibri', mono: 'Consolas' }

type Run = { text: string; options?: Record<string, unknown> }
/** "**bold** rest" → text runs. */
function runs(s: string, base: Record<string, unknown> = {}): Run[] {
  const out: Run[] = []
  s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach((part) => {
    const b = /^\*\*(.+)\*\*$/.exec(part)
    out.push({ text: b ? b[1] : part, options: { ...base, ...(b ? { bold: true } : {}) } })
  })
  return out.length ? out : [{ text: '', options: base }]
}
function bulletRuns(items: string[], color: string, size: number): Run[] {
  const out: Run[] = []
  items.forEach((it) => {
    // a plain bullet takes the text colour, so it reads on light and dark slides alike
    const r = runs(it, { color, fontSize: size, bullet: { indent: 22 }, paraSpaceAfter: 8 })
    r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true }
    out.push(...r)
  })
  return out
}

type Pptx = InstanceType<typeof PptxGenJS>
type PSlide = ReturnType<Pptx['addSlide']>

/** Draws a diagram scene as native PowerPoint shapes, lines and text — editable after export. */
function drawScene(pptx: Pptx, slide: PSlide, sc: Scene, face: string, body: string) {
  const runs = (lines: { t: string; size: number; bold?: boolean; color: string; title?: boolean }[]) =>
    lines.map((l, i) => ({ text: l.t, options: { fontSize: PT(l.size), bold: !!l.bold, color: hex(l.color), fontFace: l.title ? face : body, breakLine: i < lines.length - 1 } }))
  const shapeOf = (k: string) => k === 'diamond' ? pptx.ShapeType.diamond : k === 'ellipse' ? pptx.ShapeType.ellipse : k === 'rect' ? pptx.ShapeType.rect : pptx.ShapeType.roundRect
  // lines first, so boxes sit on top of them
  for (const p of sc.prims) {
    if (p.k !== 'line') continue
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [x1, y1] = p.pts[i], [x2, y2] = p.pts[i + 1]
      const last = i + 2 === p.pts.length
      slide.addShape(pptx.ShapeType.line, {
        x: IN(Math.min(x1, x2)), y: IN(Math.min(y1, y2)), w: IN(Math.abs(x2 - x1)), h: IN(Math.abs(y2 - y1)), flipH: x2 < x1, flipV: y2 < y1,
        line: { color: hex(p.color), width: p.sw * 0.75, ...(p.dash ? { dashType: 'dash' as const } : {}), ...(p.arrow && last ? { endArrowType: 'triangle' as const } : {}) },
      })
    }
  }
  for (const p of sc.prims) {
    if (p.k === 'box') {
      const opts = {
        shape: shapeOf(p.shape), x: IN(p.x), y: IN(p.y), w: IN(p.w), h: IN(p.h),
        fill: p.fill ? { color: hex(p.fill) } : { type: 'none' as const }, line: p.stroke ? { color: hex(p.stroke), width: (p.sw ?? 1) * 0.75 } : { type: 'none' as const },
        rectRadius: p.shape === 'pill' ? IN(p.h / 2) : p.shape === 'round' ? 0.15 : undefined,
        align: p.text?.align ?? 'center', valign: p.text?.valign ?? 'middle', margin: (p.text?.pad ?? 4) * 0.75,
      }
      if (p.text) slide.addText(runs(p.text.lines) as never, opts as never)
      else slide.addShape(opts.shape, opts as never)
    } else if (p.k === 'text') {
      slide.addText(runs(p.text.lines) as never, { x: IN(p.x), y: IN(p.y), w: IN(p.w), h: IN(p.h), align: p.text.align ?? 'left', valign: p.text.valign ?? 'top', margin: 0, fit: 'shrink' } as never)
    }
  }
}

/** Charts go in as real PowerPoint charts, so the numbers stay editable. */
function addChart(pptx: Pptx, slide: PSlide, s: Slide, t: DeckTheme, body: string) {
  const c = s.chart!
  const data = c.data.filter((d) => Number.isFinite(d.value)).slice(0, 10)
  if (!data.length) return
  const series = [{ name: c.series || s.title || 'Values', labels: data.map((d) => d.label), values: data.map((d) => d.value) }]
  const base = { x: IN(BODY.x), y: IN(BODY.y), w: IN(BODY.w), h: IN(BODY.h - 20), catAxisLabelColor: hex(t.muted), catAxisLabelFontFace: body, catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' as const }, catAxisLineShow: true, catAxisLineColor: hex(t.line), showValue: true, dataLabelColor: hex(t.fg), dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelFontFace: body, showLegend: false, altText: `${c.kind} chart: ${data.map((d) => `${d.label} ${d.value}${c.unit ?? ''}`).join(', ')}` }
  const max = Math.max(...data.map((d) => d.value))
  if (c.kind === 'pie') {
    slide.addChart(pptx.ChartType.doughnut, series, { ...base, holeSize: 50, chartColors: palette(t, data.length).map(hex), showValue: false, showPercent: true, showLegend: true, legendPos: 'r', legendFontSize: 16, legendColor: hex(t.fg), legendFontFace: body, dataLabelColor: hex(t.bg) } as never)
  } else if (c.kind === 'line') {
    slide.addChart(pptx.ChartType.line, series, { ...base, chartColors: [hex(t.accent)], lineSize: 3, lineDataSymbol: 'circle', lineDataSymbolSize: 9, dataLabelPosition: 't' } as never)
  } else {
    // one colour per bar: the biggest one in the accent, the rest lighter
    const cols = data.map((d) => hex(d.value === max ? t.accent : mix(t.accent, t.bg, 0.35)))
    slide.addChart(pptx.ChartType.bar, series, { ...base, barDir: c.kind === 'bar' ? 'bar' : 'col', barGapWidthPct: 60, chartColors: cols, dataLabelPosition: 'outEnd', catAxisOrientation: c.kind === 'bar' ? 'maxMin' : 'minMax' } as never)
  }
}

export async function deckToPptx(deck: Deck, author?: string): Promise<Blob> {
  const t = themeOf(deck.theme)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title; pptx.author = author || 'Folio'; pptx.company = 'Folio'
  const face = FACE[t.font]
  const body = t.font === 'mono' ? 'Consolas' : 'Calibri'
  for (const [i, s] of deck.slides.entries()) {
    const m = metaFor(deck, i, author)
    const hero = (s.layout === 'title' || s.layout === 'section' || s.layout === 'closing') && !!t.hero
    const fg = hex(hero ? t.hero!.fg : t.fg), muted = hex(hero ? t.hero!.muted : t.muted), accent = hex(t.accent)
    const slide = pptx.addSlide()
    slide.background = { color: hex(hero ? t.hero!.bg : t.bg) }
    // decor
    if (t.decor === 'band' && !hero) slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: IN(14), h: 7.5, fill: { color: accent }, line: { color: accent } })
    if (t.decor === 'block') {
      if (hero) slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: IN(430), h: 7.5, fill: { color: accent }, line: { color: accent } })
      else slide.addShape(pptx.ShapeType.rect, { x: IN(1258), y: 0, w: IN(22), h: 7.5, fill: { color: accent }, line: { color: accent } })
    }
    if (t.decor === 'sun' && hero) slide.addShape(pptx.ShapeType.ellipse, { x: IN(860), y: IN(140), w: IN(300), h: IN(300), fill: { color: 'FFFFFF', transparency: 78 }, line: { color: 'FFFFFF', transparency: 100 } })
    const left = t.decor === 'block' && hero ? IN(500) : IN(88), width = 13.333 - left - IN(88)
    const title = (y = IN(64)) => {
      const n = (s.title || '').length // same steps as the preview: action titles get smaller, not cut off
      slide.addText(runs(s.title || ' ', { color: fg, fontFace: face, bold: true }), { x: left, y, w: width, h: IN(n > 38 ? 100 : 80), fontSize: PT(n > 75 ? 34 : n > 38 ? 40 : 50), valign: 'top', margin: 0, fit: 'shrink' })
      if (t.decor === 'rule') slide.addShape(pptx.ShapeType.line, { x: left, y: y + IN(n > 38 ? 104 : 84), w: Math.min(width, IN(16 * Math.max(8, (s.title || '').length) + 40)), h: 0, line: { color: accent, width: 2.25 } })
    }
    const list = (items: string[], x: number, y: number, w: number, h: number) => {
      if (!items.length) return
      const n = items.join(' ').length
      const size = n > 520 || items.length > 8 ? 21 : n > 330 || items.length > 5 ? 24 : 28
      slide.addText(bulletRuns(items, fg, PT(size)), { x, y, w, h, fontFace: body, valign: 'top', margin: 0, fit: 'shrink', lineSpacingMultiple: 1.1 })
    }
    const top = IN(64 + 80 + 30)
    switch (s.layout) {
      case 'agenda': case 'process': case 'flow': case 'cycle': case 'timeline': case 'matrix': case 'chart': {
        title()
        if (s.layout === 'chart') addChart(pptx, slide, s, t, body)
        else { const sc = sceneFor(s, t); if (sc) drawScene(pptx, slide, sc, face, body) }
        if (s.layout !== 'cycle' && s.subtitle) slide.addText(runs(s.subtitle, { color: muted, fontFace: body }), { x: left, y: IN(720 - 112), w: width, h: IN(36), fontSize: PT(22), margin: 0 })
        break
      }
      case 'title': {
        if (m.author || m.date) slide.addText([m.author, m.date].filter(Boolean).join(' · ').toUpperCase(), { x: left, y: IN(190), w: width, h: IN(30), fontSize: PT(18), color: hero ? muted : accent, bold: true, charSpacing: 2, fontFace: body, margin: 0 })
        slide.addText(runs(s.title || deck.title, { color: fg, bold: true, fontFace: face }), { x: left, y: IN(235), w: Math.min(width, IN(1000)), h: IN(200), fontSize: PT(78), valign: 'top', margin: 0, fit: 'shrink' })
        if (s.subtitle) slide.addText(runs(s.subtitle, { color: muted, fontFace: body }), { x: left, y: IN(450), w: Math.min(width, IN(900)), h: IN(110), fontSize: PT(30), valign: 'top', margin: 0, fit: 'shrink' })
        break
      }
      case 'section': {
        if (m.sectionNo) slide.addText(String(m.sectionNo).padStart(2, '0'), { x: left, y: IN(200), w: 3, h: IN(120), fontSize: PT(120), bold: true, color: hero ? muted : accent, fontFace: face, margin: 0 })
        slide.addText(runs(s.title, { color: fg, bold: true, fontFace: face }), { x: left, y: IN(330), w: Math.min(width, IN(1000)), h: IN(170), fontSize: PT(72), valign: 'top', margin: 0, fit: 'shrink' })
        if (s.subtitle) slide.addText(runs(s.subtitle, { color: muted, fontFace: body }), { x: left, y: IN(510), w: width, h: IN(90), fontSize: PT(30), margin: 0, fit: 'shrink' })
        break
      }
      case 'closing': {
        slide.addText(runs(s.title || 'Thank you', { color: fg, bold: true, fontFace: face }), { x: left, y: IN(150), w: width, h: IN(100), fontSize: PT(64), margin: 0, fit: 'shrink' })
        list(s.bullets ?? [], left, IN(290), width, IN(340))
        break
      }
      case 'two': {
        title()
        const colW = (width - IN(56)) / 2
        ;[s.left, s.right].forEach((c, k) => {
          const x = left + k * (colW + IN(56))
          if (c?.heading) slide.addText(runs(c.heading, { color: accent, bold: true, fontFace: body }), { x, y: top, w: colW, h: IN(44), fontSize: PT(30), margin: 0 })
          list(c?.bullets ?? [], x, top + (c?.heading ? IN(60) : 0), colW, IN(400))
        })
        break
      }
      case 'stat': {
        title()
        const st = (s.stats ?? []).slice(0, 3)
        const gap = IN(36), w = (width - gap * (st.length - 1)) / Math.max(1, st.length)
        st.forEach((x, k) => {
          const bx = left + k * (w + gap)
          slide.addShape(pptx.ShapeType.roundRect, { x: bx, y: top + IN(20), w, h: IN(250), fill: { color: hex(t.surface) }, line: { color: hex(t.surface) }, rectRadius: 0.15 })
          slide.addText(x.value, { x: bx + IN(30), y: top + IN(50), w: w - IN(60), h: IN(100), fontSize: PT(84), bold: true, color: accent, fontFace: face, margin: 0, fit: 'shrink' })
          slide.addText(runs(x.label, { color: hex(t.fg), fontFace: body }), { x: bx + IN(30), y: top + IN(160), w: w - IN(60), h: IN(90), fontSize: PT(24), valign: 'top', margin: 0, fit: 'shrink' })
        })
        if (s.subtitle) slide.addText(runs(s.subtitle, { color: muted, fontFace: body }), { x: left, y: top + IN(300), w: width, h: IN(80), fontSize: PT(24), margin: 0 })
        break
      }
      case 'quote': {
        slide.addText('“', { x: left, y: IN(120), w: 2, h: IN(120), fontSize: PT(150), color: accent, fontFace: face, margin: 0 })
        slide.addText(runs(s.quote?.text || s.title, { color: fg, bold: true, fontFace: face }), { x: left, y: IN(240), w: width, h: IN(280), fontSize: PT(52), valign: 'top', margin: 0, fit: 'shrink' })
        if (s.quote?.by) slide.addText(`— ${s.quote.by}`, { x: left, y: IN(540), w: width, h: IN(50), fontSize: PT(26), color: muted, fontFace: body, margin: 0 })
        break
      }
      case 'table': {
        title()
        const tb = s.table ?? { head: [], rows: [] }
        if (tb.head.length) {
          const rows = [tb.head.map((h) => ({ text: h, options: { bold: true, fill: { color: hex(t.surface) }, color: hex(t.fg) } })), ...tb.rows.slice(0, 10).map((r) => tb.head.map((_, k) => ({ text: r[k] ?? '', options: { color: hex(t.fg) } })))]
          slide.addTable(rows as never, { x: left, y: top, w: width, fontFace: body, fontSize: PT(tb.rows.length > 6 ? 19 : 23), border: { type: 'solid', color: hex(t.line), pt: 0.75 }, margin: 0.08, autoPage: false })
        }
        break
      }
      case 'image': {
        const src = s.image ? (isRef(s.image) ? await toDataUrl(s.image) : s.image) : null
        const bare = !s.title && !(s.bullets ?? []).length
        if (bare) { if (src) slide.addImage({ data: src, x: 0, y: 0, w: 13.333, h: 7.5, sizing: { type: 'contain', w: 13.333, h: 7.5 } }); break }
        title()
        const side = (s.bullets ?? []).length > 0
        const w = side ? width - IN(432) : width
        if (src) slide.addImage({ data: src, x: left, y: IN(150), w, h: IN(500), sizing: { type: 'contain', w, h: IN(500) } })
        if (side) list(s.bullets ?? [], 13.333 - IN(88) - IN(400), IN(150), IN(400), IN(500))
        break
      }
      default: {
        title()
        const b = s.bullets ?? []
        if (b.length > 7) { const h = Math.ceil(b.length / 2), cw = (width - IN(56)) / 2; list(b.slice(0, h), left, top, cw, IN(420)); list(b.slice(h), left + cw + IN(56), top, cw, IN(420)) }
        else list(b, left, top, width, s.subtitle ? IN(360) : IN(440))
        if (s.subtitle) slide.addText(runs(s.subtitle, { color: muted, fontFace: body }), { x: left, y: IN(560), w: width, h: IN(60), fontSize: PT(24), margin: 0 })
      }
    }
    if (s.layout !== 'title') {
      slide.addText(deck.title, { x: IN(88), y: IN(680), w: 8, h: IN(26), fontSize: PT(15), color: muted, fontFace: body, margin: 0 })
      slide.addText(`${i + 1} / ${deck.slides.length}`, { x: 13.333 - IN(88) - 2, y: IN(680), w: 2, h: IN(26), fontSize: PT(15), color: muted, fontFace: body, align: 'right', margin: 0 })
    }
    if (s.notes) slide.addNotes(s.notes)
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob
}
