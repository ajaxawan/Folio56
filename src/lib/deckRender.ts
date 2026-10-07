// Slide types, the eight deck themes and the one HTML renderer every view uses (kept small: the
// note cards draw a deck's title slide from here).
export type Layout = 'title' | 'section' | 'bullets' | 'two' | 'quote' | 'stat' | 'table' | 'image' | 'closing'
export interface Column { heading?: string; bullets: string[] }
export interface Slide {
  id: string; layout: Layout; title: string; subtitle?: string; bullets?: string[]
  left?: Column; right?: Column; stats?: { value: string; label: string }[]
  quote?: { text: string; by?: string }; table?: { head: string[]; rows: string[][] }
  image?: string | null; notes?: string
}
export interface Deck { v: 1; theme: string; title: string; subtitle?: string; slides: Slide[]; source?: { kind: 'note' | 'markdown' | 'pdf'; name: string; id?: string }; made: 'ai' | 'outline' | 'pages'; createdAt: number }

export const LAYOUTS: { k: Layout; label: string }[] = [
  { k: 'title', label: 'Title' }, { k: 'section', label: 'Section' }, { k: 'bullets', label: 'Bullets' }, { k: 'two', label: 'Two columns' },
  { k: 'stat', label: 'Big numbers' }, { k: 'quote', label: 'Quote' }, { k: 'table', label: 'Table' }, { k: 'image', label: 'Picture' }, { k: 'closing', label: 'Closing' },
]

// ---------------------------------------------------------------- themes
export interface DeckTheme {
  key: string; name: string; note: string; dark: boolean
  bg: string; fg: string; muted: string; accent: string; surface: string; line: string
  /** Title & section slides can use their own background. */
  hero?: { bg: string; fg: string; muted: string; css?: string }
  font: 'serif' | 'sans' | 'mono'; decor: 'rule' | 'glow' | 'band' | 'none' | 'grid' | 'block' | 'leaf' | 'sun'
}
export const DECK_THEMES: DeckTheme[] = [
  { key: 'classic', name: 'Folio Classic', note: 'Warm paper, serif titles', dark: false, bg: '#FBF8F3', fg: '#1F1B16', muted: '#6B6258', accent: '#B4532A', surface: '#F2ECE2', line: '#E3DACB', font: 'serif', decor: 'rule' },
  { key: 'boardroom', name: 'Boardroom', note: 'Navy and white, corporate', dark: false, bg: '#FFFFFF', fg: '#14213D', muted: '#5B6577', accent: '#1F5FD1', surface: '#EEF3FB', line: '#D9E1EE', hero: { bg: '#14213D', fg: '#FFFFFF', muted: '#B9C4D8' }, font: 'sans', decor: 'band' },
  { key: 'midnight', name: 'Midnight', note: 'Dark, calm, glowing accent', dark: true, bg: '#0F1420', fg: '#E8ECF4', muted: '#97A1B5', accent: '#7AA2FF', surface: '#18202F', line: '#273145', font: 'sans', decor: 'glow' },
  { key: 'minimal', name: 'Minimal', note: 'Black on white, big type', dark: false, bg: '#FFFFFF', fg: '#111111', muted: '#666666', accent: '#111111', surface: '#F4F4F4', line: '#E2E2E2', font: 'sans', decor: 'none' },
  { key: 'sunrise', name: 'Sunrise', note: 'Coral gradient openers', dark: false, bg: '#FFFFFF', fg: '#2A1F2D', muted: '#6E6170', accent: '#E8506E', surface: '#FFF1F2', line: '#F6D9DE', hero: { bg: '#F06C7F', fg: '#FFFFFF', muted: '#FFE3E8', css: 'linear-gradient(120deg,#FF9A8B 0%,#FF6A88 55%,#FF99AC 100%)' }, font: 'sans', decor: 'sun' },
  { key: 'blueprint', name: 'Blueprint', note: 'Engineering grid', dark: true, bg: '#0B3D5C', fg: '#F2F8FC', muted: '#A9C7DA', accent: '#7FD1FF', surface: '#0E4A6E', line: '#2B6A8E', font: 'mono', decor: 'grid' },
  { key: 'forest', name: 'Forest', note: 'Deep green, serif', dark: true, bg: '#13241C', fg: '#EEF3EA', muted: '#A8B9A9', accent: '#9AD17A', surface: '#1B3227', line: '#2C4637', font: 'serif', decor: 'leaf' },
  { key: 'studio', name: 'Studio', note: 'Bold colour block', dark: false, bg: '#F4F1EA', fg: '#1C1A17', muted: '#6A655C', accent: '#FF5A36', surface: '#EAE4D8', line: '#DCD4C5', font: 'sans', decor: 'block' },
]
export const themeOf = (k?: string) => DECK_THEMES.find((t) => t.key === k) ?? DECK_THEMES[0]

