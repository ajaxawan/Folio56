// V6.4 motion: Calm / Lively / Still (and the device's "reduce motion"), cards gliding to new places,
// archive/trash flights, dialogs that leave gently and follow a finger on phones, the theme reveal,
// toasts, and the rules that keep it comfortable: only transform/opacity, nothing while typing.
// Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const dbAll = (p, store) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) } }), store)
const para = (s) => [{ type: 'paragraph', content: [{ type: 'text', text: s, styles: {} }] }]
const seed = (p) => p.evaluate((list) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); const now = Date.now()
    list.forEach((n, i) => tx.objectStore('notes').put({ color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now - i * 1000, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: n.title + ' body', checklist: [], words: 20, createdAt: now - 864e5, updatedAt: now - 864e5 - i * 1000, ...n }))
    tx.objectStore('meta').put({ key: 'welcomed', value: 1 }); tx.oncomplete = () => res(1)
  }
}), Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, title: `Card ${i + 1}`, content: para(`Body of card ${i + 1}.`) })))
/** Animations running right now (spinners excluded). */
const running = (p) => p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getTiming?.().duration ?? 0) > 5 && !(a.effect?.target?.closest?.('.animate-spin'))).map((a) => a.animationName || a.id || (a.effect?.target?.getAttribute?.('data-flip') ? 'flip' : 'waapi')))

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async (opts = {}, prefs = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', ...opts })
    await ctx.addInitScript((pr) => { if (!sessionStorage.getItem('m')) { sessionStorage.setItem('m', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', name: 'Zain', ...pr })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1'); localStorage.setItem('folio.lastVersion', '9.9.9') } }, prefs)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(600); await seed(p); await p.reload(); await p.waitForTimeout(1300)
    return { ctx, p }
  }
  const side = (p) => p.getByRole('complementary')

  const { ctx, p } = await mk()
  ok('Calm is the default', await p.evaluate(() => document.documentElement.dataset.motion) === 'calm')

  // ---------------- cards glide when they change places
  const card = p.locator('[data-flip="n6"]')
  await card.hover(); await card.getByRole('button', { name: 'Pin' }).click({ force: true })
  await p.waitForTimeout(40)
  const glides = (await running(p)).filter((x) => x === 'flip').length
  ok('pinning a card makes the others glide to their new places (not jump)', glides >= 3, `${glides} gliding`)
  await p.waitForTimeout(700)
  ok('…and they settle (nothing left moving)', (await running(p)).length === 0, (await running(p)).join(','))

  // ---------------- archive: the card flies to Archive in the sidebar
  const c3 = p.locator('[data-flip="n3"]')
  await c3.hover(); await c3.getByRole('button', { name: 'Archive' }).click()
  await p.waitForTimeout(120)
  const ghost = await p.evaluate(() => { const g = [...document.body.children].find((e) => e.getAttribute('aria-hidden') === 'true' && e.style.position === 'fixed'); return g ? { x: g.getBoundingClientRect().left } : null })
  ok('archiving: a ghost of the card flies towards Archive', !!ghost && ghost.x < 600, JSON.stringify(ghost))
  await shot(p, 'm01-archive-flight')
  await p.waitForTimeout(800)
  ok('…lands, and the note is archived (no ghost left behind)', (await dbAll(p, 'notes')).find((n) => n.id === 'n3').archived === true && await p.evaluate(() => ![...document.body.children].some((e) => e.getAttribute('aria-hidden') === 'true' && e.style.position === 'fixed')))

  // ---------------- dialogs grow out of the button and leave gently
  await side(p).getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(60)
  const dlg = p.getByRole('dialog', { name: 'Settings' })
  const origin = await dlg.evaluate((e) => getComputedStyle(e).getPropertyValue('--origin'))
  ok('a dialog grows out of the button you pressed', /px .*px/.test(origin), origin)
  await p.waitForTimeout(500)
  // Motion setting: the thumb glides, the level changes at once
  const motionGroup = dlg.getByRole('group', { name: 'Motion' })
  await motionGroup.scrollIntoViewIfNeeded()
  ok('Settings → Motion shows Calm, Lively and Still', await motionGroup.getByRole('button', { name: 'Calm' }).getAttribute('aria-pressed') === 'true' && await motionGroup.getByRole('button', { name: 'Still' }).isVisible())
  const thumb0 = await motionGroup.locator('.seg-thumb').evaluate((e) => e.style.transform)
  await motionGroup.getByRole('button', { name: 'Lively' }).click(); await p.waitForTimeout(60)
  ok('the chosen pill glides to its place', await motionGroup.locator('.seg-thumb').evaluate((e) => e.style.transform) !== thumb0 && (await running(p)).length > 0)
  ok('Lively takes effect at once', await p.evaluate(() => document.documentElement.dataset.motion) === 'lively')
  await shot(p, 'm02-motion')
  await motionGroup.getByRole('button', { name: 'Calm' }).click(); await p.waitForTimeout(400)
  await p.keyboard.press('Escape'); await p.waitForTimeout(60)
  ok('Escape: the dialog leaves with a short fade, not a cut', await dlg.count() === 1 && /animate-leave/.test(await dlg.getAttribute('class')))
  await p.waitForTimeout(350)
  ok('…and is gone right after', await dlg.count() === 0)

  // ---------------- the theme reveal
  await side(p).getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(500)
  const vtSeen = p.evaluate(() => new Promise((res) => { const t0 = Date.now(); const tick = () => { if (document.documentElement.dataset.vt === 'reveal') res(true); else if (Date.now() - t0 > 1500) res(false); else requestAnimationFrame(tick) }; tick() }))
  await p.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /Moss/ }).click()
  ok('choosing a theme spreads it out from where you tapped', await vtSeen)
  await p.waitForTimeout(250); await shot(p, 'm03-reveal'); await p.waitForTimeout(700)
  ok('…and the theme is applied', await p.evaluate(() => document.documentElement.dataset.theme) === 'moss')
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)

  // ---------------- comfort: nothing moves while typing, only cheap properties animate
  await p.locator('article', { hasText: 'Card 1' }).first().click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(900)
  await p.locator('.bn-editor').click(); await p.keyboard.type('Typing should feel perfectly still.', { delay: 15 })
  ok('typing in a note sets nothing in motion', (await running(p)).length === 0, (await running(p)).join(','))
  const props = await p.evaluate(() => {
    const names = ['pop', 'grow', 'toast', 'leave', 'sheetin', 'sheetout', 'rise', 'vt-in', 'vt-in-fwd', 'vt-in-back', 'vt-out', 'reveal', 'donecircle', 'fadeout', 'fade']
    const used = new Set()
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch { continue } for (const r of rules) if (r instanceof CSSKeyframesRule && names.includes(r.name)) for (const k of r.cssRules) for (const prop of k.style) used.add(prop) }
    return [...used]
  })
  ok('the shared animations only move transform, opacity (and a clip for the reveal)', props.length > 0 && props.every((x) => /^(transform|opacity|clip-path)$/.test(x)), props.join(','))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)

  // ---------------- views slide the way you went
  const dir = (name) => p.evaluate(() => new Promise((res) => { const t0 = Date.now(); const tick = () => { const v = document.documentElement.dataset.vt; if (v) res(v); else if (Date.now() - t0 > 800) res(''); else requestAnimationFrame(tick) }; tick() }))
  let d = dir(); await side(p).getByRole('button', { name: 'Tasks' }).click()
  ok('going down the sidebar slides forward', await d === 'forward')
  await p.waitForTimeout(500)
  await p.waitForFunction(() => !document.documentElement.dataset.vt, null, { timeout: 3000 }).catch(() => {})
  d = dir(); await side(p).getByRole('button', { name: 'Notes', exact: true }).click()
  const back = await d
  ok('going back up slides back', back === 'back', back)
  await p.waitForTimeout(500)
  await ctx.close()

  // ---------------- Still: chosen, or asked for by the device
  {
    const { ctx, p } = await mk({ reducedMotion: 'reduce' })
    ok('when the device asks for less motion, Folio starts Still', await p.evaluate(() => document.documentElement.dataset.motion) === 'still')
    const c = p.locator('[data-flip="n5"]'); await c.hover(); await c.getByRole('button', { name: 'Pin' }).click({ force: true }); await p.waitForTimeout(40)
    ok('Still: cards change places instantly', (await running(p)).length === 0, (await running(p)).join(','))
    await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(80)
    const dur = await p.getByRole('dialog', { name: 'Settings' }).evaluate((e) => getComputedStyle(e).animationDuration)
    ok('Still: dialogs appear without travelling', parseFloat(dur) <= 0.002, dur)
    const mg = p.getByRole('dialog', { name: 'Settings' }).getByRole('group', { name: 'Motion' })
    ok('…and Settings says why', /asks for less motion/.test(await mg.innerText()))
    await mg.getByRole('button', { name: 'Calm' }).click(); await p.waitForTimeout(100)
    ok('you can still choose Calm on such a device', await p.evaluate(() => document.documentElement.dataset.motion) === 'calm')
    await ctx.close()
  }

  // ---------------- phones: sheets follow your finger
  {
    const { ctx, p } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await p.getByRole('button', { name: 'Create', exact: true }).click(); await p.waitForTimeout(500)
    const sheet = p.getByRole('dialog', { name: 'Create' })
    const box = await sheet.boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down()
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + box.width / 2, box.y + 12 + i * 12); await p.waitForTimeout(16) }
    const moved = await sheet.evaluate((e) => e.style.transform)
    ok('a sheet follows your finger down', /translateY\((9\d|1\d\d)/.test(moved), moved)
    await p.mouse.up(); await p.waitForTimeout(450)
    ok('…and springs back if you let go early', await sheet.count() === 1 && await sheet.evaluate((e) => e.style.transform === ''))
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down()
    for (let i = 1; i <= 10; i++) { await p.mouse.move(box.x + box.width / 2, box.y + 12 + i * 26); await p.waitForTimeout(12) }
    await p.mouse.up(); await p.waitForTimeout(500)
    ok('pull it far (or flick it) and it closes', await sheet.count() === 0)
    await shot(p, 'm04-phone')
    await ctx.close()
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
