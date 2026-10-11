// V6.2 notes vs pages, and labels → notebooks. No data is migrated: a page is a note with pages inside
// (or one turned into a page), notebooks are the old labels. Checks that nothing goes missing, the
// board keeps quick notes, pages live under Pages and in their notebook, and the one-time explainer.
// Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const dbAll = (p, store) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) } }), store)
const note = async (p, id) => (await dbAll(p, 'notes')).find((n) => n.id === id)
const t = (s) => [{ type: 'text', text: s, styles: {} }]
const seed = (p) => p.evaluate((t0) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'labels', 'meta'], 'readwrite'); const now = Date.now()
    const put = (id, title, extra = {}) => tx.objectStore('notes').put({ id, title, content: [{ type: 'paragraph', content: [{ type: 'text', text: title + ' body', styles: {} }] }], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: title + ' body', checklist: [], words: 20, createdAt: now - 864e5, updatedAt: now - 864e5, ...extra })
    tx.objectStore('labels').put({ id: 'work', name: 'Work' }); tx.objectStore('labels').put({ id: 'home', name: 'Home' })
    put('quick', 'Groceries idea', { labels: ['work'] })
    put('plain', 'Loose thought')
    put('proj', 'Solar project', { labels: ['work'], icon: '☀️', updatedAt: now - 1000 })
    put('proj-a', 'Site visit', { parentId: 'proj', labels: ['work'] })
    put('wiki', 'Team wiki', { kind: 'page' })
    put('both', 'Shared plan', { labels: ['home', 'work'] })
    put('day', 'Monday', { daily: '2026-10-05' })
    put('day-kid', 'Under the daily', { parentId: 'day' })
    tx.objectStore('meta').put({ key: 'welcomed', value: 1 })
    tx.oncomplete = () => res(1)
  }
}))

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async (opts = {}, { explainer = false } = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...opts })
    await ctx.addInitScript((ex) => { if (!sessionStorage.getItem('k')) { sessionStorage.setItem('k', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', name: 'Zain' })); localStorage.setItem('folio.installHint', '1'); if (!ex) localStorage.setItem('folio.kinds62', '1') } }, explainer)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(700); await seed(p); await p.reload(); await p.waitForTimeout(1200)
    return { ctx, p }
  }
  const cards = (p) => p.locator('article[data-note]').evaluateAll((as) => as.map((a) => a.getAttribute('data-note')))
  const more = async (p) => { await p.getByRole('button', { name: /^More/ }).first().click(); await p.waitForTimeout(250) }
  const back = async (p) => { await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500) }
  const side = (p) => p.getByRole('complementary')

  // ---------------- the one-time explainer, for people who had pages or labels
  {
    const { ctx, p } = await mk({}, { explainer: true })
    const card = p.getByRole('region', { name: 'Notes, pages and notebooks' })
    ok('upgrading users see what changed, once', await card.isVisible() && /Labels are now notebooks/.test(await card.innerText()) && /you have 3/.test(await card.innerText()))
    await shot(p, 'k01-explainer')
    await card.getByRole('button', { name: 'Got it' }).click(); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(1000)
    ok('“Got it” keeps it away', !(await p.getByRole('region', { name: 'Notes, pages and notebooks' }).count()))
    await ctx.close()
  }
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(1200)
    ok('a brand-new browser gets the welcome, not the explainer', await p.getByRole('region', { name: 'Welcome to Folio56' }).isVisible() && !(await p.getByRole('region', { name: 'Notes, pages and notebooks' }).count()))
    await p.getByRole('button', { name: 'Skip the guide' }).click(); await p.waitForTimeout(300)
    await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const tx = r.result.transaction('labels', 'readwrite'); tx.objectStore('labels').put({ id: 'x', name: 'Uni' }); tx.oncomplete = () => res(1) } })); await p.reload(); await p.waitForTimeout(1000)
    ok('…and never sees it later, even after making a notebook', !(await p.getByRole('region', { name: 'Notes, pages and notebooks' }).count()))
    await ctx.close()
  }

  const { ctx, p } = await mk()
  // ---------------- nothing goes missing
  let ids = await cards(p)
  ok('the board shows quick notes', ['quick', 'plain', 'both'].every((x) => ids.includes(x)), ids.join(','))
  ok('pages leave the board (a note with pages inside, and one marked a page)', !ids.includes('proj') && !ids.includes('wiki') && !ids.includes('proj-a'))
  ok('daily notes are never treated as pages', !ids.includes('day') && !(await p.getByRole('region', { name: 'Recent pages' }).getByText('Monday').count()))
  const strip = p.getByRole('region', { name: 'Recent pages' })
  ok('home shows recent pages just above the notes', await strip.isVisible() && (await strip.getByRole('button').allInnerTexts()).join('|').includes('Solar project') && /1 inside/.test(await strip.innerText()))
  await shot(p, 'k02-home')
  await strip.getByRole('button', { name: 'All pages' }).click(); await p.waitForTimeout(500)
  const tree = await p.locator('.max-w-3xl').innerText()
  ok('Pages lists pages only', /Solar project/.test(tree) && /Team wiki/.test(tree) && !/Groceries idea/.test(tree) && !/Loose thought/.test(tree), tree.replace(/\n/g, ' | ').slice(0, 200))
  ok('Pages keeps the tree (pages inside pages)', await p.getByRole('button', { name: 'Expand' }).count() >= 1)
  await shot(p, 'k03-pages')

  // ---------------- notebooks
  ok('the sidebar calls them notebooks', await side(p).getByText('Notebooks', { exact: true }).isVisible() && !(await side(p).getByText('Labels', { exact: true }).count()))
  await side(p).locator('button[title="Work"]').click(); await p.waitForTimeout(600)
  ids = await cards(p)
  ok('a notebook shows its notes…', ids.includes('quick') && ids.includes('both') && !ids.includes('proj'), ids.join(','))
  const nbPages = p.getByRole('region', { name: 'Pages in this notebook' })
  ok('…and its pages, top ones only', await nbPages.isVisible() && /Solar project/.test(await nbPages.innerText()) && !/Site visit/.test(await nbPages.innerText()))
  ok('the header counts notes and pages', /2 notes · 1 page/.test(await p.locator('main, body').first().innerText()))
  await shot(p, 'k04-notebook')
  await p.getByRole('button', { name: 'New page', exact: true }).click(); await p.waitForTimeout(900)
  await p.locator('textarea[aria-label="Title"]').fill('Roadmap'); await p.waitForTimeout(1600)
  await back(p)
  const made = (await dbAll(p, 'notes')).find((n) => n.title === 'Roadmap')
  ok('“New page” in a notebook makes a page in that notebook', made && made.kind === 'page' && made.labels[0] === 'work', JSON.stringify(made))
  ok('…and it shows with the notebook’s pages', /Roadmap/.test(await nbPages.innerText()))

  // ---------------- the notebook picker
  await side(p).getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(500)
  await p.waitForTimeout(600)
  const card = p.locator('article[data-note="quick"]')
  await card.hover(); await card.getByRole('button', { name: 'Notebook' }).click(); await p.waitForTimeout(300)
  const pick = p.getByRole('group', { name: 'Notebook' })
  ok('the card button opens a notebook picker', await pick.isVisible() && await pick.getByPlaceholder('Find or create a notebook').isVisible())
  await shot(p, 'k05-picker')
  await pick.getByRole('button', { name: 'Home', exact: true }).click(); await p.waitForTimeout(300)
  ok('tapping a notebook moves the note there', JSON.stringify((await note(p, 'quick')).labels) === '["home"]')
  await pick.getByRole('button', { name: 'Also show in Work' }).click(); await p.waitForTimeout(300)
  ok('“Also here” keeps it in a second notebook', JSON.stringify((await note(p, 'quick')).labels) === '["home","work"]')
  await pick.getByRole('button', { name: 'Also show in Work' }).click(); await pick.getByRole('button', { name: 'No notebook' }).click(); await p.waitForTimeout(300)
  ok('“No notebook” takes it out', (await note(p, 'quick')).labels.length === 0)
  await pick.getByPlaceholder('Find or create a notebook').fill('Travel'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
  const travel = (await dbAll(p, 'labels')).find((l) => l.name === 'Travel')
  ok('typing a new name makes a notebook and moves the note in', travel && (await note(p, 'quick')).labels[0] === travel.id)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  ok('old notes in two labels keep both (first is home, the other “also in”)', JSON.stringify((await note(p, 'both')).labels) === '["home","work"]')

  // ---------------- move several at once
  await side(p).getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(500)
  for (const id of ['plain', 'both']) { const c = p.locator(`article[data-note="${id}"]`); await c.hover(); await c.getByRole('button', { name: /^Select/ }).click() }
  await p.getByRole('button', { name: 'Move to notebook' }).click(); await p.waitForTimeout(300)
  await p.getByRole('group', { name: 'Move selected to' }).getByRole('button', { name: 'Travel', exact: true }).click(); await p.waitForTimeout(500)
  ok('select several → Move to notebook', (await note(p, 'plain')).labels[0] === travel.id && JSON.stringify((await note(p, 'both')).labels) === JSON.stringify([travel.id, 'work']))

  // ---------------- note ⇄ page
  await p.locator('article[data-note="plain"]').click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(400)
  await more(p); await p.getByRole('button', { name: 'Turn into a page' }).click(); await p.waitForTimeout(400)
  ok('Turn into a page (⋯) says where it went', /find it under Pages/.test(await p.getByRole('status').innerText()) && (await note(p, 'plain')).kind === 'page')
  ok('pages wear a small “Page” tag', await p.getByText('Page', { exact: true }).first().isVisible())
  await back(p)
  ok('…and it leaves the board', !(await cards(p)).includes('plain'))
  await p.getByRole('region', { name: 'Recent pages' }).getByRole('button', { name: /Loose thought/ }).click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(400)
  await more(p); await p.getByRole('button', { name: 'Turn into a note' }).click(); await p.waitForTimeout(400)
  await back(p)
  ok('Turn into a note puts it back on the board', (await cards(p)).includes('plain') && (await note(p, 'plain')).kind === 'note')
  await p.locator('article[data-note="quick"]').click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(400)
  await p.getByText('Add a page inside').click(); await p.waitForTimeout(900)
  ok('“Add a page inside” on a note makes it a page, and says so', /is a page now/.test(await p.getByRole('status').innerText()) && (await note(p, 'quick')).kind === 'page')
  const kid = (await dbAll(p, 'notes')).find((n) => n.parentId === 'quick')
  ok('the new page inside lands in the same notebook', kid && kid.labels[0] === travel.id)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.goto(APP); await p.waitForTimeout(1000)
  ok('a turned-into-note page with pages inside keeps them (they show under Pages)', await (async () => { await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const s = r.result.transaction('notes', 'readwrite').objectStore('notes'); const g = s.get('proj'); g.onsuccess = () => { s.put({ ...g.result, kind: 'note' }); res(1) } } })); await p.reload(); await p.waitForTimeout(900); await side(p).getByRole('button', { name: 'Pages', exact: true }).click(); await p.waitForTimeout(500); return /Site visit/.test(await p.locator('.max-w-3xl').innerText()) })())

  // ---------------- command palette
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('open notebook work'); await p.waitForTimeout(250)
  ok('Ctrl K opens a notebook by name', await p.getByRole('dialog', { name: 'Command menu' }).getByText('Open notebook: Work').count() > 0)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('new page'); await p.waitForTimeout(250); await p.keyboard.press('Enter'); await p.waitForTimeout(900)
  await p.locator('textarea[aria-label="Title"]').fill('From the palette'); await p.waitForTimeout(1600)
  await back(p)
  ok('Ctrl K → New page makes a page', (await dbAll(p, 'notes')).find((n) => n.title === 'From the palette')?.kind === 'page')

  // ---------------- accessibility of the new bits
  await side(p).getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(500)
  await p.addScriptTag({ content: AXE })
  const ax = await p.evaluate(async () => (await window.axe.run(document.querySelector('[aria-label="Recent pages"]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => v.id))
  ok('recent pages strip passes axe (WCAG AA)', ax.length === 0, ax.join(','))
  await ctx.close()

  // ---------------- phone
  {
    const { ctx, p } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    ok('phone: recent pages fit without sideways scroll', await p.getByRole('region', { name: 'Recent pages' }).isVisible() && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await shot(p, 'k06-phone')
    await ctx.close()
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
