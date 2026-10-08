// V6.2 diagram slides. Every diagram is first laid out as a small "scene" of boxes, text and lines
// in slide pixels (1280 × 720). The HTML preview and the PowerPoint export both draw that same
// scene, so what you see in Folio56 is what lands in PowerPoint — as real, editable shapes.
import type { DeckTheme, Slide } from './deckRender'

export interface Run { t: string; size: number; bold?: boolean; color: string; title?: boolean }
export interface TextSpec { lines: Run[]; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; pad?: number }
export type Prim =
  | { k: 'box'; x: number; y: number; w: number; h: number; shape: 'rect' | 'round' | 'pill' | 'diamond' | 'ellipse'; fill?: string; stroke?: string; sw?: number; text?: TextSpec }
  | { k: 'text'; x: number; y: number; w: number; h: number; text: TextSpec }
  | { k: 'line'; pts: [number, number][]; color: string; sw: number; arrow?: boolean; dash?: boolean }
export interface Scene { prims: Prim[]; alt: string }

// the body area under a slide title
export const BODY = { x: 88, y: 186, w: 1104, h: 450 }

// ---------------------------------------------------------------- colours
const hexToRgb = (h: string) => { const m = h.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const toHex = (r: number[]) => '#' + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
/** a → b by t (0..1) */
export const mix = (a: string, b: string, t: number) => { const x = hexToRgb(a), y = hexToRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
/** Distinct, theme-matched colours for chart series and pie slices. */
export function palette(t: DeckTheme, n: number): string[] {
  const base = [t.accent, mix(t.accent, t.fg, 0.45), mix(t.accent, t.bg, 0.45), mix(t.fg, t.bg, 0.35), mix(t.accent, t.fg, 0.7), mix(t.accent, t.bg, 0.7)]
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(base[i % base.length])
  return out
}

// ---------------------------------------------------------------- shared bits
const nz = (s?: string) => (s ?? '').trim()
/** "label — detail" helpers for the editors */
export const itemLine = (i: { label: string; detail?: string; when?: string }) => [i.when ? `${i.when}:` : '', i.label, i.detail ? `— ${i.detail}` : ''].filter(Boolean).join(' ')
export function parseItemLine(line: string, withWhen = false) {
  let rest = line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim()
  let when: string | undefined
  if (withWhen) { const m = /^([^:—–]{1,24}):\s*(.+)$/.exec(rest); if (m) { when = m[1].trim(); rest = m[2].trim() } }
  const [label, ...d] = rest.split(/\s+[—–-]\s+/)
  return { label: label.trim(), detail: d.join(' — ').trim() || undefined, when }
}

/** Where a line from a box's centre towards (tx,ty) leaves the box. */
function edgePoint(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number, diamond = false): [number, number] {
  const dx = tx - cx, dy = ty - cy
  if (!dx && !dy) return [cx, cy]
  const s = diamond ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh) : Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9))
  return [cx + dx * s, cy + dy * s]
}

