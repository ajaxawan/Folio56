// Layout sweep: every main screen at several widths — screenshots, plus an automatic check that no
// visible button is covered by something else (overlap) and nothing scrolls sideways.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path')
const URL = process.env.URL || 'http://localhost:4174'; const OUT = process.env.SHOTS || '/tmp/claude-0/sweep'
fs.mkdirSync(OUT, { recursive: true })
const seed = () => new Promise((res) => {
  const t = (s) => [{ type: 'text', text: s, styles: {} }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes'], 'readwrite'); const now = Date.now()
    const put = (id, title, content, extra = {}) => tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: content.map((b) => (b.content ?? []).map?.((c) => c.text).join('') ?? '').join('\n').slice(0, 150), checklist: content.filter((b) => b.type === 'checkListItem').map((b) => ({ text: b.content[0].text, checked: false })), words: 300, createdAt: now - 864e5, updatedAt: now - 864e5, ...extra })
    const long = []
    for (const h of ['Overview', 'Site', 'Design', 'Permits', 'Budget']) { long.push({ type: 'heading', props: { level: 2 }, content: t(h) }); for (let i = 0; i < 3; i++) long.push({ type: 'paragraph', content: t(`Paragraph ${i} about ${h}. `.repeat(8)) }) }
    put('long', 'Heliorix Rooftop — Codes & Rules Reference for every US state', long, { cover: 'g:dawn', icon: '📘' })
    put('tasks', 'Weekly sync', [{ type: 'checkListItem', props: { checked: false }, content: t('Send the roadmap draft') }, { type: 'checkListItem', props: { checked: false }, content: t('Fix the export bug 🔄') }])
    for (let i = 0; i < 6; i++) put('n' + i, i ? `Note ${i}` : 'T', [{ type: 'paragraph', content: t('Some text '.repeat(i * 3 + 1)) }])
    tx.oncomplete = () => res(1)
  }
})
const check = (p) => p.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=switch]')) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0' || el.closest('[inert],.parked,[aria-hidden=true]')) continue
    let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; if (o < 0.2) continue
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
    const top = document.elementFromPoint(x, y)
    if (top && !el.contains(top) && !top.contains(el) && !top.closest('[data-popover],[role=dialog],[role=tooltip]')?.contains(el)) {
      // covered by an unrelated element (ignore scrims belonging to an open dialog)
      if ((top.closest('[role=dialog]') || top.querySelector?.('[role=dialog],[data-popover]') || top.closest('[data-popover]')) && !el.closest('[role=dialog],[data-popover]')) continue
      // partly scrolled out of its own scroll box (e.g. the last recents under the sidebar footer) is not an overlap
      { let sc = el.parentElement; while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement; if (sc) { const b = sc.getBoundingClientRect(); if (y > b.bottom - 2 || y < b.top + 2) continue } }
      bad.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)} ← ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}`)
    }
  }
  return { bad: [...new Set(bad)].slice(0, 6), wide: document.documentElement.scrollWidth > innerWidth + 1 }
})
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const report = []
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [390, 844]]) {
    const phone = w < 500
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', isMobile: phone, hasTouch: phone })
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', ai: false, name: 'Zain Iqbal' })); localStorage.setItem('folio.installHint', '1') } })
    const p = await ctx.newPage(); await p.goto(URL); await p.waitForTimeout(700); await p.evaluate(seed); await p.reload(); await p.waitForTimeout(1200)
    const snap = async (name) => { await p.waitForTimeout(450); await p.screenshot({ path: path.join(OUT, `${w}-${name}.png`) }); const r = await check(p); console.log(`${w} ${name}: ${r.wide ? 'SIDEWAYS SCROLL ' : ''}${r.bad.length ? r.bad.join(' | ') : 'ok'}`) }
    const back = async () => { await p.getByRole('button', { name: /^Back/ }).first().click(); await p.waitForTimeout(400) }
    await snap('home')
    await p.locator('article[data-note="long"]').click(); await p.waitForTimeout(1000); await snap('long-note')
    await p.getByRole('button', { name: 'More', exact: true }).click(); await snap('note-menu').catch(() => {}); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await back()
    if (!phone) { await p.getByRole('button', { name: /^Tasks/ }).first().click(); await p.waitForTimeout(500); await snap('tasks'); await p.getByRole('button', { name: 'Board', exact: true }).click(); await snap('board'); await p.getByRole('button', { name: 'Weekly review' }).click(); await snap('review') }
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('templates'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: 'Meeting minutes', exact: true }).first().click(); await snap('gallery'); await p.getByRole('dialog', { name: 'Templates' }).getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('make a presentation'); await p.keyboard.press('Enter'); await p.waitForTimeout(800); await snap('maker')
    await p.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(1500); await snap('studio')
    await back()
    report.push('')
    await ctx.close()
  }
  console.log(report.join('\n'))
  await b.close()
})()
