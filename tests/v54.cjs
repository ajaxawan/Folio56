// V5.4 checks: tasks revamp, meeting series follow-up, copy as message, dictation, voice journal,
// quick-capture links, stacks, label colours, swipe. Needs `npm run preview` on :4174. Groq is mocked.
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || __dirname + '/../qa/v54'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:4174';
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info }); console.log(pass ? 'PASS' : 'FAIL', name, info) };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };

async function mockGroq(ctx) {
  await ctx.route('https://api.groq.com/**', async (route) => {
    const u = route.request().url();
    if (u.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'whisper-large-v3' }] } });
    if (u.includes('/audio/transcriptions')) return route.fulfill({ json: { text: 'uh so the pile plan is done and we still need the inverter count', duration: 3, segments: [{ start: 0, end: 3, text: 'So the pile plan is done and we still need the inverter count.' }] } });
    const body = JSON.parse(route.request().postData() || '{}'); const ask = body.messages?.[1]?.content || '';
    let out = 'Okay.';
    if (/Clean up this dictation/.test(ask)) out = 'Cleaned dictation text.';
    else if (/personal journal entry/.test(ask)) out = 'Long day on site, but the pile plan is finally done.\n\n- [ ] Ask Zain about the inverter count 📅 ' + iso(1);
    else if (/meeting minutes/.test(ask)) out = `# Weekly sync\n**Date:** today\n\n## Summary\nShort sync.\n\n${/Follow-up from last meeting/.test(ask) ? '## Follow-up from last meeting\n- [1] ✅ Ahmed — update the pile plan — done\n- [2] ⏳ Confirm inverter count — still open\n\n' : ''}## Action items\n- [ ] **Zain** — book the site visit 📅 ${iso(3)}`;
    return route.fulfill({ json: { choices: [{ message: { content: out } }] } });
  });
}
const seed = (d) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const db = r.result; const tx = db.transaction(['notes', 'labels', 'meta'], 'readwrite'); const now = Date.now();
    tx.objectStore('meta').put({ key: 'voice', value: { key: 'gsk_test' } });
    tx.objectStore('meta').put({ key: 'derive54', value: 1 });
    tx.objectStore('labels').put({ id: 'l1', name: '.NET Plugin Automation' }); tx.objectStore('labels').put({ id: 'l2', name: 'Meetings' });
    const T = (t, c = false) => ({ type: 'checkListItem', props: { checked: c }, content: [{ type: 'text', text: t, styles: {} }] });
    const mk = (id, title, content, extra = {}) => ({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], position: 50, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: '', checklist: content.filter((b) => b.type === 'checkListItem').map((b) => ({ text: b.content[0].text, checked: b.props.checked })), words: 20, createdAt: now - 7 * 864e5, updatedAt: now - 7 * 864e5, ...extra });
    tx.objectStore('notes').put(mk('prev', 'Weekly site review · last week', [T('Ahmed — update the pile plan'), T('Confirm inverter count 📅 ' + d.yesterday)], { series: 'Weekly site review', labels: ['l2'] }));
    for (let i = 1; i <= 4; i++) tx.objectStore('notes').put(mk('kb' + i, `0${i} — KB chapter ${i}`, [{ type: 'paragraph', content: [{ type: 'text', text: 'Command Authoring KB · doc', styles: {} }] }], { labels: ['l1'], preview: `Command Authoring KB · doc ${i} of 4`, createdAt: now - i * 1000, updatedAt: now - i * 1000, position: 40 - i }));
    tx.oncomplete = () => res(1);
  };
});

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  await mockGroq(ctx);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x1, y, x2) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / 8, y }] }); await p.waitForTimeout(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await p.goto(URL); await p.waitForTimeout(600);
  await p.evaluate(() => { localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off' })) });
  await p.evaluate(seed, { yesterday: iso(-1) }); await p.reload(); await p.waitForTimeout(1000);

  // ---------- stacks + label colours ----------
  ok('stack suggestion appears for numbered notes', await p.getByRole('button', { name: 'Stack them' }).isVisible());
  await p.getByRole('button', { name: 'Stack them' }).click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(600);
  ok('numbered notes collapse into one stack card', (await p.locator('article[data-stack]').count()) === 1 && (await p.locator('article', { hasText: 'KB chapter 3' }).count()) === 1);
  await p.screenshot({ path: OUT + '/01-stack.png' });
  await p.locator('article[data-stack] h3').click(); await p.waitForTimeout(500);
  ok('tapping the stack fans it out', (await p.locator('article[data-stack]').count()) === 0 && (await p.locator('article[data-note]', { hasText: 'KB chapter' }).count()) === 4);
  await p.screenshot({ path: OUT + '/02-fanned.png' });
  await p.getByTitle('Collapse the series back into a stack').first().click(); await p.waitForTimeout(400);
  ok('series chip collapses it again', (await p.locator('article[data-stack]').count()) === 1);
  const colours = await p.evaluate(() => [...new Set([...document.querySelectorAll('article span.h-1\\.5.w-1\\.5')].map((e) => getComputedStyle(e).backgroundColor))]);
  ok('labels get different colours automatically', colours.length === 2 && colours[0] !== colours[1], colours.join(' / '));

  // ---------- swipe a card ----------
  const card = p.locator('article[data-note]', { hasText: 'last week' }).first();
  await card.scrollIntoViewIfNeeded(); const bb = await card.boundingBox();
  await swipe(bb.x + 30, bb.y + 30, bb.x + 30 - 140);
  await p.waitForTimeout(500);
  ok('swipe left archives with Undo', await p.getByRole('status').filter({ hasText: 'Archived' }).isVisible());
  await p.getByRole('status').getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(400);
  ok('Undo brings the card back', (await p.locator('article[data-note]', { hasText: 'last week' }).count()) === 1);

  // ---------- tasks ----------
  await p.getByRole('button', { name: 'Tasks' }).last().click(); await p.waitForTimeout(500);
  ok('Today list shows overdue with "Move all to today"', await p.getByText('Overdue').first().isVisible() && await p.getByRole('button', { name: 'Move all to today' }).isVisible());
  await p.screenshot({ path: OUT + '/03-tasks-today.png' });
  await p.getByLabel('Add a task').fill('call Ahmed tomorrow !!'); await p.waitForTimeout(150);
  ok('quick add understands date + star as you type', await p.getByText('Tomorrow').first().isVisible() && await p.getByText('Starred').first().isVisible());
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await p.getByRole('tab', { name: /Upcoming/ }).click(); await p.waitForTimeout(300);
  ok('quick-added task lands in Upcoming → Tomorrow', await p.getByRole('region', { name: 'Tomorrow' }).getByText('call Ahmed').isVisible());
  await p.screenshot({ path: OUT + '/04-tasks-upcoming.png' });
  await p.getByRole('tab', { name: /Today/ }).click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Move all to today' }).click(); await p.waitForTimeout(500);
  ok('overdue moved to today', !(await p.getByText('Overdue').first().isVisible().catch(() => false)) && await p.getByRole('region', { name: 'Today' }).getByText('Confirm inverter count').isVisible());
  // open sheet, reschedule to next week
  await p.getByText('Confirm inverter count').click(); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/05-task-sheet.png' });
  await p.getByRole('button', { name: 'Next week' }).click(); await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(500);
  ok('task sheet reschedules', !(await p.getByRole('region', { name: 'Today' }).getByText('Confirm inverter count').isVisible().catch(() => false)));
  // complete by swipe right in Anytime list
  await p.getByRole('tab', { name: /Anytime/ }).click(); await p.waitForTimeout(300);
  const row = p.getByText('update the pile plan').first(); const rb = await row.boundingBox();
  await swipe(rb.x + 10, rb.y + 8, rb.x + 170); await p.waitForTimeout(1400);
  ok('swipe right completes a task (with Undo)', await p.getByRole('status').filter({ hasText: 'Done' }).isVisible().catch(() => false) || !(await p.getByText('update the pile plan').isVisible()));
  await p.getByRole('status').getByRole('button', { name: 'Undo' }).click().catch(() => {}); await p.waitForTimeout(400);
  ok('Undo restores the task', await p.getByText('update the pile plan').first().isVisible());
  ok('phone: tasks has no sideways scroll', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1));

  // ---------- meeting series follow-up ----------
  await p.getByRole('button', { name: 'Create' }).click(); await p.getByRole('button', { name: /Voice memo/ }).click();
  await p.getByRole('dialog', { name: 'Voice memo' }).waitFor(); await p.waitForTimeout(300);
  await p.getByRole('dialog', { name: 'Voice memo' }).getByRole('button', { name: 'Weekly site review', exact: true }).click();
  await p.screenshot({ path: OUT + '/06-recorder-series.png' });
  await p.getByRole('button', { name: 'Start recording' }).click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Save recording' }).click();
  await p.getByText(/Follow-up from/).waitFor({ timeout: 15000 }).catch(() => {});
  ok('series memo: follow-up banner', await p.getByText(/1 of 2 open items sound done/).isVisible(), '');
  ok('series memo: title follows the series', (await p.getByLabel('Title').inputValue()).startsWith('Weekly site review ·'));
  await p.screenshot({ path: OUT + '/07-followup.png' });
  await p.getByRole('button', { name: /Tick it off/ }).click(); await p.waitForTimeout(500);
  const prevChecked = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const g = r.result.transaction('notes').objectStore('notes').get('prev'); g.onsuccess = () => res(g.result.content[0].props.checked) } }));
  ok('ticks the done item in last meeting’s note', prevChecked === true);

  // ---------- copy as message ----------
  await p.getByRole('button', { name: 'More' }).click(); await p.getByText('Copy as message…').click(); await p.waitForTimeout(400);
  const preview = await p.getByLabel('Preview').innerText();
  ok('copy as WhatsApp: bold title + checkboxes, no recording', /^\*Weekly site review/.test(preview) && /☐/.test(preview) && !/Recording/.test(preview), preview.slice(0, 80).replace(/\n/g, ' ⏎ '));
  await p.screenshot({ path: OUT + '/08-copy.png' });
  await p.getByRole('radio', { name: /Email/ }).click().catch(async () => p.getByText('Email', { exact: true }).click());
  await p.waitForTimeout(200);
  ok('copy as email: plain headings', /SUMMARY|Summary/.test(await p.getByLabel('Preview').innerText()));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---------- dictation ----------
  await p.locator('.bn-block-content[data-content-type="paragraph"]').first().click().catch(() => {});
  await p.getByRole('button', { name: 'More' }).click(); await p.getByText('Dictate into this page').click();
  await p.getByRole('dialog', { name: 'Dictation' }).waitFor(); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/09-dictate.png' });
  await p.getByRole('button', { name: 'Insert dictation' }).click(); await p.waitForTimeout(1500);
  ok('dictation inserted into the page', /Cleaned dictation text\./.test(await p.locator('.bn-editor').innerText()));
  await p.getByRole('button', { name: /Back/ }).click(); await p.waitForTimeout(500);

  // ---------- spoken journal ----------
  await p.getByRole('button', { name: 'Journal' }).last().click(); await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Speak today/ }).click(); await p.getByRole('dialog', { name: 'Voice memo' }).waitFor();
  ok('journal recorder hides style choices', !(await p.getByText('Meeting minutes').isVisible()));
  await p.getByRole('button', { name: 'Start recording' }).click(); await p.waitForTimeout(1300);
  await p.getByRole('button', { name: 'Save recording' }).click();
  await p.getByLabel('Title').waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  const jt = await p.locator('.bn-editor').innerText();
  ok('journal entry added to today’s note', /🎙/.test(jt) && /pile plan is finally done/.test(jt));
  await p.screenshot({ path: OUT + '/10-journal.png' });
  await p.getByRole('button', { name: /Back/ }).click(); await p.waitForTimeout(400);

  // ---------- quick capture links ----------
  await p.goto(URL + '/?task=' + encodeURIComponent('pay the site invoice fri')); await p.waitForTimeout(1200);
  ok('?task= adds a task and opens Tasks', await p.getByRole('status').filter({ hasText: 'pay the site invoice' }).isVisible() && await p.getByRole('heading', { name: 'Tasks' }).isVisible());
  await p.goto(URL + '/?new=' + encodeURIComponent('Captured from a shortcut')); await p.waitForTimeout(1500);
  ok('?new= opens a new note with the text', /Captured from a shortcut/.test(await p.locator('.bn-editor').innerText().catch(() => '')));
  await p.goto(URL + '/?record=memo'); await p.waitForTimeout(1200);
  ok('?record=memo opens the recorder', await p.getByRole('dialog', { name: 'Voice memo' }).isVisible());
  await p.goto(URL); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'View options' }).click(); await p.getByText('Settings').click(); await p.waitForTimeout(400);
  ok('settings lists quick-capture links', await p.getByText('Quick capture').isVisible() && await p.getByText(/\?record=memo/).isVisible());
  await p.getByText('Quick capture').scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + '/11-quick-capture.png' });

  ok('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  require('fs').writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
  await b.close();
})();
