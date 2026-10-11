// V6.3 checks: Folio Beam (QR codes screen → camera, one code or a fountain-coded loop), receiving
// from the + menu and from a picture, Markdown imported as notes or as pages, "Move to…" for pages,
// update checks and "What's new". Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const os = require('os')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const dbAll = (p, store) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) } }), store)

// words that don't compress away, so the long note really needs many codes
let seedN = 7; const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647 }
const WORDS = 'river panel quote audit budget harbor violet engine summit lantern copper meadow signal orbit thistle canvas granite marble saddle pepper cobalt walnut'.split(' ')
const para = (k) => Array.from({ length: k }, () => WORDS[Math.floor(rnd() * WORDS.length)] + (rnd() < 0.3 ? Math.floor(rnd() * 999) : '')).join(' ')
const LONG = Array.from({ length: 40 }, (_, i) => ({ type: i % 7 === 0 ? 'heading' : i % 5 === 0 ? 'checkListItem' : 'paragraph', props: i % 7 === 0 ? { level: 2 } : i % 5 === 0 ? { checked: i % 2 === 0 } : {}, content: [{ type: 'text', text: para(i % 7 === 0 ? 4 : 28), styles: i % 9 === 0 ? { bold: true } : {} }] }))
const seed = (p, notes) => p.evaluate((list) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); const now = Date.now()
    for (const n of list) tx.objectStore('notes').put({ color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 400, createdAt: now - 864e5, updatedAt: now - 864e5, ...n })
    tx.objectStore('meta').put({ key: 'welcomed', value: 1 }); tx.oncomplete = () => res(1)
  }
}), notes)

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async (opts = {}, init) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', ...opts })
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('v63')) { sessionStorage.setItem('v63', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', name: 'Zain' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } })
    if (init) await ctx.addInitScript(init.fn, init.arg)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    return { ctx, p }
  }
  const openShare = async (p, title) => {
    const card = p.locator('article', { hasText: title }).first()
    await card.locator('button[aria-label="Select"]').dispatchEvent('click')
    await p.getByRole('button', { name: 'Share as link' }).click(); await p.waitForTimeout(900)
    await p.getByRole('button', { name: /Beam \(QR\)/ }).click(); await p.waitForTimeout(1200)
  }
  /** A camera that films the given pictures, one after another, like a phone held up to a screen. */
  const camera = (frames) => ({
    arg: frames,
    fn: (frames) => {
      if (!navigator.mediaDevices) return
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas'); c.width = 720; c.height = 720
        const g = c.getContext('2d')
        const imgs = await Promise.all(frames.map((src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src })))
        let k = 0
        // a little blur and tilt, like a hand-held phone
        const draw = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, 720, 720); g.translate(360, 360); g.rotate(0.05); g.filter = 'blur(0.7px)'; g.drawImage(imgs[k++ % imgs.length], -230, -230, 460, 460) }
        draw(); setInterval(draw, 110)
        return c.captureStream(20)
      }
    },
  })

  // ---------------- Beam: a big note plays as a loop of codes
  const { ctx: sx, p: s } = await mk()
  await s.goto(APP); await s.waitForTimeout(700)
  await seed(s, [
    { id: 'long1', title: 'Field report — north site', content: LONG, color: 'blue' },
    { id: 'short1', title: 'Wifi', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Guest network: harbor-guest', styles: {} }] }] },
  ])
  await s.reload(); await s.waitForTimeout(1200)
  await openShare(s, 'Field report')
  const send = s.getByTestId('beam-send')
  ok('Share → Beam shows moving QR codes', await send.isVisible() && /codes · about \d+s/.test(await send.innerText()))
  const n = Number((await send.innerText()).match(/(\d+) codes/)[1])
  ok('a long note needs several codes', n >= 6, `${n} codes`)
  await shot(s, 'b01-beam-send')
  const step0 = Number(await send.locator('canvas').getAttribute('data-step')); await s.waitForTimeout(1000)
  ok('the codes keep changing', Number(await send.locator('canvas').getAttribute('data-step')) > step0 + 2)
  await send.getByRole('button', { name: 'Pause' }).click(); await s.waitForTimeout(300)
  const stepP = await send.locator('canvas').getAttribute('data-step'); await s.waitForTimeout(700)
  ok('Pause holds the current code', stepP === await send.locator('canvas').getAttribute('data-step'))
  await send.getByRole('button', { name: 'Play' }).click()
  await send.getByRole('button', { name: 'Fast' }).click(); await s.waitForTimeout(200)
  // film the screen: take 1.7× as many codes as there are blocks, then drop every 4th (a shaky hand)
  const filmed = await s.evaluate((count) => new Promise((res) => {
    const c = document.querySelector('[data-testid="beam-send"] canvas'); const out = []; let last = -1
    const t = setInterval(() => { const st = Number(c.dataset.step); if (st !== last) { last = st; out.push(c.toDataURL('image/png')) } if (out.length >= count) { clearInterval(t); res(out) } }, 12)
  }), Math.ceil(n * 1.7) + 2)
  const frames = filmed.slice(1).filter((_, i) => i % 4 !== 1)
  ok('codes are all different (fountain: later codes mix blocks)', new Set(filmed).size >= filmed.length - 3)
  await s.keyboard.press('Escape'); await s.waitForTimeout(300)

  const { ctx: rx, p: r } = await mk({}, camera(frames))
  await r.goto(APP); await r.waitForTimeout(700); await seed(r, []); await r.reload(); await r.waitForTimeout(1000)
  await r.keyboard.press('Control+k'); await r.waitForTimeout(300); await r.keyboard.type('receive with beam'); await r.waitForTimeout(250); await r.keyboard.press('Enter'); await r.waitForTimeout(1200)
  const dlg = r.getByRole('dialog', { name: 'Receive with Beam' })
  ok('Ctrl K → Receive with Beam opens the camera', await dlg.isVisible() && await dlg.locator('video').count() === 1)
  let sawProgress = false
  for (let i = 0; i < 80; i++) {
    if (/Receiving · \d+ of \d+/.test(await r.locator('[data-testid="beam-scan"] [role="status"]').innerText().catch(() => ''))) { sawProgress = true; await shot(r, 'b02-receiving') }
    if (await r.getByRole('button', { name: /^Add \d+ notes?$/ }).count()) break
    await r.waitForTimeout(250)
  }
  ok('the receiver shows progress while codes arrive', sawProgress)
  const stats = await r.getByTestId('beam-scan').evaluate((e) => ({ ...e.dataset })).catch(() => ({}))
  ok('…and, with a quarter of the codes missed, still gets everything', await r.getByRole('button', { name: 'Add 1 note' }).isVisible(), JSON.stringify({ n, frames: frames.length, ...stats }))
  await r.getByRole('button', { name: 'Add 1 note' }).click(); await r.waitForTimeout(800)
  const got = (await dbAll(r, 'notes')).find((x) => x.id === 'long1')
  ok('the note arrives intact (title, colour, every block)', got && got.title === 'Field report — north site' && got.color === 'blue' && got.content.length === LONG.length && got.content[3].content[0].text === LONG[3].content[0].text)
  ok('the camera is turned off afterwards', await r.evaluate(() => [...document.querySelectorAll('video')].every((v) => !v.srcObject || v.srcObject.getTracks().every((t) => t.readyState === 'ended'))))
  await rx.close()

  // ---------------- Beam: a short note is one code any camera can open
  await openShare(s, 'Wifi')
  const one = s.getByTestId('beam-send')
  ok('a short note is a single code that opens in any phone camera', /Scan with any phone camera/.test(await one.innerText()) && await one.locator('canvas').getAttribute('aria-label') === 'QR code with the link')
  await shot(s, 'b03-single')
  const pngPath = path.join(os.tmpdir(), 'folio-qr.png')
  await one.locator('canvas').screenshot({ path: pngPath })
  await s.keyboard.press('Escape'); await sx.close()

  // ---------------- receiving on a phone: + menu, no camera → a picture works too
  {
    const { ctx, p } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await p.goto(APP); await p.waitForTimeout(700); await seed(p, []); await p.reload(); await p.waitForTimeout(1000)
    await p.getByRole('button', { name: 'Create', exact: true }).click(); await p.waitForTimeout(500)
    const sheet = p.getByRole('dialog', { name: 'Create' })
    ok('phone + menu offers Page and Receive', await sheet.getByRole('button', { name: /^Page/ }).isVisible() && await sheet.getByRole('button', { name: /^Receive/ }).isVisible())
    await shot(p, 'b04-create-sheet')
    await sheet.getByRole('button', { name: /^Receive/ }).click(); await p.waitForTimeout(1200)
    const d = p.getByRole('dialog', { name: 'Receive with Beam' })
    ok('without a camera it says so kindly and offers a picture', /camera/i.test(await d.innerText()) && await d.getByRole('button', { name: 'Use a picture of a code' }).isVisible())
    await shot(p, 'b05-nocam')
    await d.getByLabel('Picture of a QR code').setInputFiles(pngPath); await p.waitForTimeout(2500)
    ok('a picture of the single code opens the shared note', await p.getByRole('button', { name: 'Add 1 note' }).isVisible())
    await p.getByRole('button', { name: 'Add 1 note' }).click(); await p.waitForTimeout(700)
    ok('…and it arrives', (await dbAll(p, 'notes')).some((x) => x.title === 'Wifi'))
    await ctx.close()
  }

  // ---------------- Markdown: as notes, or as pages
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-md-'))
  const vault = path.join(dir, 'Vault'); fs.mkdirSync(path.join(vault, 'Recipes'), { recursive: true }); fs.mkdirSync(path.join(vault, 'Work'), { recursive: true })
  fs.writeFileSync(path.join(vault, 'Inbox.md'), '# Inbox\n\nLoose ideas.\n')
  fs.writeFileSync(path.join(vault, 'Recipes', 'Daal.md'), '# Daal\n\n- lentils\n- cumin\n')
  fs.writeFileSync(path.join(vault, 'Work', 'Standup.md'), '# Standup\n\nShip the beam.\n')
  fs.writeFileSync(path.join(dir, 'Guide.md'), '# Team guide\n\nHow we work.\n')
  fs.writeFileSync(path.join(dir, 'Exported.md'), '---\ntitle: "Exported page"\nkind: page\n---\n# Exported page\n\nFrom another Folio.\n')
  const { ctx, p } = await mk()
  await p.goto(APP); await p.waitForTimeout(700); await seed(p, [{ id: 'hub', title: 'Projects hub', kind: 'page', content: [] }, { id: 'kid', title: 'Old plan', kind: 'page', content: [] }]); await p.reload(); await p.waitForTimeout(1000)
  const side = p.getByRole('complementary')
  await side.getByRole('button', { name: 'Pages', exact: true }).click(); await p.waitForTimeout(500)
  await p.getByRole('button', { name: 'Import', exact: true }).click(); await p.waitForTimeout(600)
  const imp = p.getByRole('dialog', { name: 'Import Markdown' })
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), imp.getByRole('button', { name: 'Choose files' }).click()]); await fc.setFiles([path.join(dir, 'Guide.md')]); await p.waitForTimeout(500)
  ok('importing from Pages starts as pages', await imp.getByRole('group', { name: 'Import as' }).getByRole('button', { name: 'Pages' }).getAttribute('aria-pressed') === 'true' && /Import 1 page/.test(await imp.innerText()))
  await imp.getByRole('combobox').nth(1).selectOption({ label: 'Inside: Projects hub' }).catch(async () => { await imp.locator('select').nth(1).selectOption({ label: 'Inside: Projects hub' }) })
  await shot(p, 'b06-import-pages')
  await imp.getByRole('button', { name: 'Import 1 page' }).click(); await p.waitForTimeout(900)
  let guide = (await dbAll(p, 'notes')).find((x) => x.title === 'Team guide')
  ok('…and lands as a page, inside the page you picked', guide && guide.kind === 'page' && guide.parentId === 'hub' && /under Pages/.test(await imp.innerText()))
  await imp.getByRole('button', { name: 'Open page' }).click(); await p.waitForTimeout(600)
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)

  await side.getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(400)
  await p.keyboard.press('Control+k'); await p.waitForTimeout(250); await p.keyboard.type('import markdown'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(600)
  await imp.locator('input[webkitdirectory]').setInputFiles(vault); await p.waitForTimeout(700)
  ok('importing from Notes starts as notes, with folders → notebooks', await imp.getByRole('group', { name: 'Import as' }).getByRole('button', { name: 'Notes' }).getAttribute('aria-pressed') === 'true' && /Sub-folders → notebooks/.test(await imp.innerText()) && !(await imp.getByText('Put in').count()))
  await shot(p, 'b07-import-notes')
  await imp.getByRole('button', { name: 'Import 3 notes' }).click(); await p.waitForTimeout(1000)
  await imp.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(500)
  const all = await dbAll(p, 'notes'); const books = await dbAll(p, 'labels')
  const daal = all.find((x) => x.title === 'Daal'), inbox = all.find((x) => x.title === 'Inbox')
  ok('notes land on the board, not inside pages', daal && !daal.parentId && inbox && !inbox.parentId && !all.some((x) => x.icon === '📁'))
  ok('each folder becomes a notebook', books.some((l) => l.name === 'Recipes' && daal.labels[0] === l.id) && books.some((l) => l.name === 'Work') && inbox.labels.length === 0)
  ok('the board shows them', (await p.locator('article', { hasText: 'Daal' }).count()) === 1 && (await p.locator('article', { hasText: 'Standup' }).count()) === 1)
  await p.keyboard.press('Control+k'); await p.waitForTimeout(250); await p.keyboard.type('import markdown'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(600)
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), imp.getByRole('button', { name: 'Choose files' }).click()]); await fc2.setFiles([path.join(dir, 'Exported.md')]); await p.waitForTimeout(500)
  await imp.getByRole('button', { name: 'Import 1 note' }).click(); await p.waitForTimeout(800)
  ok('a file that says “kind: page” stays a page', (await dbAll(p, 'notes')).find((x) => x.title === 'Exported page')?.kind === 'page')
  await imp.getByRole('button', { name: /^Open/ }).click(); await p.waitForTimeout(600)

  // ---------------- Move to…
  await p.getByRole('button', { name: /^More/ }).first().click(); await p.waitForTimeout(250)
  await p.getByRole('button', { name: 'Move to…' }).click(); await p.waitForTimeout(400)
  const mv = p.getByRole('dialog', { name: 'Move to…' })
  ok('Move to… lists other pages (with where they sit)', await mv.getByRole('button', { name: 'Projects hub', exact: true }).isVisible() && /Projects hub/.test(await mv.getByRole('button', { name: /Team guide/ }).innerText()))
  await mv.getByPlaceholder('Find a page').fill('old'); await p.waitForTimeout(200)
  await mv.getByRole('button', { name: /Old plan/ }).click(); await p.waitForTimeout(500)
  ok('picking one moves the page inside it, and says so', (await dbAll(p, 'notes')).find((x) => x.title === 'Exported page')?.parentId === 'kid' && /Moved inside “Old plan”/.test(await p.getByRole('status').first().innerText()))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)
  await p.locator('article', { hasText: 'Inbox' }).first().click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: /^More/ }).first().click(); await p.waitForTimeout(250)
  await p.getByRole('button', { name: 'Move inside a page…' }).click(); await p.waitForTimeout(400)
  ok('a page can’t be moved inside itself (or its own pages)', !(await mv.getByRole('button', { name: /Inbox/ }).count()))
  await mv.getByRole('button', { name: 'Projects hub', exact: true }).click(); await p.waitForTimeout(500)
  const ib = (await dbAll(p, 'notes')).find((x) => x.title === 'Inbox')
  ok('a quick note moved inside a page becomes a page', ib.parentId === 'hub' && ib.kind === 'page' && /it’s a page now/.test(await p.getByRole('status').first().innerText()))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)

  // ---------------- updates
  await side.getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(500)
  const set = p.getByRole('dialog', { name: 'Settings' })
  ok('Settings → About shows the version and an update button', /6\.3\.\d/.test(await set.innerText()) && (await set.getByRole('button', { name: /Check for updates|Reload/ }).count()) === 1)
  await set.getByRole('button', { name: 'What’s new' }).click(); await p.waitForTimeout(300)
  ok('What’s new lists this version', await p.getByRole('dialog', { name: /New in Folio56 6\.3/ }).isVisible() && /Beam/.test(await p.getByRole('dialog', { name: /New in Folio56/ }).innerText()))
  await p.getByRole('button', { name: 'Got it' }).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.evaluate(() => localStorage.setItem('folio.lastVersion', '6.2.0')); await p.reload(); await p.waitForTimeout(1200)
  ok('after an update, a one-time “What’s new” toast appears', await p.getByRole('status').filter({ hasText: 'Folio56 is now 6.3' }).isVisible())
  await shot(p, 'b08-whats-new')
  await p.reload(); await p.waitForTimeout(1000)
  ok('…only once', !(await p.getByRole('status').filter({ hasText: 'Folio56 is now' }).count()))
  await p.evaluate(() => localStorage.setItem('folio.lastVersion', '6.3.0')); await p.evaluate(() => { localStorage.removeItem('folio.lastVersion'); localStorage.removeItem('folio.app') })
  await p.reload(); await p.waitForTimeout(900)
  ok('a first visit never shows it', !(await p.getByRole('status').filter({ hasText: 'Folio56 is now' }).count()))

  // ---------------- accessibility
  await sx.close().catch(() => {})
  {
    const { ctx: c2, p: q } = await mk()
    await q.goto(APP); await q.waitForTimeout(600); await seed(q, [{ id: 'short2', title: 'Wifi two', content: [] }]); await q.reload(); await q.waitForTimeout(900)
    await openShare(q, 'Wifi two')
    await q.addScriptTag({ content: AXE })
    const v = await q.evaluate(async () => (await window.axe.run(document.querySelector('[role="dialog"]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((x) => x.id))
    ok('the Beam dialog passes axe (WCAG AA)', v.length === 0, v.join(','))
    await c2.close()
  }
  await ctx.close()
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((x) => !x.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
