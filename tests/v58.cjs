// V5.8 checks: speed and smoothness. Scroll position survives opening a note and switching views,
// cards don't re-animate, notes open fast, dialogs are solid, nav isn't duplicated, note checkboxes
// are styled; Margins cleans Office titles, zooms with ctrl+scroll in place, frees far pages.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4174/app';
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };

const seed = (n) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction('notes', 'readwrite'); const now = Date.now()
    for (let i = 0; i < n; i++) tx.objectStore('notes').put({ id: 'n' + i, title: 'Note ' + i, content: [{ type: 'paragraph', content: 'Some words for note ' + i }], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: n - i, locked: false, cipher: null, daily: null, preview: 'Some words for note ' + i + '\nand a second line', checklist: [], words: 5, createdAt: now - i * 1000, updatedAt: now - i * 1000 })
    tx.oncomplete = () => res(1)
  }
})
const main = (p) => p.locator('.main-scroll')

async function makePdf(b, pages, title) {
  const pg = await b.newPage()
  await pg.setContent(`<html><head><title>${title}</title></head><body style="margin:0;font:16pt Georgia">${Array.from({ length: pages }, (_, i) => `<section style="page-break-after:always;padding:30mm"><h1>Slide ${i + 1}</h1><p>Text on page ${i + 1}.</p></section>`).join('')}</body></html>`)
  const buf = await pg.pdf({ format: 'A4' }); await pg.close(); return buf.toString('base64')
}
const drop = (p, b64, name) => p.evaluate(([b64, name]) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  const dt = new DataTransfer(); dt.items.add(new File([u], name, { type: 'application/pdf' }))
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
}, [b64, name])

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', todayCollapsed: true })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') })
    await p.evaluate(seed, 300); await p.reload(); await p.locator('article').first().waitFor(); await p.waitForTimeout(1500)

    ok('top Notes/Pages/Tasks switch is hidden while the sidebar shows the same links', !(await p.locator('header').getByRole('button', { name: 'Pages', exact: true }).isVisible()))
    await main(p).evaluate((el) => el.scrollTo(0, 2400)); await p.waitForTimeout(500)
    const before = await main(p).evaluate((el) => el.scrollTop)
    // click the card that is actually under the middle of the screen (no auto-scrolling)
    const box = await main(p).boundingBox()
    await p.mouse.click(box.x + 120, box.y + box.height / 2); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(400)
    await p.keyboard.press('Escape'); await p.waitForTimeout(600)
    const after = await main(p).evaluate((el) => el.scrollTop)
    ok('closing a note returns to the same scroll position', before > 2000 && Math.abs(after - before) < 4, `${before} → ${after}`)
    ok('cards do not re-animate when you come back', (await p.locator('.animate-rise').count()) === 0)

    await p.getByRole('button', { name: 'Pages', exact: true }).first().click(); await p.waitForTimeout(500)
    await p.getByRole('button', { name: 'Notes', exact: true }).first().click(); await p.waitForTimeout(600)
    ok('switching views and back keeps your place in Notes', Math.abs((await main(p).evaluate((el) => el.scrollTop)) - before) < 4)

    // warm note-open time, measured inside the page
    const times = []
    for (let k = 0; k < 3; k++) {
      times.push(await p.evaluate((k) => new Promise((res) => {
        const t0 = performance.now()
        const mo = new MutationObserver(() => { if (document.querySelector('.bn-editor')) { mo.disconnect(); requestAnimationFrame(() => res(Math.round(performance.now() - t0))) } })
        mo.observe(document.body, { childList: true, subtree: true })
        const r = document.querySelector('.main-scroll').getBoundingClientRect()
        const seen = [...document.querySelectorAll('.main-scroll article')].filter((a) => { const b = a.getBoundingClientRect(); return b.top > r.top + 20 && b.bottom < r.bottom - 20 })
        seen[k].click()
      }), k))
      await p.keyboard.press('Escape'); await p.waitForTimeout(500)
    }
    ok('a note opens in under 150 ms once Folio is warm', Math.max(...times) < 150, times.join(', ') + ' ms')

    // checkbox style + solid surfaces
    await p.locator('article').first().click(); await p.locator('.bn-editor').click(); await p.keyboard.press('Control+End')
    await p.keyboard.press('Enter'); await p.keyboard.type('[] a task'); await p.waitForTimeout(300)
    ok('checkboxes in notes are Folio-styled, not browser defaults', (await p.locator('.folio-editor input[type=checkbox]').first().evaluate((el) => getComputedStyle(el).appearance)) === 'none')
    await p.getByRole('button', { name: 'More' }).first().click(); await p.waitForTimeout(200)
    ok('menus are solid (text behind never shows through)', (await p.locator('[data-popover]').first().evaluate((el) => getComputedStyle(el).backgroundColor)).match(/rgb\(|\/ 1\)|, 1\)$/) !== null)
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
    await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(300)
    const bg = await p.locator('[role=dialog]').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    ok('dialogs are solid', !/\/ 0\.\d+\)|, 0\.\d+\)$/.test(bg), bg)
    await p.keyboard.press('Escape')
    await ctx.close()
  }
  // Margins
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') }); await p.reload(); await p.waitForTimeout(800)
    const pdf = await makePdf(b, 30, 'Microsoft PowerPoint - Quarterly-Review-2026.pptx')
    await p.goto(URL + '/?view=margins'); await p.waitForTimeout(800)
    await drop(p, pdf, 'Quarterly-Review-2026.pdf'); await p.waitForTimeout(2500)
    const title = (await p.locator('header .font-title').first().textContent()).trim()
    ok('Office “Microsoft PowerPoint - … .pptx” noise is stripped from the title', title === 'Quarterly-Review-2026', title)
    const w0 = (await p.locator('.pdf-page[data-page="3"]').boundingBox()).width
    await p.locator('.pdf-page[data-page="3"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(500)
    const pageBefore = await p.locator('input[aria-label="Page number"]').inputValue()
    await p.mouse.move(800, 500); await p.keyboard.down('Control')
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -60); await p.waitForTimeout(40) }
    await p.keyboard.up('Control'); await p.waitForTimeout(1200)
    const w1 = (await p.locator('.pdf-page[data-page="3"]').boundingBox()).width
    ok('ctrl + scroll (or a trackpad pinch) zooms the pages', w1 > w0 * 1.2, `${Math.round(w0)} → ${Math.round(w1)}`)
    ok('zooming keeps you on the same page', (await p.locator('input[aria-label="Page number"]').inputValue()) === pageBefore)
    await p.locator('input[aria-label="Page number"]').fill('28'); await p.keyboard.press('Enter'); await p.waitForTimeout(2600)
    const freed = await p.evaluate(() => { const c = document.querySelector('.pdf-page[data-page="2"] canvas'); return c ? c.width === 0 : false })
    ok('pages far behind you are let go (big PDFs stay light on memory)', freed)
    await p.locator('input[aria-label="Page number"]').fill('2'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
    ok('…and redrawn when you come back', await p.evaluate(() => (document.querySelector('.pdf-page[data-page="2"] canvas')?.width ?? 0) > 0))
    const f = await p.evaluate(() => getComputedStyle(document.querySelector('.pdf-page canvas')).filter)
    ok('the Warm page tint is gentle (colours stay true)', /sepia\(0\.09\)/.test(f), f)
    await ctx.close()
  }
  ok('no page errors', errors.length === 0, errors.join(' | '))
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`)
  await b.close()
})()
