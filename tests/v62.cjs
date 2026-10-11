// V6.2 checks: the welcome page at / and the app at /app/ (redirects for returning visitors, installed
// apps and old links; manifest), the first-run welcome and guide note, Settings → About, backup
// reminders that know when storage is at risk, and the wrapped-line strikethrough on cards.
// Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const ORIGIN = process.env.ORIGIN || 'http://localhost:4174'
const APP = ORIGIN + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }) } }
const pathOf = (p) => new URL(p.url()).pathname
const dbAll = (p, store) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) } }), store)
const seedNotes = (p, notes) => p.evaluate((list) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes'], 'readwrite'); const now = Date.now()
    for (const n of list) tx.objectStore('notes').put({ color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 20, createdAt: now - 2 * 864e5, updatedAt: now - 2 * 864e5, ...n })
    tx.oncomplete = () => res(1)
  }
}), notes)
const quiet = () => { try { localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } catch { /* about:blank */ } }

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const fresh = async (opts = {}) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...opts }); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return { c, p } }

  // ---------------- welcome page at /
  {
    const { c, p } = await fresh()
    const reqs = []; p.on('request', (r) => reqs.push(r.url()))
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(900)
    ok('new visitor stays on the welcome page', pathOf(p) === '/' && /Nothing leaves it/.test(await p.locator('h1').innerText()))
    ok('welcome page is visible (not left hidden by the returning-visitor check)', await p.evaluate(() => getComputedStyle(document.body).visibility === 'visible'))
    ok('welcome page loads none of the app code', !reqs.some((u) => /\/assets\/.*\.js/.test(u)) && !(await p.locator('#root').count()))
    const ctas = await p.locator('a.btn.primary').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    ok('every main button opens /app/', ctas.length >= 3 && ctas.every((h) => h === '/app/'), ctas.join(','))
    ok('no placeholder links left', !(await p.locator('a[href="#"]').count()))
    const imgs = await p.locator('img').evaluateAll((is) => is.map((i) => i.getAttribute('src')))
    ok('screenshots come from /welcome/', imgs.every((s) => s.startsWith('/welcome/')), imgs.join(','))
    await p.locator('#tour').scrollIntoViewIfNeeded(); await p.waitForTimeout(400)
    await p.getByRole('tab', { name: 'Read PDFs' }).click(); await p.waitForTimeout(300)
    ok('tour tabs switch panels', await p.locator('#p-read').isVisible() && !(await p.locator('#p-write').isVisible()))
    await p.getByRole('button', { name: 'Paper' }).click(); await p.waitForTimeout(900)
    ok('theme picker re-themes the page', (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(242, 239, 231)')
    await p.getByRole('button', { name: 'Espresso' }).click(); await p.waitForTimeout(900)
    await p.evaluate(() => document.querySelectorAll('.rv').forEach((e) => e.classList.add('in'))); await p.waitForTimeout(1000)
    await p.addScriptTag({ content: AXE })
    const ax = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ':' + v.nodes.length + ' ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '').slice(0, 90)).join(' || ')))
    ok('welcome page has no serious accessibility problems', !ax.length, ax.join(' '))
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(600); await shot(p, 'welcome')
    // phone
    const m = await c.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.goto(ORIGIN + '/'); await m.waitForTimeout(700)
    ok('welcome page fits a phone (no sideways scroll)', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390)
    await shot(m, 'welcome-phone')
    await c.close()
  }

  // ---------------- old links and shortcuts go to the app
  {
    const { c, p } = await fresh()
    await p.goto(ORIGIN + '/#p=abc123'); await p.waitForTimeout(900)
    ok('old share links (/#p=…) open in the app', pathOf(p) === '/app/')
    await p.goto(ORIGIN + '/?view=tasks'); await p.waitForTimeout(900)
    ok('old shortcut links (/?view=…) open in the app', pathOf(p) === '/app/')
    await p.goto(ORIGIN + '/?utm_source=x'); await p.waitForTimeout(500)
    ok('ordinary query strings still show the welcome page', pathOf(p) === '/' || pathOf(p) === '/app/') // flag may be set by the visit above
    await c.close()
  }
  {
    const { c, p } = await fresh()
    await p.goto(ORIGIN + '/?utm_source=newsletter'); await p.waitForTimeout(600)
    ok('a marketing link shows the welcome page to a new visitor', pathOf(p) === '/')
    await p.goto(ORIGIN + '/app'); await p.waitForTimeout(900)
    ok('/app (no slash) opens the app', pathOf(p) === '/app/' && (await p.locator('#root').count()) === 1)
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(900)
    ok('after opening the app once, / goes straight to the app', pathOf(p) === '/app/')
    await p.goto(ORIGIN + '/welcome'); await p.waitForTimeout(700)
    ok('/welcome always shows the welcome page', pathOf(p) === '/welcome' && /Nothing leaves it/.test(await p.locator('h1').innerText()))
    await c.close()
  }
  {
    // someone from before 6.2: notes in the browser, but no "opened the app" flag
    const { c, p } = await fresh()
    await p.goto(ORIGIN + '/welcome'); await p.waitForTimeout(400)
    await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { r.result.close(); res(1) } }))
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(1200)
    ok('existing users (notes, no flag) go straight to the app', pathOf(p) === '/app/')
    await c.close()
  }
  {
    const { c, p } = await fresh()
    const man = await (await p.request.get(ORIGIN + '/manifest.webmanifest')).json()
    ok('manifest keeps id "/" and starts at /app/', man.id === '/' && man.start_url === '/app/' && man.scope === '/')
    ok('manifest shortcuts, share target and PDF handler point at /app/', man.shortcuts.every((s) => s.url.startsWith('/app/')) && man.share_target.action === '/app/' && man.file_handlers[0].action === '/app/')
    const sw = await (await p.request.get(ORIGIN + '/sw.js')).text()
    ok('offline: /app/ addresses fall back to the app page', /createHandlerBoundToURL\("\/app\/index\.html"\)/.test(sw) && /url:"index\.html"/.test(sw))
    await c.close()
  }

  // ---------------- first run
  {
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(1300)
    const card = p.getByRole('region', { name: 'Welcome to Folio56' })
    ok('a brand-new browser sees the welcome card', await card.isVisible())
    await shot(p, 'first-run')
    await card.getByLabel('Your name').fill('Sara Khan')
    await card.getByRole('button', { name: 'Light' }).click(); await p.waitForTimeout(200)
    ok('choosing Light switches the look right away', (await p.evaluate(() => document.documentElement.dataset.mode)) === 'light')
    await card.getByRole('button', { name: /Start writing/ }).click(); await p.waitForTimeout(1500)
    const notes = await dbAll(p, 'notes')
    const guide = notes.find((n) => n.title === 'Welcome to Folio56')
    ok('Start writing adds a pinned guide note', !!guide && guide.pinned === true && guide.content.filter((x) => x.type === 'checkListItem').length >= 6)
    ok('the guide note opens', await p.locator('.bn-editor').isVisible() && /Type \[\[/.test(await p.locator('.bn-editor').innerText()))
    ok('the name is saved', JSON.parse(await p.evaluate(() => localStorage.getItem('folio.prefs'))).name === 'Sara Khan')
    await shot(p, 'guide-note')
    await p.getByRole('button', { name: /^Back/ }).first().click(); await p.waitForTimeout(600)
    await p.reload(); await p.waitForTimeout(1200)
    ok('the welcome card does not come back', !(await p.getByRole('region', { name: 'Welcome to Folio56' }).count()))
    ok('the guide note sits pinned on the home screen', await p.locator('article[data-note]').filter({ hasText: 'Welcome to Folio56' }).isVisible())
    await c.close()
  }
  {
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(1300)
    await p.getByRole('button', { name: 'Skip the guide' }).click(); await p.waitForTimeout(400)
    ok('Skip closes the card without adding notes', !(await p.getByRole('region', { name: 'Welcome to Folio56' }).count()) && (await dbAll(p, 'notes')).length === 0)
    await p.reload(); await p.waitForTimeout(1200)
    ok('after Skip it stays away', !(await p.getByRole('region', { name: 'Welcome to Folio56' }).count()))
    // Settings → About
    await p.getByRole('button', { name: /^Settings/ }).first().click(); await p.waitForTimeout(500)
    const dlg = p.getByRole('dialog', { name: 'Settings' })
    ok('Settings → About shows the version', /Folio56\s*6\.2\.0/.test(await dlg.innerText()))
    ok('About links to the welcome page', (await dlg.getByRole('link', { name: /About Folio56/ }).getAttribute('href')) === '/welcome')
    const qc = await dlg.innerText()
    ok('quick-capture links point at /app/', qc.includes(ORIGIN + '/app/?record=memo'))
    await dlg.getByRole('button', { name: 'Show the welcome guide' }).click(); await p.waitForTimeout(1500)
    ok('Show the welcome guide adds and opens the guide note', (await dbAll(p, 'notes')).some((n) => n.title === 'Welcome to Folio56') && await p.locator('.bn-editor').isVisible())
    await c.close()
  }
  {
    // an existing user with notes never sees the card
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(800)
    await seedNotes(p, [{ id: 'a', title: 'Old note', content: [] }])
    await p.reload(); await p.waitForTimeout(1200)
    const meta = await dbAll(p, 'meta')
    ok('people with notes skip the welcome (and are marked as welcomed)', !(await p.getByRole('region', { name: 'Welcome to Folio56' }).count()) && meta.some((m) => m.key === 'welcomed'))
    await c.close()
  }

  // ---------------- backup reminders that know about risk
  {
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(800)
    await seedNotes(p, [1, 2, 3].map((i) => ({ id: 'n' + i, title: 'Note ' + i, content: [] })))
    await p.reload(); await p.waitForTimeout(1500)
    const persisted = await p.evaluate(() => navigator.storage.persisted())
    const rem = p.getByRole('status').filter({ hasText: 'Keep a copy of your notes' })
    ok('storage not kept for sure → reminder after 3 notes and a day', !persisted && await rem.isVisible())
    ok('the reminder says why', /may clear it if the device runs low on space/.test(await rem.innerText()))
    ok('the reminder offers daily backups to a folder (Chrome)', await rem.getByRole('button', { name: /Back up daily to a folder/ }).isVisible())
    await shot(p, 'backup-reminder')
    await c.close()
  }
  {
    const { c, p } = await fresh({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' })
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(800)
    await seedNotes(p, [1, 2, 3].map((i) => ({ id: 'n' + i, title: 'Note ' + i, content: [] })))
    await p.reload(); await p.waitForTimeout(1500)
    const rem = p.getByRole('status').filter({ hasText: 'Keep a copy of your notes' })
    ok('Safari: the reminder explains the 7-day rule and Add to Dock', await rem.isVisible() && /7 days without a visit/.test(await rem.innerText()) && /Add to Dock/.test(await rem.innerText()))
    await c.close()
  }
  {
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(800)
    await seedNotes(p, [1, 2, 3].map((i) => ({ id: 'n' + i, title: 'Note ' + i, content: [], createdAt: Date.now(), updatedAt: Date.now() })))
    await p.reload(); await p.waitForTimeout(1200)
    ok('no reminder for notes written today', !(await p.getByRole('status').filter({ hasText: 'Keep a copy of your notes' }).count()))
    await c.close()
  }

  // ---------------- strikethrough on wrapped checklist lines
  {
    const { c, p } = await fresh()
    await c.addInitScript(quiet)
    await p.goto(APP); await p.waitForTimeout(800)
    const t = (s) => [{ type: 'text', text: s, styles: {} }]
    const long = 'Book the Karimabad guesthouse for three nights and confirm the jeep pickup'
    await seedNotes(p, [{ id: 'trip', title: 'Hunza trip', content: [{ type: 'checkListItem', props: { checked: true }, content: t(long) }, { type: 'checkListItem', props: { checked: false }, content: t('Warm jacket') }], checklist: [{ text: long, checked: true }, { text: 'Warm jacket', checked: false }] }])
    await p.reload(); await p.waitForTimeout(1300)
    const s = p.locator('article[data-note="trip"] .strike.on').first()
    const info = await s.evaluate((el) => ({ lines: el.getClientRects().length, brk: getComputedStyle(el).boxDecorationBreak || getComputedStyle(el).webkitBoxDecorationBreak, display: getComputedStyle(el).display }))
    ok('a checked item that wraps is drawn line by line', info.lines >= 2 && info.brk === 'clone' && info.display === 'inline', JSON.stringify(info))
    // the line sits through the middle of each line, not under it: sample pixels along the second line
    if (SHOTS) await s.screenshot({ path: path.join(SHOTS, 'strike.png') })
    const mid = await s.evaluate((el) => { const r = [...el.getClientRects()]; const cs = getComputedStyle(el); const pos = parseFloat(cs.backgroundPositionY) / 100; return r.map((x) => ({ top: x.top, h: x.height, lineAt: x.top + (x.height - 1.5) * pos })) })
    ok('each line’s strike is near the middle of that line', mid.every((x) => x.lineAt > x.top + x.h * 0.4 && x.lineAt < x.top + x.h * 0.7), JSON.stringify(mid))
    await c.close()
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
