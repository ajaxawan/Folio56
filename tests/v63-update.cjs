// V6.3 updates, for real: a service worker is installed, a newer build is put on the server, and
// "Check for updates" finds it, offers it, and installs it. Needs `npm run preview` on :4174.
// Rebuilds dist/ twice (a "newer" 6.3.x-test, then the normal build again).
const { chromium } = require('playwright');
const { execSync } = require('child_process')
const path = require('path')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const ROOT = path.join(__dirname, '..')
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const build = (env = {}) => execSync('npx vite build', { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'pipe' })

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'allow' })
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('u')) { sessionStorage.setItem('u', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', name: 'Zain' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(800)
    await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(1500)
    ok('the app runs under its service worker', await p.evaluate(() => !!navigator.serviceWorker.controller))
    const settings = async () => { await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(500); return p.getByRole('dialog', { name: 'Settings' }) }
    let set = await settings()
    await set.getByRole('button', { name: 'Check for updates' }).click()
    await set.getByText('You have the latest version.').waitFor({ timeout: 15000 }).catch(() => {})
    ok('Check for updates: nothing new yet', await set.getByText('You have the latest version.').isVisible())
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)

    build({ FOLIO_VERSION: '6.3.9-test' })
    set = await settings()
    await set.getByRole('button', { name: 'Check for updates' }).click()
    await set.getByText('A new version is ready.').waitFor({ timeout: 30000 }).catch(() => {})
    ok('a newer version on the server is found and downloaded', await set.getByText('A new version is ready.').isVisible())
    ok('…and the “new version is ready” bar appears too', await p.getByRole('status').filter({ hasText: 'A new version of Folio is ready' }).isVisible())
    await set.getByRole('button', { name: 'Update now' }).click()
    await p.waitForEvent('load', { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(1800)
    set = await settings()
    ok('Update now installs it and reloads into the new version', /6\.3\.9-test/.test(await set.innerText()))
    await p.keyboard.press('Escape')
    ok('a patch update doesn’t show “What’s new”', !(await p.getByRole('status').filter({ hasText: 'Folio56 is now' }).count()))
    await ctx.close()
  } finally {
    build()
  }
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