// ---------------------------------------------------------------- process (a straight flow of steps)
function process(s: Slide, t: DeckTheme): Scene {
  const items = (s.items ?? []).filter((i) => nz(i.label)).slice(0, 6)
  const n = Math.max(1, items.length)
  const gap = n > 4 ? 34 : 46
  const w = (BODY.w - gap * (n - 1)) / n
  const small = n > 4
  const longest = Math.max(...items.map((i) => i.label.length + (i.detail?.length ?? 0) * 0.8), 10)
  const h = Math.min(330, 150 + Math.ceil(longest / Math.max(8, w / 14)) * 26), y = BODY.y + Math.max(10, (BODY.h - h) / 2 - 30)
  const prims: Prim[] = []
  items.forEach((it, i) => {
    const x = BODY.x + i * (w + gap)
    prims.push({ k: 'box', x, y, w, h, shape: 'round', fill: t.surface, stroke: i === 0 ? t.accent : t.line, sw: i === 0 ? 3 : 1.5 })
    prims.push({ k: 'box', x: x + 22, y: y + 24, w: 48, h: 48, shape: 'ellipse', fill: t.accent, text: { lines: [{ t: String(i + 1), size: 22, bold: true, color: onAccent(t) }], align: 'center', valign: 'middle', pad: 0 } })
    prims.push({ k: 'text', x: x + 22, y: y + 90, w: w - 44, h: h - 110, text: { lines: [{ t: it.label, size: small ? 22 : 26, bold: true, color: t.fg, title: true }, ...(it.detail ? [{ t: it.detail, size: small ? 17 : 20, color: t.muted }] : [])], align: 'left', valign: 'top', pad: 0 } })
    if (i < n - 1) prims.push({ k: 'line', pts: [[x + w + 6, y + h / 2], [x + w + gap - 6, y + h / 2]], color: t.accent, sw: 3, arrow: true })
  })
  return { prims, alt: `Process: ${items.map((i, k) => `${k + 1}. ${i.label}`).join(', ')}` }
}
const onAccent = (t: DeckTheme) => {
  const [r, g, b] = hexToRgb(t.accent); const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1A1A1A' : '#FFFFFF'
}

// ---------------------------------------------------------------- cycle (a loop that repeats)
function cycle(s: Slide, t: DeckTheme): Scene {
  const items = (s.items ?? []).filter((i) => nz(i.label)).slice(0, 6)
  const n = Math.max(1, items.length)
  const cx = 640, cy = BODY.y + BODY.h / 2 + 4, rx = n <= 3 ? 300 : 360, ry = n <= 3 ? 150 : 170
  const bw = n > 4 ? 236 : 260, bh = items.some((i) => i.detail) ? 104 : 80
  const pos = items.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as [number, number] })
  const prims: Prim[] = []
  // centre label: the slide's subtitle, if any
  if (nz(s.subtitle)) prims.push({ k: 'text', x: cx - 150, y: cy - 40, w: 300, h: 80, text: { lines: [{ t: s.subtitle!, size: 20, color: t.muted }], align: 'center', valign: 'middle' } })
  for (let i = 0; i < n && n > 1; i++) {
    const [ax, ay] = pos[i], [bx, by] = pos[(i + 1) % n]
    const p1 = edgePoint(ax, ay, bw / 2 + 8, bh / 2 + 8, bx, by), p2 = edgePoint(bx, by, bw / 2 + 10, bh / 2 + 10, ax, ay)
    prims.push({ k: 'line', pts: [p1, p2], color: t.accent, sw: 3, arrow: true })
  }
  items.forEach((it, i) => {
    const [x, y] = pos[i]
    prims.push({ k: 'box', x: x - bw / 2, y: y - bh / 2, w: bw, h: bh, shape: 'round', fill: t.surface, stroke: i === 0 ? t.accent : t.line, sw: i === 0 ? 3 : 1.5,
      text: { lines: [{ t: it.label, size: 22, bold: true, color: t.fg, title: true }, ...(it.detail ? [{ t: it.detail, size: 16, color: t.muted }] : [])], align: 'center', valign: 'middle', pad: 12 } })
  })
  return { prims, alt: `Cycle: ${items.map((i) => i.label).join(' → ')} → back to ${items[0]?.label ?? ''}` }
}

