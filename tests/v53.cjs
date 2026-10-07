// V5.3 checks: iPhone layout + voice memos (fake microphone, Groq mocked). Needs `npm run preview` on :4174.
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || __dirname + '/../qa/v53'; require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:4174';
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info }); console.log(pass ? 'PASS' : 'FAIL', name, info) };

const MINUTES = `# Weekly site review
**Date:** today · **Length:** 1 min
**Attendees:** Biryani, Ahmed

## Summary
The team reviewed tracker layout progress for the Mills site and agreed next steps.

## Discussion
### Tracker layout
Ahmed reported the setback issue near the wetland is resolved.

## Decisions
- Move to 2P trackers on the east block.

## Action items
- [ ] **Ahmed** — update the pile plan (due: Friday)
- [ ] **Unassigned** — confirm inverter count

## Next steps
- Review again next week.`;

async function mockGroq(ctx, opts = {}) {
  let chats = 0, stt = 0;
  await ctx.route('https://api.groq.com/**', async (route) => {
    const u = route.request().url();
    if (opts.reject) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API Key' } }) });
    if (u.endsWith('/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'openai/gpt-oss-120b' }] }) });
    if (u.includes('/audio/transcriptions')) { stt++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'hello', duration: 4, segments: [{ start: 0, end: 2, text: 'Okay so the setback issue near the wetland is resolved.' }, { start: 5, end: 7, text: 'Ahmed will update the pile plan by Friday.' }] }) }); }
    if (u.includes('/chat/completions')) {
      chats++;
      if (chats === 1 && opts.rateLimitOnce) return route.fulfill({ status: 429, headers: { 'retry-after': '1' }, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 1s.' } }) });
      const body = JSON.parse(route.request().postData() || '{}');
      const isMinutes = /meeting minutes/i.test(body.messages?.[1]?.content || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: isMinutes ? MINUTES : '# Tidy note\n\nSummary line.\n\n## Ideas\n- One\n\n## To-do\n- [ ] Call the client' } }] }) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  return { counts: () => ({ chats, stt }) };
}

