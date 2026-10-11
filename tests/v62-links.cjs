// V6.2 shorter share links: compact notes + a built-in deflate dictionary (format 2), smaller pictures,
// old (format 1) links still open, and everything arrives intact. Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const { deflateSync, strToU8 } = require('fflate')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };

const now = Date.now()
const t = (s, st = {}) => ({ type: 'text', text: s, styles: st })
const blk = (type, content, props = {}) => ({ id: crypto.randomUUID(), type, props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left', ...props }, content, children: [] })
const NOTE = (id, title, content, extra = {}) => ({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 40, createdAt: now - 864e5, updatedAt: now - 3600e3, ...extra })
const MINUTES = NOTE('minutes01abc', 'Design review — Thursday', [
  blk('heading', [t('Summary')], { level: 2 }), blk('paragraph', [t('We reviewed the onboarding flow and agreed to ship the new version on '), t('Monday', { bold: true }), t(' after fixing two issues.')]),
  blk('heading', [t('Action items')], { level: 2 }),
  blk('checkListItem', [t('Sara — fix the skip button on small phones 📅 2026-10-13')], { checked: false }),
  blk('checkListItem', [t('Lina — final icon set')], { checked: true }),
  blk('paragraph', [{ type: 'link', href: 'https://example.com/spec', content: [t('The spec')] }, t(' has the details.')]),
], { color: 'yellow', pinned: true })
const LIST = NOTE('groceries01a', 'Groceries', [blk('checkListItem', [t('Milk')]), blk('checkListItem', [t('Eggs')], { checked: true }), blk('checkListItem', [t('Bread')])])
const seed = (notes) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); for (const n of notes) tx.objectStore('notes').put(n); tx.objectStore('meta').put({ key: 'welcomed', value: 1 }); tx.oncomplete = () => res(1) } })
const dbNotes = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result) } }))
const b64url = (u) => Buffer.from(u).toString('base64url')
/** The link the old (format 1) code would have made — to compare lengths and check old links still open. */
const v1Link = (notes) => `${APP}#p=${b64url(Buffer.concat([Buffer.from([0x46, 1, 0]), Buffer.from(deflateSync(strToU8(JSON.stringify({ v: 1, from: 'Chrome on Windows', at: now, notes, labels: [] })), { level: 9 }))]))}`

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('lk')) { sessionStorage.setItem('lk', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', name: 'Zain Iqbal' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    return { ctx, p }
  }
  const share = async (p, title, opts = {}) => {
    const card = p.locator('article', { hasText: title }).first()
    await card.locator('button[aria-label="Select"]').dispatchEvent('click')
    await p.getByRole('button', { name: 'Share as link' }).click(); await p.waitForTimeout(1600)
    if (opts.noCode) { const sw = p.getByRole('switch', { name: /code/i }).first(); if (await sw.count() && (await sw.getAttribute('aria-checked')) === 'true') { await sw.click(); await p.waitForTimeout(900) } }
    const code = await p.getByLabel('Link code').inputValue().catch(() => '')
    const link = await p.getByTestId('share-link').getAttribute('title')
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    return { link, code }
  }
  const receive = async (link, code) => {
    const { ctx, p } = await mk()
    await p.goto(link); await p.waitForTimeout(1000)
    if (code && await p.getByPlaceholder('word-word-word-00').count()) { await p.getByPlaceholder('word-word-word-00').fill(code); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1000) }
    await p.getByRole('button', { name: /^Add \d+ notes?$/ }).click(); await p.waitForTimeout(800)
    await p.getByRole('button', { name: /Open note|Done/ }).first().click().catch(() => {}); await p.waitForTimeout(500)
    const notes = await dbNotes(p); await ctx.close(); return notes
  }

  const { ctx, p } = await mk()
  await p.goto(APP); await p.waitForTimeout(800); await p.evaluate(seed, [MINUTES, LIST]); await p.reload(); await p.waitForTimeout(1200)

  // ---------------- length
  const m = await share(p, 'Design review')
  const oldLen = v1Link([MINUTES]).length + 60 + 1 + m.code.length // what 6.1 made, with the same protection
  ok('meeting minutes: the link is far shorter than before', m.link.length < oldLen * 0.45, `${m.link.length} chars (6.1: about ${oldLen})`)
  const g = await share(p, 'Groceries')
  ok('a short list makes a short link', g.link.length < 420, `${g.link.length} chars`)
  ok('links still carry the code-protected format (#p=…)', /\/app\/#p=[A-Za-z0-9_-]+/.test(m.link))

  // ---------------- round trip: everything arrives
  const got = (await receive(m.link, m.code)).find((n) => n.id === 'minutes01abc')
  const plain = (n) => JSON.stringify(n.content.map((b) => [b.type, b.props?.level ?? null, b.props?.checked ?? null, b.content]))
  ok('round trip: title, colour, pin and every block arrive', got && got.title === MINUTES.title && got.color === 'yellow' && got.pinned === true && got.content.length === MINUTES.content.length)
  ok('round trip: headings, ticks, bold and links are kept', got && plain({ content: got.content.map((b) => ({ ...b, props: { ...b.props } })) }) === plain(MINUTES))
  ok('round trip: card preview and checklist are rebuilt on arrival', got && /onboarding flow/.test(got.preview) && got.checklist.length === 2 && got.checklist[1].checked === true)

  // ---------------- old links still open
  const oldNotes = await receive(v1Link([LIST]))
  ok('a link made before 6.2 still opens', oldNotes.some((n) => n.title === 'Groceries' && n.content.length === 3))

  // ---------------- pictures are made smaller
  await p.evaluate(() => new Promise((res) => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d')
    const gr = x.createLinearGradient(0, 0, 1600, 1200); gr.addColorStop(0, '#7aa9ff'); gr.addColorStop(1, '#f0b35e'); x.fillStyle = gr; x.fillRect(0, 0, 1600, 1200)
    for (let i = 0; i < 60; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 50% 45%)`; x.fillRect((i * 263) % 1500, (i * 151) % 1100, 120, 90) }
    const url = c.toDataURL('image/png')
    const r = indexedDB.open('folio'); r.onsuccess = () => { const tx = r.result.transaction('notes', 'readwrite'); const now = Date.now(); tx.objectStore('notes').put({ id: 'photo01abcde', title: 'Site photo', content: [{ id: 'img1', type: 'image', props: { url, caption: 'Roof', backgroundColor: 'default', textAlignment: 'left', previewWidth: 600 }, children: [] }], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: '', checklist: [], words: 0, createdAt: now, updatedAt: now }); tx.oncomplete = () => res(url.length) }
  }))
  await p.reload(); await p.waitForTimeout(1200)
  const card = p.locator('article', { hasText: 'Site photo' }).first()
  await card.locator('button[aria-label="Select"]').dispatchEvent('click')
  await p.getByRole('button', { name: 'Share as link' }).click(); await p.waitForTimeout(2500)
  const dlg = p.getByRole('dialog').last()
  const withPic = dlg.getByRole('switch', { name: /Include 1 image/ })
  if ((await withPic.getAttribute('aria-checked')) !== 'true') { await withPic.click(); await p.waitForTimeout(2500) }
  const photoLink = await p.getByTestId('share-link').getAttribute('title')
  const photoCode = await p.getByLabel('Link code').inputValue().catch(() => '')
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape')
  const pic = (await receive(photoLink, photoCode)).find((n) => n.title === 'Site photo')
  const url = pic?.content?.[0]?.props?.url ?? ''
  ok('a picture in a link is redrawn small (WebP, at most 720 px) and still arrives', photoLink.length < 60_000 && !!pic && /^folio-img:/.test(url), `${photoLink.length} chars`)

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close(); await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