// ---------------------------------------------------------------- timeline
function timeline(s: Slide, t: DeckTheme): Scene {
  const items = (s.items ?? []).filter((i) => nz(i.label) || nz(i.when)).slice(0, 7)
  const n = Math.max(1, items.length)
  const y = BODY.y + 190, x0 = BODY.x + 20, x1 = BODY.x + BODY.w - 20
  const step = (x1 - x0) / n
  const prims: Prim[] = [{ k: 'line', pts: [[x0 - 10, y], [x1 + 10, y]], color: t.line, sw: 4 }]
  items.forEach((it, i) => {
    const cx = x0 + step * (i + 0.5)
    const last = i === n - 1
    prims.push({ k: 'box', x: cx - 13, y: y - 13, w: 26, h: 26, shape: 'ellipse', fill: last ? t.accent : t.bg, stroke: t.accent, sw: 4 })
    prims.push({ k: 'text', x: cx - step / 2 + 6, y: y - 92, w: step - 12, h: 64, text: { lines: [{ t: it.when ?? '', size: n > 5 ? 20 : 24, bold: true, color: t.accent, title: true }], align: 'center', valign: 'bottom' } })
    prims.push({ k: 'text', x: cx - step / 2 + 6, y: y + 34, w: step - 12, h: 230, text: { lines: [{ t: it.label, size: n > 5 ? 19 : 22, bold: true, color: t.fg }, ...(it.detail ? [{ t: it.detail, size: n > 5 ? 16 : 18, color: t.muted }] : [])], align: 'center', valign: 'top' } })
  })
  return { prims, alt: `Timeline: ${items.map((i) => `${i.when ?? ''} ${i.label}`.trim()).join('; ')}` }
}

// ---------------------------------------------------------------- agenda
function agenda(s: Slide, t: DeckTheme): Scene {
  const items = (s.items ?? []).filter((i) => nz(i.label)).slice(0, 8)
  const two = items.length > 4
  const per = two ? Math.ceil(items.length / 2) : items.length
  const colW = two ? (BODY.w - 60) / 2 : BODY.w
  const rowH = Math.min(100, BODY.h / Math.max(per, 1))
  const prims: Prim[] = []
  items.forEach((it, i) => {
    const col = two && i >= per ? 1 : 0, row = col ? i - per : i
    const x = BODY.x + col * (colW + 60), y = BODY.y + 10 + row * rowH
    prims.push({ k: 'text', x, y, w: 90, h: rowH - 10, text: { lines: [{ t: String(i + 1).padStart(2, '0'), size: 40, bold: true, color: t.accent, title: true }], align: 'left', valign: 'top' } })
    prims.push({ k: 'text', x: x + 96, y: y + 4, w: colW - 100, h: rowH - 10, text: { lines: [{ t: it.label, size: 26, bold: true, color: t.fg }, ...(it.detail ? [{ t: it.detail, size: 18, color: t.muted }] : [])], align: 'left', valign: 'top' } })
    prims.push({ k: 'line', pts: [[x, y + rowH - 6], [x + colW, y + rowH - 6]], color: t.line, sw: 1 })
  })
  return { prims, alt: `Agenda: ${items.map((i) => i.label).join(', ')}` }
}

// ---------------------------------------------------------------- 2 × 2 matrix
function matrix(s: Slide, t: DeckTheme): Scene {
  const m = s.matrix ?? { x: '', y: '', quads: [] }
  const q = [0, 1, 2, 3].map((i) => m.quads[i] ?? { title: '', points: [] })
  const ax = BODY.x + 70, ay = BODY.y, aw = BODY.w - 70, ah = BODY.h - 40
  const gw = (aw - 14) / 2, gh = (ah - 14) / 2
  const prims: Prim[] = []
  q.forEach((qq, i) => {
    const x = ax + (i % 2) * (gw + 14), y = ay + Math.floor(i / 2) * (gh + 14)
    const star = i === 1 // top right: the "high / high" corner
    prims.push({ k: 'box', x, y, w: gw, h: gh, shape: 'round', fill: star ? mix(t.surface, t.accent, 0.16) : t.surface, stroke: star ? t.accent : t.line, sw: star ? 2.5 : 1,
      text: { lines: [{ t: qq.title || ' ', size: 24, bold: true, color: star ? t.accent : t.fg, title: true }, ...qq.points.slice(0, 3).map((p) => ({ t: '• ' + p, size: 18, color: t.fg }))], align: 'left', valign: 'top', pad: 20 } })
  })
  // axes: y up the left side, x along the bottom
  prims.push({ k: 'line', pts: [[ax - 22, ay + ah], [ax - 22, ay]], color: t.muted, sw: 2, arrow: true })
  prims.push({ k: 'line', pts: [[ax, ay + ah + 20], [ax + aw, ay + ah + 20]], color: t.muted, sw: 2, arrow: true })
  prims.push({ k: 'text', x: ax, y: ay + ah + 24, w: aw, h: 30, text: { lines: [{ t: m.x || 'Low → high', size: 18, bold: true, color: t.muted }], align: 'center', valign: 'top' } })
  prims.push({ k: 'text', x: BODY.x - 40, y: ay + ah / 2 - 15, w: 90, h: 60, text: { lines: [{ t: m.y || '', size: 16, bold: true, color: t.muted }], align: 'center', valign: 'middle' } })
  return { prims, alt: `2 by 2 matrix. ${m.y ? `Up: ${m.y}. ` : ''}${m.x ? `Across: ${m.x}. ` : ''}${q.map((x) => x.title).filter(Boolean).join('; ')}` }
}