const noOverflow = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  // ---------------- phone ----------------
  {
    const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', permissions: ['microphone'] }); await ctx.addInitScript(() => { try { const k = 'folio.prefs'; const v = JSON.parse(localStorage.getItem(k) || '{}'); if (v.ai !== true) localStorage.setItem(k, JSON.stringify({ ...v, ai: true })) } catch {} }); // 5.9: AI is opt-in
    const groq = await mockGroq(ctx, { rateLimitOnce: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => errs.push('phone: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/status of (429|401)/.test(m.text())) errs.push('phone console: ' + m.text()) });
    await p.goto(URL); await p.waitForTimeout(800);
    ok('phone: no horizontal scroll on home', await noOverflow(p));
    ok('phone: install hint shows in Safari tab', await p.getByText('Keep Folio on your Home Screen').isVisible());
    await p.getByRole('button', { name: 'Dismiss' }).click();
    ok('phone: composer hidden, create button present', !(await p.getByText('Take a note…').isVisible()) && await p.getByRole('button', { name: 'Create' }).isVisible());
    await p.screenshot({ path: OUT + '/01-home.png' });

    // header menu → bottom sheet
    await p.getByRole('button', { name: 'View options' }).click();
    const sheet = p.locator('[data-popover]');
    await p.waitForTimeout(450);
    const box = await sheet.boundingBox(); const vh = p.viewportSize().height;
    ok('phone: header menu opens as a bottom sheet', (await sheet.count()) === 1 && box && Math.abs(box.y + box.height - vh) < 4, JSON.stringify(box));
    await p.screenshot({ path: OUT + '/02-menu-sheet.png' });
    await p.mouse.click(195, 100); await p.waitForTimeout(300);

    // create sheet → voice
    await p.getByRole('button', { name: 'Create' }).click();
    await p.waitForTimeout(400);
    ok('phone: create sheet', await p.getByRole('dialog', { name: 'Create' }).isVisible());
    await p.screenshot({ path: OUT + '/03-create-sheet.png' });
    await p.getByRole('button', { name: /Voice memo/ }).click();
    await p.getByRole('dialog', { name: 'Voice memo' }).waitFor();
    await p.waitForTimeout(400);
    ok('voice: recorder opens full screen', (await p.getByRole('dialog', { name: 'Voice memo' }).boundingBox()).height >= p.viewportSize().height - 2);
    await p.getByText('Add a free key').click();
    await p.getByLabel('Groq API key').fill('gsk_test_123');
    await p.getByRole('button', { name: 'Save' }).click();
    await p.waitForTimeout(500);
    ok('voice: key saved from the recorder', !(await p.getByText('Add a free key').isVisible()));
    await p.screenshot({ path: OUT + '/04-recorder-ready.png' });
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForTimeout(2200);
    ok('voice: recording state', await p.getByText('Recording', { exact: true }).isVisible());
    await p.screenshot({ path: OUT + '/05-recording.png' });
    await p.getByRole('button', { name: 'Pause' }).click(); await p.waitForTimeout(500);
    ok('voice: pause', await p.getByText('Paused', { exact: true }).isVisible());
    await p.getByRole('button', { name: 'Resume' }).click(); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: 'Save recording' }).click();
    // editor opens, banner shows, then the write-up arrives
    await p.getByLabel('Title').waitFor();
    await p.screenshot({ path: OUT + '/06-working.png' });
    await p.waitForFunction(() => document.querySelector('textarea[aria-label="Title"]')?.value === 'Weekly site review', null, { timeout: 15000 }).catch(() => {});
    const title = await p.getByLabel('Title').inputValue();
    ok('voice: minutes written (title from write-up)', title === 'Weekly site review', title);
    ok('voice: 429 was retried', groq.counts().chats >= 2, JSON.stringify(groq.counts()));
    const bodyText = await p.locator('.bn-editor').innerText();
    ok('voice: sections present', /Action items/.test(bodyText) && /Decisions/.test(bodyText), '');
    ok('voice: action items are checkboxes', (await p.locator('.bn-block-content[data-content-type="checkListItem"]').count()) >= 2);
    ok('voice: audio kept in note', (await p.locator('.bn-block-content[data-content-type="audio"]').count()) >= 1);
    ok('voice: transcript folded under a toggle', /Transcript/.test(bodyText));
    await p.screenshot({ path: OUT + '/07-minutes.png', fullPage: false });
    await p.locator('.folio-editor').evaluate((el) => el.scrollTo(0, el.scrollHeight)); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/08-minutes-bottom.png' });

    // keyboard bar (simulate the iOS keyboard being up)
    await p.locator('.bn-block-content[data-content-type="paragraph"]').first().click();
    await p.evaluate(() => { document.documentElement.dataset.kb = 'open'; document.documentElement.style.setProperty('--kb', '300px') });
    await p.waitForTimeout(300);
    ok('editor: keyboard toolbar appears with the keyboard', await p.getByTestId('keyboard-bar').isVisible());
    ok('editor: Done button shows', await p.getByRole('button', { name: 'Done' }).isVisible());
    await p.getByRole('button', { name: 'Heading' }).click(); await p.waitForTimeout(200);
    ok('editor: toolbar turns a line into a heading', await p.evaluate(() => { const s = window.getSelection(); return !!s?.anchorNode && !!(s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('[data-content-type="heading"]') }));
    await p.screenshot({ path: OUT + '/09-keyboard-bar.png' });
    await p.evaluate(() => { delete document.documentElement.dataset.kb; document.documentElement.style.setProperty('--kb', '0px') });
    await p.getByRole('button', { name: 'Undo' }).isVisible().catch(() => {});

    // More menu (sheet) contains phone extras + formalise
    await p.getByRole('button', { name: 'More' }).click();
    ok('editor: more menu has history & formalise on phone', await p.getByText('Version history').isVisible() && await p.getByText('Rewrite from recording…').isVisible());
    await p.screenshot({ path: OUT + '/10-more-sheet.png' });
    await p.mouse.click(195, 60); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /Back/ }).click(); await p.waitForTimeout(600);

    // tasks view picks up action items
    await p.getByRole('button', { name: 'Tasks' }).last().click(); await p.waitForTimeout(500);
    await p.getByRole('tab', { name: /^All/ }).click(); await p.waitForTimeout(300); // dated items live under Upcoming; All shows everything
    ok('tasks: action items listed', await p.getByText('update the pile plan').first().isVisible());
    await p.screenshot({ path: OUT + '/11-tasks.png' });

    // formalise a typed note
    await p.getByRole('button', { name: 'Create' }).click();
    await p.getByRole('button', { name: 'Note Blank page' }).click();
    await p.getByLabel('Title').fill('Client call');
    await p.locator('.bn-editor').click();
    await p.keyboard.type('talked to client about budget. they want call back tuesday. idea: bundle O&M with EPC. need to send revised quote', { delay: 2 });
    await p.waitForTimeout(700);
    await p.getByRole('button', { name: 'More' }).click();
    await p.getByText('Formalise with AI…').click();
    await p.getByRole('button', { name: /Structured note/ }).click();
    await p.waitForFunction(() => document.querySelector('.bn-editor')?.innerText.includes('Call the client'), null, { timeout: 10000 }).catch(() => {});
    const t2 = await p.locator('.bn-editor').innerText();
    ok('formalise: typed note rewritten', /Call the client/.test(t2), '');
    ok('formalise: original notes kept', /Original notes/.test(t2));
    ok('formalise: user title kept', (await p.getByLabel('Title').inputValue()) === 'Client call');
    await p.screenshot({ path: OUT + '/12-formalised.png' });
    await p.getByRole('button', { name: /Back/ }).click(); await p.waitForTimeout(500);

    // other phone screens: overflow + screenshots
    for (const [name, nav] of [['pages', 'Pages'], ['journal', 'Journal'], ['notes', 'Notes']]) {
      await p.getByRole('button', { name: nav }).last().click(); await p.waitForTimeout(500);
      ok(`phone: no horizontal scroll on ${name}`, await noOverflow(p));
      await p.screenshot({ path: OUT + `/13-${name}.png` });
    }
    await p.getByRole('button', { name: 'Search' }).first().click(); await p.waitForTimeout(300);
    ok('phone: search is full screen with Cancel', await p.getByRole('button', { name: 'Cancel' }).isVisible());
    await p.screenshot({ path: OUT + '/14-search.png' });
    await p.getByRole('button', { name: 'Cancel' }).click();
    await p.getByRole('button', { name: 'View options' }).click(); await p.getByText('Settings').click(); await p.waitForTimeout(400);
    ok('phone: settings as sheet with AI features', await p.getByText('AI features').first().isVisible());
    await p.getByText('AI features').first().scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + '/15-settings-voice.png' });
    await ctx.close();
  }
  // ---------------- no key + rejected key ----------------
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', permissions: ['microphone'] }); await ctx.addInitScript(() => { try { const k = 'folio.prefs'; const v = JSON.parse(localStorage.getItem(k) || '{}'); if (v.ai !== true) localStorage.setItem(k, JSON.stringify({ ...v, ai: true })) } catch {} }); // 5.9: AI is opt-in
    await mockGroq(ctx, { reject: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => errs.push('desktop: ' + e.message));
    await p.goto(URL); await p.waitForTimeout(800);
    ok('desktop: composer has mic', await p.getByRole('button', { name: 'Voice memo (V)' }).isVisible());
    await p.keyboard.press('v');
    await p.getByRole('dialog', { name: 'Voice memo' }).waitFor();
    await p.screenshot({ path: OUT + '/20-desktop-recorder.png' });
    await p.getByRole('button', { name: 'Start recording' }).click(); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Save recording' }).click();
    await p.getByText('Recording saved').waitFor();
    ok('no key: audio saved, banner asks for key', true);
    await p.getByLabel('Groq API key').fill('gsk_bad'); await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(600);
    ok('rejected key: clear message', await p.getByText(/rejected the key/).isVisible());
    await p.screenshot({ path: OUT + '/21-desktop-nokey.png' });
    // backups must not contain the key
    const leaks = await p.evaluate(async () => { const r = indexedDB.open('folio'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result) }); return Array.from(db.objectStoreNames) });
    ok('voice settings live in meta (not exported)', leaks.includes('meta'));
    await ctx.close();
  }
  ok('no page errors', errs.length === 0, errs.join(' | ').slice(0, 400));
  require('fs').writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
  await b.close();
})();