// ---------------------------------------------------------------- drawing a slide (HTML, 1280 × 720)
export const W = 1280, H = 720
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** **bold** inside slide text. */
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
const FONTS = { serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif', sans: '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif', mono: '"Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace' }
export const fontFor = (t: DeckTheme) => FONTS[t.font]

export const DECK_CSS = `
.dk{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:"Segoe UI","Helvetica Neue",Arial,system-ui,sans-serif;font-size:28px;line-height:1.35;box-sizing:border-box;-webkit-font-smoothing:antialiased}
.dk *{box-sizing:border-box}
.dk .t{font-family:var(--tf);font-weight:700;letter-spacing:-.01em;line-height:1.12;margin:0}
.dk .pad{position:absolute;inset:64px 88px 70px}
.dk h2.t{font-size:50px;margin-bottom:30px}
.dk ul{margin:0;padding:0;list-style:none}
.dk li{position:relative;padding-left:34px;margin:0 0 16px}
.dk li::before{content:"";position:absolute;left:4px;top:.55em;width:11px;height:11px;border-radius:3px;background:var(--accent)}
.dk.dense li{margin-bottom:10px;font-size:24px}
.dk.denser li{margin-bottom:6px;font-size:21px}
.dk .cols{display:grid;grid-template-columns:1fr 1fr;gap:56px}
.dk .col h3{font-size:30px;margin:0 0 16px;color:var(--accent);font-weight:650}
.dk .foot{position:absolute;left:88px;right:88px;bottom:26px;display:flex;justify-content:space-between;font-size:15px;color:var(--muted);letter-spacing:.02em}
.dk .hero{background:var(--hbg);color:var(--hfg)}
.dk.hero .foot,.dk.hero .sub{color:var(--hmuted)}
.dk .sub{color:var(--muted);font-size:30px;margin-top:22px;max-width:900px}
.dk .kicker{font-size:18px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:22px}
.dk.hero .kicker{color:var(--hmuted)}
.dk .stats{display:flex;gap:36px;margin-top:20px}
.dk .stat{flex:1;background:var(--surface);border-radius:18px;padding:34px 30px}
.dk .stat b{display:block;font-family:var(--tf);font-size:84px;line-height:1;color:var(--accent);letter-spacing:-.02em}
.dk .stat span{display:block;margin-top:14px;font-size:24px;color:var(--fg)}
.dk blockquote{margin:0;font-family:var(--tf);font-size:52px;line-height:1.22;font-weight:600}
.dk blockquote::before{content:"“";display:block;font-size:150px;line-height:.8;color:var(--accent);height:70px}
.dk .by{margin-top:28px;font-size:26px;color:var(--muted)}
.dk table{width:100%;border-collapse:collapse;font-size:23px}
.dk th{text-align:left;font-weight:700;padding:14px 16px;background:var(--surface);border-bottom:2px solid var(--accent)}
.dk td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:top}
.dk .img{position:absolute;inset:0;background-size:contain;background-repeat:no-repeat;background-position:center}
.dk .imgbox{position:absolute;top:150px;bottom:70px;left:88px;right:88px;border-radius:14px;background-color:var(--surface)}
.dk .imgbox.side{right:520px}
.dk .imgnote{position:absolute;top:150px;right:88px;width:400px}
.dk .bleed{position:absolute;inset:0;background-size:contain;background-repeat:no-repeat;background-position:center;background-color:var(--bg)}
.dk .empty{color:var(--muted);font-style:italic}
/* decor */
.dk[data-decor=rule] .pad h2.t{padding-bottom:20px;border-bottom:3px solid var(--accent);display:inline-block;padding-right:40px}
.dk[data-decor=glow]::after{content:"";position:absolute;width:760px;height:760px;right:-260px;top:-300px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 38%,transparent),transparent);pointer-events:none}
.dk[data-decor=band]:not(.hero)::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--accent)}
.dk[data-decor=grid]{background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:40px 40px}
.dk[data-decor=block]:not(.hero)::before{content:"";position:absolute;right:0;top:0;width:22px;height:100%;background:var(--accent)}
.dk[data-decor=block].hero::before{content:"";position:absolute;left:0;top:0;width:430px;height:100%;background:var(--accent)}
.dk[data-decor=block].hero .pad{left:500px}
.dk[data-decor=leaf]::after{content:"";position:absolute;right:-120px;bottom:-160px;width:520px;height:520px;border-radius:0 60% 0 60%;border:2px solid color-mix(in srgb,var(--accent) 45%,transparent);transform:rotate(18deg);pointer-events:none}
.dk[data-decor=sun].hero::after{content:"";position:absolute;right:120px;top:140px;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,.22)}
.dk .num{font-family:var(--tf);font-size:120px;font-weight:700;color:var(--accent);line-height:1;margin-bottom:10px;opacity:.9}
.dk.hero .num{color:var(--hmuted)}
`

export interface Meta { index: number; total: number; deckTitle: string; author?: string; date?: string; sectionNo?: number }
/** One slide as HTML (scaled with CSS transform by whoever shows it). Images must already be URLs. */
export function renderSlide(s: Slide, t: DeckTheme, m: Meta, imageUrl?: string | null): string {
  const isHero = (s.layout === 'title' || s.layout === 'section' || s.layout === 'closing') && !!t.hero
  const words = (s.bullets ?? []).join(' ').length + (s.left?.bullets ?? []).join(' ').length + (s.right?.bullets ?? []).join(' ').length
  const n = (s.bullets ?? []).length
  const dense = words > 520 || n > 8 ? 'denser' : words > 330 || n > 5 ? 'dense' : ''
  const vars = `--bg:${t.bg};--fg:${t.fg};--muted:${t.muted};--accent:${t.accent};--surface:${t.surface};--line:${t.line};--tf:${FONTS[t.font]};` +
    (t.hero ? `--hbg:${t.hero.css ?? t.hero.bg};--hfg:${t.hero.fg};--hmuted:${t.hero.muted};` : '') + (isHero ? `background:var(--hbg);color:var(--hfg);` : '')
  const foot = s.layout === 'title' ? '' : `<div class="foot"><span>${esc(m.deckTitle)}</span><span>${m.index + 1} / ${m.total}</span></div>`
  const list = (b: string[] = []) => b.length ? `<ul>${b.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : ''
  const title = (x: string) => `<h2 class="t">${rich(x || ' ')}</h2>`
  let body = ''
  switch (s.layout) {
    case 'title':
      body = `<div class="pad" style="display:flex;flex-direction:column;justify-content:center">${m.author || m.date ? `<div class="kicker">${esc([m.author, m.date].filter(Boolean).join(' · '))}</div>` : ''}<h1 class="t" style="font-size:78px;max-width:1000px">${rich(s.title)}</h1>${s.subtitle ? `<div class="sub">${rich(s.subtitle)}</div>` : ''}</div>`
      break
    case 'section':
      body = `<div class="pad" style="display:flex;flex-direction:column;justify-content:center">${m.sectionNo ? `<div class="num">${String(m.sectionNo).padStart(2, '0')}</div>` : ''}<h1 class="t" style="font-size:72px;max-width:1000px">${rich(s.title)}</h1>${s.subtitle ? `<div class="sub">${rich(s.subtitle)}</div>` : ''}</div>`
      break
    case 'closing':
      body = `<div class="pad" style="display:flex;flex-direction:column;justify-content:center"><h1 class="t" style="font-size:64px;margin-bottom:34px">${rich(s.title || 'Thank you')}</h1>${list(s.bullets)}${s.subtitle ? `<div class="sub">${rich(s.subtitle)}</div>` : ''}</div>`
      break
    case 'two':
      body = `<div class="pad">${title(s.title)}<div class="cols">${[s.left, s.right].map((c) => `<div class="col">${c?.heading ? `<h3>${rich(c.heading)}</h3>` : ''}${list(c?.bullets)}</div>`).join('')}</div></div>`
      break
    case 'stat': {
      const st = (s.stats ?? []).slice(0, 3)
      body = `<div class="pad">${title(s.title)}<div class="stats">${st.map((x) => `<div class="stat"><b>${esc(x.value)}</b><span>${rich(x.label)}</span></div>`).join('') || '<p class="empty">Add a number</p>'}</div>${s.subtitle ? `<div class="sub" style="font-size:24px">${rich(s.subtitle)}</div>` : ''}</div>`
      break
    }
    case 'quote':
      body = `<div class="pad" style="display:flex;flex-direction:column;justify-content:center"><blockquote>${rich(s.quote?.text || s.title)}</blockquote>${s.quote?.by ? `<div class="by">— ${rich(s.quote.by)}</div>` : ''}</div>`
      break
    case 'table': {
      const tb = s.table ?? { head: [], rows: [] }
      const many = tb.rows.length > 6 ? 'font-size:19px' : ''
      body = `<div class="pad">${title(s.title)}<table style="${many}"><thead><tr>${tb.head.map((h) => `<th>${rich(h)}</th>`).join('')}</tr></thead><tbody>${tb.rows.slice(0, 10).map((r) => `<tr>${tb.head.map((_, i) => `<td>${rich(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      break
    }
    case 'image':
      if (!s.title && !(s.bullets ?? []).length) { body = imageUrl ? `<div class="bleed" style="background-image:url('${imageUrl}')"></div>` : `<div class="pad"><p class="empty">Add a picture</p></div>`; break }
      body = `<div class="pad">${title(s.title)}</div><div class="imgbox ${(s.bullets ?? []).length ? 'side' : ''}"><div class="img" style="${imageUrl ? `background-image:url('${imageUrl}')` : ''}"></div>${imageUrl ? '' : '<p class="empty" style="padding:30px">Add a picture</p>'}</div>${(s.bullets ?? []).length ? `<div class="imgnote">${list(s.bullets)}</div>` : ''}`
      break
    default: {
      const b = s.bullets ?? []
      body = `<div class="pad">${title(s.title)}${b.length > 7 ? `<div class="cols">${[b.slice(0, Math.ceil(b.length / 2)), b.slice(Math.ceil(b.length / 2))].map((x) => `<div>${list(x)}</div>`).join('')}</div>` : list(b)}${s.subtitle ? `<div class="sub" style="font-size:24px">${rich(s.subtitle)}</div>` : ''}</div>`
    }
  }
  return `<div class="dk ${dense} ${isHero ? 'hero' : ''}" data-decor="${t.decor}" style="${vars}">${body}${foot}</div>`
}
/** Section numbers for section slides (01, 02…). */
export function metaFor(deck: Deck, i: number, author?: string): Meta {
  let sec = 0
  for (let k = 0; k <= i; k++) if (deck.slides[k]?.layout === 'section') sec++
  return { index: i, total: deck.slides.length, deckTitle: deck.title, author, date: new Date(deck.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), sectionNo: deck.slides[i]?.layout === 'section' ? sec : undefined }
}

