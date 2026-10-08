// V5.6 checks: light mode (Paper/Mist) contrast + switching, Auto follows the device, calm writing, A–Z sort, no tracking widgets.
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:4174/app';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const run = async (prefs, colorScheme = 'dark') => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme }); const p = await ctx.newPage();
    await p.goto(URL); await p.evaluate((pr) => localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', grain: false, ...pr })), prefs); await p.reload(); await p.waitForTimeout(900);
    return { ctx, p };
  };
  const axe = async (p) => { await p.addScriptTag({ content: AXE }); return p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}(${v.nodes.length})`)) };
  for (const t of ['paper', 'mist']) {
    const { ctx, p } = await run({ mode: 'light', lightTheme: t });
    ok(`${t}: html is in light mode`, await p.evaluate(() => document.documentElement.dataset.mode === 'light' && document.documentElement.dataset.theme !== 'charcoal'));
    await p.getByText('Take a note…').first().click(); await p.getByPlaceholder('Title').fill('Light test'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const v = await axe(p); ok(`${t}: no WCAG A/AA violations on home`, v.length === 0, v.join(' '));
    await p.locator('article').first().click(); await p.waitForTimeout(800);
    const v2 = await axe(p); ok(`${t}: no WCAG A/AA violations in editor`, v2.length === 0, v2.join(' '));
    await ctx.close();
  }
  { const { ctx, p } = await run({ mode: 'auto' }, 'light'); ok('auto + device light → light', await p.evaluate(() => document.documentElement.dataset.mode === 'light')); await ctx.close() }
  { const { ctx, p } = await run({ mode: 'auto' }, 'dark'); ok('auto + device dark → dark', await p.evaluate(() => document.documentElement.dataset.mode === 'dark')); await ctx.close() }
  {
    const { ctx, p } = await run({});
    ok('no progress ring, streak or writing grid on home', !(await p.getByText(/day streak|Writing days/).count()) && !(await p.locator('section[aria-label="Today"] svg circle').count()));
    await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(400);
    await p.getByRole('dialog').getByRole('button', { name: 'Light', exact: true }).click(); await p.waitForTimeout(300);
    ok('Settings → Light switches instantly', await p.evaluate(() => document.documentElement.dataset.mode === 'light'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    // A–Z sort
    for (const t of ['Zebra', 'apple', 'Mango']) { await p.getByText('Take a note…').first().click(); await p.getByPlaceholder('Title').fill(t); await p.keyboard.press('Escape'); await p.waitForTimeout(300) }
    await p.evaluate(() => { const pr = JSON.parse(localStorage.getItem('folio.prefs')); pr.sort = 'title'; localStorage.setItem('folio.prefs', JSON.stringify(pr)) }); await p.reload(); await p.waitForTimeout(800);
    const titles = await p.locator('article h3').allInnerTexts();
    const order = titles.filter((x) => ['Zebra', 'apple', 'Mango'].includes(x.trim()));
    ok('Title A–Z sort', order.join(',') === 'apple,Mango,Zebra', order.join(','));
    // calm writing
    await p.locator('article', { hasText: 'Mango' }).click(); await p.waitForTimeout(700);
    await p.locator('.bn-editor').click(); await p.keyboard.type('Writing quietly', { delay: 10 }); await p.waitForTimeout(700);
    const op = await p.evaluate(() => getComputedStyle(document.querySelector('header')).opacity);
    ok('calm writing: controls fade while typing', Number(op) < 0.5, op);
    await p.mouse.move(400, 300); await p.mouse.move(420, 320); await p.waitForTimeout(700);
    const op2 = await p.evaluate(() => getComputedStyle(document.querySelector('header')).opacity);
    ok('calm writing: controls return on mouse move', Number(op2) > 0.9, op2);
    await ctx.close();
  }
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`);
  await b.close();
})();
