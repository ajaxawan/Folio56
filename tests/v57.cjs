// V5.7 checks: Margins (PDF reader) — open by drop, pages + text layer, contents, remembered page,
// notes beside the PDF, quote / highlight / snapshot, page links, text view, search, phone layout, light-mode
// contrast; plus the roomier tables.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'http://localhost:4174/app';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PDF = fs.readFileSync(path.join(__dirname, 'sample.pdf')).toString('base64');
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };

const drop = (p) => p.evaluate((b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  const dt = new DataTransfer(); dt.items.add(new File([u], 'field-notes.pdf', { type: 'application/pdf' }))
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
}, PDF);
const select = (p, page, needle) => p.evaluate(([page, needle]) => {
  const sp = [...document.querySelectorAll(`.pdf-page[data-page="${page}"] .textLayer span`)].find((s) => s.textContent.includes(needle)); if (!sp) return false
  const r = document.createRange(); const t = sp.firstChild; const i = t.textContent.indexOf(needle)
  r.setStart(t, i); r.setEnd(t, i + needle.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true
}, [page, needle]);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', grain: false })); localStorage.setItem('folio.installHint', '1') }); await p.reload(); await p.waitForTimeout(900)

    await p.getByRole('button', { name: 'Margins' }).first().click(); await p.waitForTimeout(900)
    ok('Margins home shows an Open a PDF button', await p.getByRole('button', { name: 'Open a PDF' }).isVisible())
    await drop(p); await p.waitForTimeout(2500)
    ok('dropped PDF opens: pages render with selectable text', (await p.locator('.pdf-page canvas').count()) === 8 && (await p.locator('.pdf-page[data-page="1"] .textLayer span').count()) > 3)
    ok('the app sidebar steps aside while reading', !(await p.locator('nav').getByRole('button', { name: 'Journal' }).isVisible().catch(() => false)))
    ok('contents list comes from the PDF outline', (await p.getByRole('button', { name: /Chapter 2: Where I Lived/ }).count()) === 1)
    await p.getByRole('button', { name: /Chapter 3: Reading/ }).click(); await p.waitForTimeout(900)
    ok('contents jumps to the page', (await p.locator('input[aria-label="Page number"]').inputValue()) === '4')

    // notes beside
    await p.getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(1500)
    ok('Notes opens a linked note beside the PDF', (await p.locator('.note-embedded textarea[aria-label="Title"]').inputValue()).includes('— notes'))
    await p.getByRole('button', { name: /Chapter 2: Where I Lived/ }).click(); await p.waitForTimeout(900)
    const picked = await select(p, 3, 'Our life is frittered away by detail.')
    ok('select text shows the selection toolbar', picked && await p.getByRole('toolbar', { name: 'Selection' }).waitFor({ timeout: 2000 }).then(() => true, () => false))
    await p.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Quote' }).click(); await p.waitForTimeout(800)
    ok('Quote adds a quote with a page link to the note', (await p.locator('.note-embedded [data-content-type="quote"]').count()) === 1 && (await p.locator('.note-embedded a[href="#page=3"]').count()) >= 1)
    await select(p, 3, 'I went to the woods'); await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Highlight green' }).click(); await p.waitForTimeout(500)
    ok('highlight is drawn on the page', (await p.locator('.pdf-page[data-page="3"] .pdf-mark').count()) >= 1)
    await p.getByRole('tab', { name: 'Marks' }).click(); await p.waitForTimeout(300)
    ok('highlight is listed under Marks', (await p.getByText('“I went to the woods”').count()) === 1)

    // snapshot of a region
    await p.keyboard.press('Escape')
    await p.locator('.pdf-page[data-page="3"]').scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: /Snap part of a page/ }).click(); await p.waitForTimeout(300)
    const bx = await p.locator('.pdf-page[data-page="3"]').boundingBox()
    await p.mouse.move(bx.x + 60, bx.y + 80); await p.mouse.down(); await p.mouse.move(bx.x + 420, bx.y + 300, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(2500)
    ok('dragging a box snaps that part of the page into the note as a picture', (await p.locator('.note-embedded .bn-block-content[data-content-type="image"]').count()) === 1)

    // page link in the note jumps the PDF
    await p.getByRole('button', { name: /Chapter 7/ }).first().click().catch(async () => { await p.getByRole('tab', { name: 'Contents' }).click(); await p.getByRole('button', { name: /Chapter 7/ }).click() }); await p.waitForTimeout(800)
    await p.locator('.note-embedded a[href="#page=3"]').first().click(); await p.waitForTimeout(900)
    ok('a page link in the note jumps the PDF back to that page', (await p.locator('input[aria-label="Page number"]').inputValue()) === '3')

    // text view
    await p.getByRole('button', { name: 'Text', exact: true }).click(); await p.waitForTimeout(1000)
    ok('Text view reflows the page into readable paragraphs', (await p.locator('article p').filter({ hasText: 'frittered away by detail' }).count()) >= 1)
    await p.getByRole('button', { name: 'Page', exact: true }).click(); await p.waitForTimeout(800)

    // search
    await p.keyboard.press('Control+f'); await p.waitForTimeout(200); await p.keyboard.type('stitch'); await p.keyboard.press('Enter'); await p.waitForTimeout(1600)
    ok('Find lists every page with matches', (await p.getByText(/\d+ results?/).first().textContent()).startsWith('8'))
    ok('matches are marked on the page', (await p.locator('.pdf-hit').count()) >= 1)

    // remembered
    await p.locator('input[aria-label="Page number"]').fill('5'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: 'Close PDF' }).click(); await p.waitForTimeout(800)
    ok('closing shows the recent list with the page and highlights remembered', (await p.getByText(/Page 5 of 8 · 1 highlight/).count()) === 1)
    ok('the PDF file itself is not stored', await p.evaluate(async () => {
      const dbs = await new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => res(r.result) })
      const all = await new Promise((res) => { const t = dbs.transaction('blobs').objectStore('blobs').getAll(); t.onsuccess = () => res(t.result) })
      return all.every((x) => !String(x.type).includes('pdf')) && all.reduce((s, x) => s + x.size, 0) < 400000
    }))
    // reopen by dropping again → back to last page
    await drop(p); await p.waitForTimeout(2500)
    ok('reopening the same PDF returns to the last page', (await p.locator('input[aria-label="Page number"]').inputValue()) === '5', await p.locator('input[aria-label="Page number"]').inputValue())
    ok('reopening keeps highlights', (await p.locator('.pdf-mark').count()) >= 1)
    await ctx.close()
  }
  // tables
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off' })); localStorage.setItem('folio.installHint', '1') }); await p.reload(); await p.waitForTimeout(900)
    await p.getByText('Take a note…').first().click(); await p.getByPlaceholder('Title').fill('Table page'); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
    await p.locator('article').first().click(); await p.waitForTimeout(900)
    await p.locator('.bn-editor').click(); await p.keyboard.type('/table', { delay: 20 }); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(500)
    await p.keyboard.type('Point3dCollection'); await p.waitForTimeout(400)
    const t = await p.evaluate(() => { const td = document.querySelector('.folio-editor td'); const cs = td && getComputedStyle(td); return cs ? { wb: cs.wordBreak, ow: cs.overflowWrap, pad: cs.paddingLeft } : null })
    ok('table cells keep whole words and roomy padding', t && t.wb === 'normal' && t.ow === 'normal' && parseFloat(t.pad) >= 12, JSON.stringify(t))
    await ctx.close()
  }
  // phone
  {
    const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], serviceWorkers: 'block' }); const p = await ctx.newPage()
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off' })); localStorage.setItem('folio.installHint', '1') }); await p.reload(); await p.waitForTimeout(900)
    await p.goto(URL + '/?view=margins'); await p.waitForTimeout(1200)
    ok('phone: ?view=margins opens Margins', await p.getByRole('button', { name: 'Open a PDF' }).isVisible())
    await drop(p); await p.waitForTimeout(2500)
    const w = await p.locator('.pdf-page[data-page="1"]').boundingBox()
    ok('phone: page fits the screen width', w && w.width <= 393 && w.width > 330, String(w?.width))
    await p.getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(1200)
    ok('phone: notes open full screen with a way back', await p.getByRole('button', { name: 'Back to PDF' }).isVisible())
    await ctx.close()
  }
  // light mode contrast in Margins home
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', mode: 'light', lightTheme: 'paper' })); localStorage.setItem('folio.installHint', '1') }); await p.reload(); await p.waitForTimeout(900)
    await p.goto(URL + '/?view=margins'); await p.waitForTimeout(1200)
    await p.addScriptTag({ content: AXE })
    const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((x) => `${x.id}(${x.nodes.length})`))
    ok('light mode: Margins home has no WCAG A/AA violations', v.length === 0, v.join(' '))
    await ctx.close()
  }
  ok('no page errors', errors.length === 0, errors.join(' | '))
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`)
  await b.close()
})();