// ---------------------------------------------------------------- flowchart (steps, decisions, branches)
export interface FlowNode { id: string; label: string; kind: 'start' | 'step' | 'decision' | 'end' }
export interface Flow { nodes: FlowNode[]; edges: { from: string; to: string; label?: string }[] }

/** Ranks (columns) by longest path from the start, ignoring loops back. */
export function flowLayout(f: Flow) {
  const nodes = f.nodes.slice(0, 10)
  const ids = new Set(nodes.map((n) => n.id))
  const edges = f.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
  // find back edges with a DFS from the starts
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  edges.forEach((e) => out.get(e.from)!.push(e.to))
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1))
  const starts = nodes.filter((n) => n.kind === 'start' || !indeg.get(n.id))
  const order = starts.length ? starts : nodes.slice(0, 1)
  const state = new Map<string, 0 | 1 | 2>()
  const back = new Set<string>()
  const dfs = (id: string) => { state.set(id, 1); for (const to of out.get(id) ?? []) { const st = state.get(to); if (st === 1) back.add(`${id}>${to}`); else if (!st) dfs(to) } state.set(id, 2) }
  order.forEach((n) => { if (!state.get(n.id)) dfs(n.id) })
  nodes.forEach((n) => { if (!state.get(n.id)) dfs(n.id) })
  const fwd = edges.filter((e) => !back.has(`${e.from}>${e.to}`))
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (let pass = 0; pass < nodes.length; pass++) for (const e of fwd) rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(e.from)! + 1))
  const R = Math.max(...rank.values()) + 1
  const cols: FlowNode[][] = Array.from({ length: R }, () => [])
  nodes.forEach((n) => cols[rank.get(n.id)!].push(n))
  // order each column by the average position of what leads into it (fewer crossings)
  const yIndex = new Map<string, number>()
  cols.forEach((col, r) => {
    if (r) col.sort((a, b) => avg(a) - avg(b))
    col.forEach((n, i) => yIndex.set(n.id, i - (col.length - 1) / 2))
    function avg(n: FlowNode) { const ins = fwd.filter((e) => e.to === n.id).map((e) => yIndex.get(e.from) ?? 0); return ins.length ? ins.reduce((a, b) => a + b, 0) / ins.length : 0 }
  })
  return { nodes, edges, back, rank, cols, R, yIndex }
}

