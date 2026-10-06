// Margins (V5.7): Folio's PDF reader. A PDF is read straight from the file you open — Folio never
// copies it. All it remembers per PDF (keyed by the PDF's own fingerprint) is a few kilobytes:
// your page, zoom, highlights, the linked note and, where the browser allows it, a handle to reopen it.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db } from './db'

export interface Highlight {
  id: string
  page: number // 1-based
  color: HighlightColor
  text: string
  /** Rectangles in PDF units (scale 1), relative to the page's top-left. */
  rects: [number, number, number, number][]
  at: number
}
export type HighlightColor = 'amber' | 'green' | 'blue' | 'rose'
export const HL_COLORS: Record<HighlightColor, string> = { amber: '#f5b84d', green: '#7cc28d', blue: '#7aa9ff', rose: '#ef8fb0' }

export interface PdfRecord {
  fp: string
  name: string
  title: string
  size: number
  pages: number
  page: number
  zoom: number | 'fit'
  noteId: string | null
  highlights: Highlight[]
  openedAt: number
  /** Small first-page picture for the recent list (~5–10 KB). */
  thumb?: string
  /** Chrome/Edge: a way back to the file on disk (not a copy). */
  handle?: FileSystemFileHandle
}

const KEY = 'margins:'
export async function getRecord(fp: string) { return (await db.meta.get(KEY + fp))?.value as PdfRecord | undefined }
export async function saveRecord(rec: PdfRecord) { await db.meta.put({ key: KEY + rec.fp, value: rec }) }
export async function patchRecord(fp: string, p: Partial<PdfRecord>) { const r = await getRecord(fp); if (r) await saveRecord({ ...r, ...p }) }
export async function forgetRecord(fp: string) { await db.meta.delete(KEY + fp) }
export async function recentRecords(): Promise<PdfRecord[]> {
  const rows = await db.meta.where('key').startsWith(KEY).toArray()
  return rows.map((r) => r.value as PdfRecord).filter(Boolean).sort((a, b) => b.openedAt - a.openedAt)
}

// ---------------------------------------------------------------- pdf.js (loaded only when Margins opens)
let lib: Promise<typeof import('pdfjs-dist')> | null = null
export function pdfjs() {
  lib ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = (w as { default: string }).default
    return m
  })
  return lib
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const m = await pdfjs()
  return m.getDocument({ data: new Uint8Array(data) }).promise
}

export const canReopen = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window

/** Pick a PDF. On Chrome/Edge this also returns a handle so Folio can reopen the same file later. */
export async function pickPdf(): Promise<{ file: File; handle?: FileSystemFileHandle } | null> {
  const w = window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]> }
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }], excludeAcceptAllOption: false, multiple: false })
      return { file: await handle.getFile(), handle }
    } catch (e) { if ((e as Error).name === 'AbortError') return null }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'application/pdf,.pdf'
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0] } : null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/** Reopen a remembered file (asks the browser for permission again if needed). */
export async function reopen(rec: PdfRecord): Promise<File | null> {
  const h = rec.handle as (FileSystemFileHandle & { queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> }) | undefined
  if (!h) return null
  try {
    let p = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted'
    if (p !== 'granted') p = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied'
    if (p !== 'granted') return null
    return await h.getFile()
  } catch { return null }
}

// ---------------------------------------------------------------- text helpers
interface Item { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/**
 * Rebuilds readable paragraphs from a PDF page's positioned text: lines are grouped by height,
 * paragraphs split on larger gaps or indents, hyphenated line breaks joined, running headers and
 * bare page numbers dropped. Headings are guessed from noticeably larger type.
 */
export function pageToParagraphs(items: Item[], pageHeight: number): { kind: 'p' | 'h'; text: string }[] {
  const pieces = items.filter((i) => i.str.trim().length || i.hasEOL)
  if (!pieces.length) return []
  type Line = { y: number; x: number; size: number; text: string }
  const lines: Line[] = []
  for (const it of pieces) {
    const y = it.transform[5], x = it.transform[4], size = Math.abs(it.transform[3]) || it.height || 10
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - y) < size * 0.5) {
      const gap = x - (last.x + 0)
      last.text += (last.text.endsWith(' ') || it.str.startsWith(' ') || gap < 0 ? '' : ' ') + it.str
      last.size = Math.max(last.size, size)
    } else lines.push({ y, x, size, text: it.str })
  }
  const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text)
  // drop running headers/footers: bare numbers or very short lines at the top/bottom edges
  const body = clean.filter((l, i) => {
    const edge = l.y > pageHeight * 0.93 || l.y < pageHeight * 0.06
    if (/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d+)?$/i.test(l.text)) return false
    if (edge && (i === 0 || i === clean.length - 1) && l.text.length < 60) return false
    return true
  })
  if (!body.length) return []
  const sizes = body.map((l) => l.size).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)]
  const lefts = body.map((l) => l.x).sort((a, b) => a - b)
  const left = lefts[Math.floor(lefts.length * 0.2)]
  const out: { kind: 'p' | 'h'; text: string }[] = []
  let cur: { kind: 'p' | 'h'; text: string } | null = null
  let prev: Line | null = null
  for (const l of body) {
    const heading = l.size > median * 1.18 && l.text.length < 120
    const gap = prev ? prev.y - l.y : 0
    const indent = l.x - left > median * 1.2
    const newPara = !cur || heading || cur.kind === 'h' || gap > Math.max(prev!.size, l.size) * 1.65 || indent || /[.!?:"”]$/.test(prev?.text ?? '') && indent
    if (newPara) { cur = { kind: heading ? 'h' : 'p', text: l.text }; out.push(cur) }
    else if (cur) cur.text = /[A-Za-z]-$/.test(cur.text) ? cur.text.slice(0, -1) + l.text : `${cur.text} ${l.text}`
    prev = l
  }
  return out
}

export const fileTitle = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled PDF'