function flow(s: Slide, t: DeckTheme): Scene {
  const f = s.flow ?? { nodes: [], edges: [] }
  if (!f.nodes.length) return { prims: [], alt: 'Empty flowchart' }
  const L = flowLayout(f)
  const maxRows = Math.max(...L.cols.map((c) => c.length))
  const hasBack = L.edges.some((e) => L.back.has(`${e.from}>${e.to}`))
  const gapX = L.R > 4 ? 44 : 60
  const nw = Math.min(250, (BODY.w - gapX * (L.R - 1)) / L.R)
  const areaH = BODY.h - (hasBack ? 56 : 10)
  const nh = Math.min(96, (areaH - 24 * (maxRows - 1)) / maxRows)
  const rowStep = maxRows > 1 ? Math.min(nh + 60, (areaH - nh) / (maxRows - 1)) : 0
  const midY = BODY.y + areaH / 2
  const totalW = L.R * nw + (L.R - 1) * gapX
  const left = BODY.x + (BODY.w - totalW) / 2
  const box = new Map<string, { cx: number; cy: number; hw: number; hh: number; n: FlowNode }>()
  L.nodes.forEach((n) => {
    const r = L.rank.get(n.id)!
    const cx = left + r * (nw + gapX) + nw / 2, cy = midY + (L.yIndex.get(n.id) ?? 0) * rowStep
    const d = n.kind === 'decision'
    box.set(n.id, { cx, cy, hw: (d ? nw * 1.0 : nw) / 2, hh: (d ? nh * 1.15 : nh) / 2, n })
  })
  const prims: Prim[] = []
  const bottom = Math.max(...[...box.values()].map((b) => b.cy + b.hh)) + 30
  for (const e of L.edges) {
    const a = box.get(e.from)!, b = box.get(e.to)!
    const isBack = L.back.has(`${e.from}>${e.to}`)
    let pts: [number, number][]
    let lab: [number, number]
    if (isBack) {
      const y = bottom
      pts = [[a.cx, a.cy + a.hh], [a.cx, y], [b.cx, y], [b.cx, b.cy + b.hh + 6]]
      lab = [(a.cx + b.cx) / 2, y + 4]
    } else if (Math.abs(a.cy - b.cy) < 2) {
      pts = [[a.cx + a.hw, a.cy], [b.cx - b.hw - 6, b.cy]]
      lab = [(a.cx + a.hw + b.cx - b.hw) / 2, a.cy - 32]
    } else {
      // leave from the side (decisions leave from top/bottom towards the branch), then elbow across
      const fromSide: [number, number] = a.n.kind === 'decision' ? [a.cx, a.cy + Math.sign(b.cy - a.cy) * a.hh] : [a.cx + a.hw, a.cy]
      const mx = a.n.kind === 'decision' ? a.cx : (a.cx + a.hw + b.cx - b.hw) / 2
      pts = a.n.kind === 'decision' ? [fromSide, [mx, b.cy], [b.cx - b.hw - 6, b.cy]] : [fromSide, [mx, a.cy], [mx, b.cy], [b.cx - b.hw - 6, b.cy]]
      // the label sits above the last stretch, clear of the shapes
      lab = [(mx + b.cx - b.hw) / 2, b.cy - 32]
    }
    prims.push({ k: 'line', pts, color: isBack ? t.muted : t.accent, sw: 2.5, arrow: true, dash: isBack })
    if (nz(e.label)) prims.push({ k: 'text', x: lab[0] - 60, y: lab[1], w: 120, h: 28, text: { lines: [{ t: e.label!, size: 16, bold: true, color: t.muted }], align: 'center', valign: 'middle' } })
  }
  for (const b of box.values()) {
    const k = b.n.kind
    const shape = k === 'decision' ? 'diamond' : k === 'start' || k === 'end' ? 'pill' : 'round'
    const fill = k === 'start' || k === 'end' ? t.accent : k === 'decision' ? mix(t.surface, t.accent, 0.14) : t.surface
    const color = k === 'start' || k === 'end' ? onAccent(t) : t.fg
    prims.push({ k: 'box', x: b.cx - b.hw, y: b.cy - b.hh, w: b.hw * 2, h: b.hh * 2, shape, fill, stroke: k === 'decision' ? t.accent : k === 'step' ? t.line : t.accent, sw: k === 'step' ? 1.5 : 2,
      text: { lines: [{ t: b.n.label, size: L.R > 4 || nh < 70 ? 17 : 20, bold: k !== 'step', color }], align: 'center', valign: 'middle', pad: k === 'decision' ? 22 : 10 } })
  }
  const say = L.edges.map((e) => `${box.get(e.from)!.n.label} ${e.label ? `(${e.label}) ` : ''}→ ${box.get(e.to)!.n.label}`).join('; ')
  return { prims, alt: `Flowchart: ${say}` }
}

/** Text form of a flowchart for the editor: one connection per line. [Brackets] mark a decision, (round) a start or end. */
export function flowToText(f: Flow) {
  const name = (id: string) => { const n = f.nodes.find((x) => x.id === id); if (!n) return id; return n.kind === 'decision' ? `[${n.label}]` : n.kind === 'start' || n.kind === 'end' ? `(${n.label})` : n.label }
  const used = new Set<string>()
  const lines = f.edges.map((e) => { used.add(e.from); used.add(e.to); return `${name(e.from)} ${e.label ? `-${e.label}->` : '->'} ${name(e.to)}` })
  f.nodes.filter((n) => !used.has(n.id)).forEach((n) => lines.push(name(n.id)))
  return lines.join('\n')
}
export function textToFlow(text: string): Flow {
  const nodes = new Map<string, FlowNode>()
  const edges: Flow['edges'] = []
  const node = (raw: string): string => {
    const r = raw.trim()
    const kind: FlowNode['kind'] = /^\[.*\]$/.test(r) ? 'decision' : /^\(.*\)$/.test(r) ? 'start' : 'step'
    const label = r.replace(/^[[(]|[\])]$/g, '').trim()
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'n' + nodes.size
    if (!nodes.has(id)) nodes.set(id, { id, label, kind })
    return id
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split(/\s*-(?:([^->]*?)-)?>\s*/)
    // parts: [a, label?, b, label?, c ...]
    let prev = node(parts[0])
    for (let i = 1; i + 1 < parts.length; i += 2) { const to = node(parts[i + 1]); edges.push({ from: prev, to, label: parts[i]?.trim() || undefined }); prev = to }
  }
  // a rounded node with nothing after it is an end
  const outs = new Set(edges.map((e) => e.from))
  for (const n of nodes.values()) if (n.kind === 'start' && edges.some((e) => e.to === n.id) && !outs.has(n.id)) n.kind = 'end'
  return { nodes: [...nodes.values()], edges }
}

// ---------------------------------------------------------------- charts (drawn here for the preview; PowerPoint gets a native chart)
export function chartScene(s: Slide, t: DeckTheme): Scene {
  const c = s.chart ?? { kind: 'column', data: [] }
  const data = c.data.filter((d) => Number.isFinite(d.value)).slice(0, 10)
  const prims: Prim[] = []
  const fmt = (v: number) => `${Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${c.unit && c.unit.length <= 3 ? c.unit : ''}`
  if (!data.length) return { prims, alt: 'Empty chart' }
  const area = { x: BODY.x + 10, y: BODY.y + 10, w: BODY.w - 20, h: BODY.h - 30 }
  const max = Math.max(...data.map((d) => d.value), 0), min = Math.min(0, ...data.map((d) => d.value))
  const span = max - min || 1
  // the biggest value gets the strong colour: the eye goes to the point of the chart
  const top1 = data.findIndex((d) => d.value === max)
  if (c.kind === 'pie') {
    // the preview draws pies with SVG arcs (pieHtml); PowerPoint gets a native pie
    return { prims, alt: `Pie chart: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}` }
  }
  if (c.kind === 'bar') {
    const labelW = 260, gap = 14
    const bh = Math.min(48, (area.h - gap * (data.length - 1)) / data.length)
    data.forEach((d, i) => {
      const y = area.y + i * (bh + gap)
      const w = ((d.value - min) / span) * (area.w - labelW - 120)
      prims.push({ k: 'text', x: area.x, y, w: labelW - 16, h: bh, text: { lines: [{ t: d.label, size: 19, color: t.fg }], align: 'right', valign: 'middle' } })
      prims.push({ k: 'box', x: area.x + labelW, y, w: Math.max(2, w), h: bh, shape: 'rect', fill: i === top1 ? t.accent : mix(t.accent, t.bg, 0.35) })
      prims.push({ k: 'text', x: area.x + labelW + w + 10, y, w: 120, h: bh, text: { lines: [{ t: fmt(d.value), size: 19, bold: true, color: t.fg }], align: 'left', valign: 'middle' } })
    })
    return { prims, alt: `Bar chart${c.series ? ` of ${c.series}` : ''}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}` }
  }
  // column and line share axes
  const top = area.y + 30, base = area.y + area.h - 46, ph = base - top
  const step = area.w / data.length
  const yOf = (v: number) => base - ((v - min) / span) * ph
  prims.push({ k: 'line', pts: [[area.x, base], [area.x + area.w, base]], color: t.line, sw: 2 })
  if (c.kind === 'line') {
    const pts = data.map((d, i) => [area.x + step * (i + 0.5), yOf(d.value)] as [number, number])
    prims.push({ k: 'line', pts, color: t.accent, sw: 4 })
    pts.forEach(([x, y], i) => {
      prims.push({ k: 'box', x: x - 8, y: y - 8, w: 16, h: 16, shape: 'ellipse', fill: t.accent })
      prims.push({ k: 'text', x: x - step / 2, y: y - 40, w: step, h: 28, text: { lines: [{ t: fmt(data[i].value), size: 18, bold: true, color: t.fg }], align: 'center', valign: 'bottom' } })
    })
  } else {
    const bw = Math.min(110, step * 0.62)
    data.forEach((d, i) => {
      const x = area.x + step * (i + 0.5) - bw / 2, y = yOf(Math.max(d.value, 0)), h = Math.abs(yOf(d.value) - yOf(0))
      prims.push({ k: 'box', x, y, w: bw, h: Math.max(2, h), shape: 'rect', fill: i === top1 ? t.accent : mix(t.accent, t.bg, 0.35) })
      prims.push({ k: 'text', x: x - 30, y: y - 34, w: bw + 60, h: 28, text: { lines: [{ t: fmt(d.value), size: 18, bold: true, color: t.fg }], align: 'center', valign: 'bottom' } })
    })
  }
  data.forEach((d, i) => prims.push({ k: 'text', x: area.x + step * i + 4, y: base + 8, w: step - 8, h: 40, text: { lines: [{ t: d.label, size: data.length > 7 ? 15 : 18, color: t.muted }], align: 'center', valign: 'top' } }))
  return { prims, alt: `${c.kind === 'line' ? 'Line' : 'Column'} chart${c.series ? ` of ${c.series}` : ''}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}` }
}

export function sceneFor(s: Slide, t: DeckTheme): Scene | null {
  switch (s.layout) {
    case 'process': return process(s, t)
    case 'cycle': return cycle(s, t)
    case 'timeline': return timeline(s, t)
    case 'agenda': return agenda(s, t)
    case 'matrix': return matrix(s, t)
    case 'flow': return flow(s, t)
    case 'chart': return chartScene(s, t)
    default: return null
  }
}

// ---------------------------------------------------------------- scene → HTML (preview, present, PDF)
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const textHtml = (sp: TextSpec, font: string, tfont: string, padX?: number) => {
  const j = sp.valign === 'middle' ? 'center' : sp.valign === 'bottom' ? 'flex-end' : 'flex-start'
  return `<div style="position:absolute;inset:0;padding:${sp.pad ?? 0}px ${padX ?? sp.pad ?? 0}px;display:flex;flex-direction:column;justify-content:${j};text-align:${sp.align ?? 'left'};gap:4px;overflow:hidden">${sp.lines.map((l) => `<div style="font-size:${l.size}px;line-height:1.2;font-weight:${l.bold ? 700 : 400};color:${l.color};font-family:${l.title ? tfont : font}">${esc(l.t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`).join('')}</div>`
}
export function sceneHtml(sc: Scene, font: string, tfont: string, id: string) {
  const parts: string[] = []
  const svg: string[] = []
  const markers = new Set<string>()
  for (const p of sc.prims) {
    if (p.k === 'line') {
      const mk = p.arrow ? `a${id}${p.color.replace('#', '')}` : ''
      if (mk) markers.add(`<marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${p.color}"/></marker>`)
      svg.push(`<polyline points="${p.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${p.color}" stroke-width="${p.sw}" stroke-linejoin="round" stroke-linecap="round"${p.dash ? ' stroke-dasharray="8 7"' : ''}${mk ? ` marker-end="url(#${mk})"` : ''}/>`)
    }
  }
  for (const p of sc.prims) {
    if (p.k === 'box') {
      const st = `position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;`
      if (p.shape === 'diamond') {
        parts.push(`<div style="${st}"><svg width="${p.w}" height="${p.h}" style="position:absolute;inset:0;overflow:visible"><polygon points="${p.w / 2},0 ${p.w},${p.h / 2} ${p.w / 2},${p.h} 0,${p.h / 2}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.sw ?? 0}"/></svg>${p.text ? textHtml(p.text, font, tfont, p.w * 0.17) : ''}</div>`)
      } else {
        const r = p.shape === 'round' ? 14 : p.shape === 'pill' ? p.h / 2 : p.shape === 'ellipse' ? '50%' : 0
        parts.push(`<div style="${st}border-radius:${typeof r === 'number' ? r + 'px' : r};background:${p.fill ?? 'transparent'};${p.stroke ? `box-shadow:inset 0 0 0 ${p.sw ?? 1}px ${p.stroke};` : ''}">${p.text ? textHtml(p.text, font, tfont) : ''}</div>`)
      }
    } else if (p.k === 'text') {
      parts.push(`<div style="position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">${textHtml(p.text, font, tfont)}</div>`)
    }
  }
  return `<svg class="dg" width="1280" height="720" viewBox="0 0 1280 720" style="position:absolute;inset:0;overflow:visible" aria-hidden="true"><defs>${[...markers].join('')}</defs>${svg.join('')}</svg>${parts.join('')}`
}

/** Pie charts in the preview: real arcs with a legend. */
export function pieHtml(s: Slide, t: DeckTheme, font: string) {
  const c = s.chart!
  const data = c.data.filter((d) => d.value > 0).slice(0, 8)
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const cols = palette(t, data.length)
  const cx = 420, cy = BODY.y + BODY.h / 2, r = 200
  let a0 = -Math.PI / 2
  const arcs = data.map((d, i) => {
    const a1 = a0 + (d.value / total) * Math.PI * 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = data.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cols[i]}"/>` : `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${cols[i]}" stroke="${t.bg}" stroke-width="3"/>`
    a0 = a1
    return p
  }).join('')
  const legend = data.map((d, i) => `<div style="display:flex;align-items:center;gap:14px;font-size:22px;margin-bottom:14px;font-family:${font}"><span style="width:22px;height:22px;border-radius:6px;background:${cols[i]};flex:none"></span><span style="flex:1">${esc(d.label)}</span><b>${Math.round((d.value / total) * 100)}%</b></div>`).join('')
  return `<svg width="1280" height="720" style="position:absolute;inset:0" aria-hidden="true">${arcs}<circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="${t.bg}"/></svg><div style="position:absolute;left:700px;top:${BODY.y + 40}px;width:480px">${legend}</div>`
}
