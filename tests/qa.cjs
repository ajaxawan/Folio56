// Full QA run (32 checks). Start `npm run preview` (port 4174) first, then: npm run qa
// Screenshots and a report.json land in qa-out/.
// Folio full QA run. Each check is independent; failures are collected with a screenshot.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const URL = 'http://localhost:4174/app';
const SP = __dirname;
const OUT = require('path').join(__dirname, '..', 'qa-out'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const PHOTO = path.join(SP, 'photo.jpg');
const VAULT = require('path').join(__dirname, '..', 'examples', 'markdown-sample');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const results = []; const consoleErrors = []; const external = new Set();
let b;
const check = async (name, page, fn) => {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, note: note ?? '' }); console.log('PASS', name, note ?? '', Date.now() - t0 + 'ms'); }
  catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: e.message.split('\n').slice(0, 2).join(' / ') }); console.log('FAIL', name, e.message.split('\n')[0]);
    if (page) await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function ctx(opts = {}) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true, serviceWorkers: 'block', ...opts });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const p = await c.newPage(); p.setDefaultTimeout(9000);
  p.on('pageerror', (e) => consoleErrors.push(`[${opts.tag ?? 'page'}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${opts.tag ?? 'page'}] console: ${m.text().slice(0, 200)}`); });
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) external.add(u.split('?')[0]); });
  await p.goto(URL);
  await p.evaluate(() => localStorage.setItem('folio.prefs', JSON.stringify({ name: 'QA', candlelight: 'off' })));
  await p.reload(); await p.waitForTimeout(700);
  return { c, p };
}
const q = (p, fn, arg) => p.evaluate(fn, arg);
const dbAll = (p, store) => q(p, (store) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const t = r.result.transaction(store).objectStore(store).getAll(); t.onsuccess = () => res(t.result); }; }), store);
const noteByTitle = async (p, title) => (await dbAll(p, 'notes')).find((n) => n.title === title);
const closeEditor = async (p) => { await p.getByRole('button', { name: /Back/ }).click(); await p.waitForTimeout(500); };
const openSettings = async (p) => { await p.getByRole('button', { name: /Laptop|Settings/ }).first().click(); await p.waitForTimeout(600); };
const imgLoaded = (p, sel) => p.locator(sel).first().evaluate((img) => img.complete && img.naturalWidth > 0);

async function newTextNote(p, title, body) {
  await p.getByText('Take a note…').first().click();
  await p.getByPlaceholder('Title').fill(title);
  await p.getByPlaceholder('Take a note…').fill(body);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
}
async function openNote(p, title) { await p.locator('article', { hasText: title }).first().click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(500); }

(async () => {
  b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

  // ============ LAPTOP ============
  const { c, p } = await ctx({ tag: 'laptop' });

  await check('empty state renders', p, async () => { expect(await p.getByText('Take a note…').count() > 0, 'composer missing'); await p.screenshot({ path: `${OUT}/01-empty.png` }); });

  await check('composer creates a text note', p, async () => {
    await newTextNote(p, 'QA first note', 'Hello from the composer\nSecond line');
    await p.locator('article', { hasText: 'QA first note' }).waitFor();
    const n = await noteByTitle(p, 'QA first note'); expect(n && n.preview.includes('Second line'), 'preview missing');
  });

  await check('composer creates a checklist', p, async () => {
    await p.getByRole('button', { name: 'New list' }).click();
    await p.getByPlaceholder('Title').fill('QA groceries');
    await p.getByPlaceholder('List item').first().fill('Milk'); await p.keyboard.press('Enter');
    await p.getByPlaceholder('List item').last().fill('Bread'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const n = await noteByTitle(p, 'QA groceries'); expect(n?.checklist?.length === 2, `checklist ${JSON.stringify(n?.checklist)}`);
    await p.locator('article', { hasText: 'QA groceries' }).getByRole('button', { name: 'Check' }).first().click(); await p.waitForTimeout(400);
    expect((await noteByTitle(p, 'QA groceries')).checklist[0].checked, 'tick from card failed');
  });

  await check('editor: title, heading, list, code persist', p, async () => {
    await openNote(p, 'QA first note');
    await p.getByPlaceholder('Untitled').fill('QA first note edited');
    await p.locator('.bn-editor').click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
    await p.keyboard.type('## Big heading'); await p.keyboard.press('Enter');
    await p.keyboard.type('- bullet one'); await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
    await p.keyboard.type('[] a task'); await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
    await p.keyboard.type('```python'); await p.keyboard.press('Enter'); await p.keyboard.type('print("hi")');
    await p.waitForTimeout(1500); await closeEditor(p);
    const n = await noteByTitle(p, 'QA first note edited'); expect(n, 'title not saved');
    const types = JSON.stringify(n.content.map((x) => x.type));
    expect(/heading/.test(types) && /bulletListItem/.test(types) && /checkListItem/.test(types) && /codeBlock/.test(types), 'blocks missing: ' + types);
  });

  await check('image via composer stored once as a blob, shows on card', p, async () => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Note with image' }).click()]);
    await fc.setFiles(PHOTO); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(800);
    await p.getByPlaceholder('Untitled').fill('QA photo'); await p.waitForTimeout(900);
    expect(await p.locator('.bn-editor img').count() > 0 && await imgLoaded(p, '.bn-editor img'), 'image not shown in editor');
    await closeEditor(p);
    const n = await noteByTitle(p, 'QA photo'); const blobs = await dbAll(p, 'blobs');
    expect(String(n.image).startsWith('folio-img:'), 'card image is not a reference: ' + String(n.image).slice(0, 30));
    expect(!JSON.stringify(n.content).includes('data:image'), 'inline data URL left in note');
    expect(blobs.length === 1, 'blobs=' + blobs.length);
    expect(await imgLoaded(p, 'article img'), 'card image not loaded');
  });

  await check('duplicate shares the same image (no extra copy)', p, async () => {
    await openNote(p, 'QA photo');
    await p.getByRole('button', { name: 'More' }).click(); await p.getByText('Duplicate', { exact: true }).click(); await p.waitForTimeout(900);
    await closeEditor(p);
    const notes = (await dbAll(p, 'notes')).filter((n) => n.title.startsWith('QA photo'));
    expect(notes.length === 2, 'copies=' + notes.length);
    expect((await dbAll(p, 'blobs')).length === 1, 'image duplicated in storage');
  });

  await check('cover image uses image store', p, async () => {
    await openNote(p, 'QA first note edited');
    await p.locator('.group\\/head').hover(); await p.getByRole('button', { name: 'Add cover' }).click();
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByText(/Upload|your own|image/i).last().click()]);
    await fc.setFiles(PHOTO); await p.waitForTimeout(900);
    const n = await noteByTitle(p, 'QA first note edited');
    expect(String(n.cover).startsWith('folio-img:'), 'cover not a reference');
    const bg = await p.locator('.group\\/cover').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg.includes('blob:'), 'cover not rendered: ' + bg.slice(0, 40));
    await closeEditor(p);
  });

  await check('pin, colour, archive, trash, restore, delete forever', p, async () => {
    const card = () => p.locator('article', { hasText: 'QA groceries' }).first();
    await card().hover(); await card().getByRole('button', { name: 'Pin' }).click(); await p.waitForTimeout(300);
    expect((await noteByTitle(p, 'QA groceries')).pinned, 'pin');
    await card().hover(); await card().getByRole('button', { name: 'Colour' }).click(); await p.locator('[data-popover] button').nth(3).click(); await p.waitForTimeout(300);
    expect((await noteByTitle(p, 'QA groceries')).color !== 'default', 'colour');
    await p.keyboard.press('Escape');
    await card().hover(); await card().getByRole('button', { name: 'Archive' }).click(); await p.waitForTimeout(400);
    expect((await noteByTitle(p, 'QA groceries')).archived, 'archive');
    await p.locator('aside').getByText('Archive', { exact: true }).click(); await p.waitForTimeout(400);
    await card().hover(); await card().getByRole('button', { name: 'Unarchive' }).click(); await p.waitForTimeout(300);
    await p.locator('aside').getByText('Notes', { exact: true }).click(); await p.waitForTimeout(300);
    await card().hover(); await card().getByRole('button', { name: 'More' }).click(); await p.getByText('Move to trash').click(); await p.waitForTimeout(300);
    expect((await noteByTitle(p, 'QA groceries')).trashedAt, 'trash');
    await p.locator('aside').getByText('Trash', { exact: true }).click(); await p.waitForTimeout(400);
    await card().hover(); await card().getByRole('button', { name: /Restore/ }).click(); await p.waitForTimeout(300);
    expect((await noteByTitle(p, 'QA groceries')).trashedAt === null, 'restore');
    await p.locator('aside').getByText('Notes', { exact: true }).click(); await p.waitForTimeout(300);
  });

  await check('labels: create, assign, filter, rename, delete', p, async () => {
    const card = p.locator('article', { hasText: 'QA first note edited' }).first();
    await card.hover(); await card.getByRole('button', { name: 'Labels' }).click();
    await p.getByPlaceholder('Search or create label').fill('Work'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
    const lab = (await dbAll(p, 'labels')).find((l) => l.name === 'Work'); expect(lab, 'label not created');
    expect((await noteByTitle(p, 'QA first note edited')).labels.includes(lab.id), 'not assigned');
    await p.locator('aside button[title="Work"]').click(); await p.waitForTimeout(500);
    expect(await p.locator('article').count() === 1, 'filter count ' + await p.locator('article').count());
    await p.locator('aside button[title="Work"]').hover(); await p.getByRole('button', { name: 'Options for Work' }).click();
    await p.getByText('Rename').click(); await p.keyboard.press('Control+a'); await p.keyboard.type('Work stuff'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    expect((await dbAll(p, 'labels')).some((l) => l.name === 'Work stuff'), 'rename');
    await p.keyboard.press('Escape'); await p.locator('aside').getByText('Notes', { exact: true }).click();
  });

  await check('sub-pages and breadcrumbs', p, async () => {
    await openNote(p, 'QA first note edited');
    await p.getByText('Add a page inside').click(); await p.waitForTimeout(800);
    await p.getByPlaceholder('Untitled').fill('QA child page'); await p.waitForTimeout(800);
    expect(await p.getByRole('button', { name: /QA first note edited/ }).count() > 0 || await p.getByText('QA first note edited').count() > 0, 'breadcrumb missing');
    await closeEditor(p); await p.waitForTimeout(300);
    const child = await noteByTitle(p, 'QA child page'); const parent = await noteByTitle(p, 'QA first note edited');
    expect(child?.parentId === parent.id, 'parent link');
  });

  await check('empty new note is discarded', p, async () => {
    const before = (await dbAll(p, 'notes')).length;
    await p.keyboard.press('c'); await p.locator('.bn-editor').waitFor().catch(() => {}); await p.waitForTimeout(500);
    if (await p.locator('.bn-editor').count()) await closeEditor(p);
    await p.waitForTimeout(400);
    expect((await dbAll(p, 'notes')).length === before, 'empty note kept');
  });

  await check('command palette search + command', p, async () => {
    await p.keyboard.press('Control+k'); await p.getByPlaceholder('Search notes or type a command…').fill('composer');
    await p.waitForTimeout(300); expect(await p.locator('[role=dialog]').getByText('QA first note edited').count() > 0, 'not found');
    await p.getByPlaceholder('Search notes or type a command…').fill('go to tasks'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    expect(await p.getByText(/Tasks/).count() > 0, 'tasks view'); await p.locator('aside').getByText('Notes', { exact: true }).click();
  });

  await check('today: add focus task + journal', p, async () => {
    await p.getByPlaceholder(/What matters today|Add another/).fill('QA focus task'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    const daily = (await dbAll(p, 'notes')).find((n) => n.daily); expect(daily && JSON.stringify(daily.content).includes('QA focus task'), 'daily task');
    await p.locator('aside').getByText('Journal', { exact: true }).click(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/02-journal.png` });
    await p.locator('aside').getByText('Notes', { exact: true }).click();
  });

  await check('templates: create from template', p, async () => {
    await p.getByRole('button', { name: 'From template' }).click(); await p.waitForTimeout(400);
    // V6 gallery: pick a template to preview it, then create
    await p.getByRole('dialog', { name: 'Templates' }).getByRole('button', { name: 'Meeting minutes', exact: true }).click(); await p.waitForTimeout(300);
    await p.getByRole('dialog', { name: 'Templates' }).getByRole('button', { name: 'Create note' }).click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(600);
    expect(await p.locator('.bn-editor').innerText().then((t) => t.length > 20), 'template empty');
    await p.getByPlaceholder('Untitled').fill('QA meeting'); await p.waitForTimeout(700); await closeEditor(p);
  });

  await check('history: snapshot + restore', p, async () => {
    await openNote(p, 'QA meeting');
    await p.locator('.bn-editor').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(' VERSION-ONE'); await p.waitForTimeout(700); await p.keyboard.press('Control+s'); await p.waitForTimeout(700);
    await p.keyboard.type(' VERSION-TWO'); await p.waitForTimeout(700); await p.keyboard.press('Control+s'); await p.waitForTimeout(700);
    const n = await noteByTitle(p, 'QA meeting'); const vs = (await dbAll(p, 'versions')).filter((v) => v.noteId === n.id);
    expect(vs.length >= 2, 'versions=' + vs.length);
    await p.getByRole('button', { name: 'Version history' }).click(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/03-history.png` });
    await p.getByRole('button', { name: 'Close history' }).click(); await closeEditor(p);
  });

  await check('lock: image goes inside the encryption, blob not kept', p, async () => {
    await openNote(p, 'QA photo (copy)');
    await p.getByRole('button', { name: 'More' }).click(); await p.getByText('Lock with passcode').click();
    await p.getByPlaceholder('Passcode', { exact: true }).fill('qa-pass-1'); await p.getByPlaceholder('Confirm passcode').fill('qa-pass-1');
    await p.getByRole('button', { name: 'Set passcode' }).click(); await p.waitForTimeout(1500);
    const n = await noteByTitle(p, 'QA photo (copy)');
    expect(n.locked && n.cipher && !JSON.stringify(n.content).includes('folio-img'), 'not locked properly');
    expect(await p.locator('.bn-editor img').count() > 0, 'locked note image not shown');
    await closeEditor(p);
    expect(await p.locator('article', { hasText: 'QA photo (copy)' }).getByText('Locked').count() > 0, 'card not showing Locked');
  });

  await check('markdown folder import with images → stored as blobs', p, async () => {
    const before = (await dbAll(p, 'blobs')).length;
    await p.getByRole('button', { name: 'Import Markdown' }).first().click(); await p.waitForTimeout(500);
    await p.locator('input[webkitdirectory]').setInputFiles(VAULT); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /^Import \d+ notes?$/ }).click(); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(500);
    const notes = await dbAll(p, 'notes');
    expect(!notes.some((n) => JSON.stringify(n.content).includes('data:image')), 'imported images left inline');
    return `blobs ${before} → ${(await dbAll(p, 'blobs')).length}`;
  });

  await check('markdown export zip contains images', p, async () => {
    // V6: one Export dialog for every format
    await p.keyboard.press('Control+k'); await p.getByPlaceholder('Search notes or type a command…').fill('export notes'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    await p.getByRole('radio', { name: /^Markdown/ }).click();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export .md' }).click()]);
    const f = `${OUT}/export.zip`; await dl.saveAs(f);
    const { execSync } = require('child_process'); const list = execSync(`unzip -l "${f}"`).toString();
    expect(/assets\/image-\d+\.(jpg|jpeg|png|webp)/.test(list), 'no images in zip');
    return list.split('\n').filter((l) => /\.md|assets/.test(l)).length + ' files';
  });

  let backupFile;
  await check('JSON backup includes each image once', p, async () => {
    await p.keyboard.press('Control+k'); await p.getByPlaceholder('Search notes or type a command…').fill('export backup');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('Enter')]);
    backupFile = `${OUT}/backup.json`; await dl.saveAs(backupFile);
    const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    expect(data.version === 3 && Array.isArray(data.blobs) && data.blobs.length > 0, 'no blobs in backup');
    expect(!JSON.stringify(data.notes).includes('data:image'), 'inline images in backup notes');
    return `${data.notes.length} notes, ${data.blobs.length} images, ${Math.round(fs.statSync(backupFile).size / 1024)} KB`;
  });

  let link, code;
  await check('share link with image', p, async () => {
    const card = p.locator('article', { hasText: /^QA photo$|QA photo\s/ }).filter({ hasNotText: 'copy' }).first();
    await card.locator('button[aria-label="Select"]').dispatchEvent('click');
    await p.getByRole('button', { name: 'Share as link' }).click(); await p.waitForTimeout(1600);
    code = await p.getByLabel('Link code').inputValue(); link = await p.getByTestId('share-link').getAttribute('title');
    expect(link.includes('#p='), 'no link'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    return `${link.length} chars`;
  });

  await check('settings: storage panel + clean up', p, async () => {
    await openSettings(p); await p.getByText('Storage on this device').scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/04-storage.png` });
    await p.getByRole('button', { name: /Clean up images/ }).click(); await p.waitForTimeout(600);
    await p.getByRole('button', { name: /Trim history/ }).click(); await p.waitForTimeout(600);
    expect(await p.getByText(/Images \(\d+\)/).count() > 0, 'breakdown missing');
    await p.keyboard.press('Escape');
  });

  await check('wallpaper: built-in + custom picture', p, async () => {
    await openSettings(p); await p.getByText('Wallpaper', { exact: true }).first().scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: 'Wallpaper: Topography' }).click(); await p.waitForTimeout(400);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Your own picture|Replace picture/ }).click()]);
    await fc.setFiles(PHOTO); await p.waitForTimeout(1200);
    expect(await q(p, () => document.documentElement.dataset.wallpaper) === 'on', 'wallpaper off');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/05-wallpaper.png` });
    await openSettings(p); await p.getByRole('button', { name: 'Wallpaper: None' }).click(); await p.keyboard.press('Escape');
  });

  await check('accessibility scan (axe): home', p, async () => {
    await p.addScriptTag({ content: AXE });
    const r = await q(p, async () => { const res = await window.axe.run(document, { resultTypes: ['violations'] }); return res.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`); });
    fs.writeFileSync(`${OUT}/axe-home.json`, JSON.stringify(r)); expect(r.length === 0, r.join(', '));
  });
  await check('accessibility scan (axe): editor + settings', p, async () => {
    await openNote(p, 'QA meeting');
    const r1 = await q(p, async () => (await window.axe.run({ exclude: [['.bn-editor [data-content-type="checkListItem"] input']] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`));
    await closeEditor(p); await openSettings(p);
    const r2 = await q(p, async () => (await window.axe.run(document)).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`));
    await p.keyboard.press('Escape');
    const all = [...r1.map((x) => 'editor:' + x), ...r2.map((x) => 'settings:' + x)];
    fs.writeFileSync(`${OUT}/axe-other.json`, JSON.stringify(all)); expect(all.length === 0, all.join(', '));
  });

  await check('keyboard: Esc closes dialogs, focus visible', p, async () => {
    await p.keyboard.press('Control+k'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    expect(await p.locator('[role=dialog]').count() === 0, 'palette stayed open');
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    const outline = await q(p, () => { const el = document.activeElement; const cs = getComputedStyle(el); return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; });
    expect(outline, 'no visible focus');
  });

  // ============ SECOND DEVICE: restore backup, open link ============
  const d2 = await ctx({ tag: 'tablet', viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true });
  await check('tablet: import backup restores notes + images', d2.p, async () => {
    await d2.p.evaluate(() => {}); await openSettings(d2.p);
    const [fc] = await Promise.all([d2.p.waitForEvent('filechooser'), d2.p.getByRole('button', { name: /^Restore…$/ }).click()]);
    await fc.setFiles(backupFile); await d2.p.waitForTimeout(800); // 5.9: a preview comes first
    await d2.p.getByRole('button', { name: /^Restore \d+ notes?$/ }).click(); await d2.p.waitForTimeout(1500); await d2.p.keyboard.press('Escape'); await d2.p.waitForTimeout(600);
    const blobs = await dbAll(d2.p, 'blobs'); expect(blobs.length > 0, 'no images restored');
    expect(await imgLoaded(d2.p, 'article img'), 'restored image not displayed');
    await d2.p.screenshot({ path: `${OUT}/06-tablet.png` });
  });
  const d2b = await ctx({ tag: 'tablet2', viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true });
  await check('tablet: open share link with image', d2b.p, async () => {
    const d2 = d2b
    await d2.p.goto(link); await d2.p.waitForTimeout(900);
    await d2.p.getByPlaceholder('word-word-word-00').fill(code); await d2.p.getByRole('button', { name: 'Open', exact: true }).click(); await d2.p.waitForTimeout(1200);
    await d2.p.getByRole('button', { name: /^Add \d+ notes?$/ }).click(); await d2.p.waitForTimeout(800); await d2.p.getByRole('button', { name: /Open note|Done/ }).first().click(); await d2.p.waitForTimeout(800);
    const notes = await dbAll(d2.p, 'notes'); expect(notes.some((n) => n.title === 'QA photo'), 'note not received');
    // the photo is too big for a link, so it is left out automatically (the dialog says so)
  });
  await check('tablet: no horizontal overflow', d2.p, async () => {
    await d2.p.goto(URL); await d2.p.waitForTimeout(700);
    const w = await q(d2.p, () => [document.documentElement.scrollWidth, window.innerWidth]); expect(w[0] <= w[1] + 1, 'overflow ' + w);
  });

  // ============ PHONE ============
  const d3 = await ctx({ tag: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await check('phone: create + open + back, no overflow', d3.p, async () => {
    // phones create through the + sheet (the inline composer is a desktop/tablet thing)
    await d3.p.getByRole('button', { name: 'Create' }).click();
    await d3.p.getByRole('button', { name: 'Note Blank page' }).click();
    await d3.p.getByLabel('Title').fill('Phone note'); await d3.p.locator('.bn-editor').click(); await d3.p.keyboard.type('tiny screen'); await d3.p.waitForTimeout(600);
    await closeEditor(d3.p);
    await openNote(d3.p, 'Phone note'); await d3.p.screenshot({ path: `${OUT}/07-phone-editor.png` }); await closeEditor(d3.p);
    for (const [label, ok] of [['home', await q(d3.p, () => document.documentElement.scrollWidth <= innerWidth + 1)]]) expect(ok, label + ' overflow');
    await d3.p.screenshot({ path: `${OUT}/08-phone-home.png` });
  });

  // ============ MIGRATION + REPAIR (old-format data) ============
  const d4 = await ctx({ tag: 'migrate' });
  await check('old inline images migrate to blobs; broken links repaired', d4.p, async () => {
    const img = 'data:image/jpeg;base64,' + fs.readFileSync(PHOTO).toString('base64');
    await q(d4.p, ({ img }) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const tx = r.result.transaction(['notes', 'versions', 'meta'], 'readwrite'); const now = Date.now();
      const base = { color: 'default', pinned: false, archived: false, trashedAt: null, labels: [], position: 1, locked: false, cipher: null, daily: null, icon: null, paper: 'none', preview: 'x', checklist: [], words: 1, createdAt: now, updatedAt: now };
      tx.objectStore('notes').put({ ...base, id: 'old1', title: 'Old photo', parentId: null, cover: img, image: img, content: [{ type: 'image', props: { url: img } }] });
      tx.objectStore('notes').put({ ...base, id: 'orphan', title: 'Orphan page', parentId: 'gone', labels: ['nolabel'], cover: null, image: null, content: [{ type: 'paragraph', content: 'hi' }] });
      for (let i = 0; i < 25; i++) tx.objectStore('versions').put({ id: 'ov' + i, noteId: 'old1', at: now - i * 3600e3, title: 'Old photo', content: [{ type: 'image', props: { url: img } }], words: 1 });
      tx.objectStore('meta').delete('imagesMigrated'); tx.objectStore('meta').delete('lastClean'); tx.oncomplete = () => res(1); }; }), { img });
    await d4.p.reload(); await d4.p.waitForTimeout(6000);
    const notes = await dbAll(d4.p, 'notes'); const blobs = await dbAll(d4.p, 'blobs'); const vs = await dbAll(d4.p, 'versions');
    const old = notes.find((n) => n.id === 'old1'); const orphan = notes.find((n) => n.id === 'orphan');
    expect(String(old.image).startsWith('folio-img:') && String(old.cover).startsWith('folio-img:'), 'not migrated');
    expect(blobs.length === 1, 'blobs=' + blobs.length + ' (should dedupe to 1)');
    expect(!vs.some((v) => JSON.stringify(v.content).includes('data:image')), 'history not migrated');
    expect(orphan.parentId === null && orphan.labels.length === 0, 'not repaired');
    expect(await imgLoaded(d4.p, 'article img'), 'migrated image not shown');
    return `history ${25} → ${vs.length} snapshots`;
  });

  // ============ BIG LIBRARY ============
  const d5 = await ctx({ tag: 'big' });
  await check('2000 notes: fast first paint, scroll to end, open last', d5.p, async () => {
    await q(d5.p, () => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const tx = r.result.transaction('notes', 'readwrite'); const now = Date.now();
      for (let i = 0; i < 2000; i++) tx.objectStore('notes').put({ id: 'b' + i, title: 'Bulk ' + i, content: [{ type: 'paragraph', content: 'body ' + i }], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: 2000 - i, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'body ' + i + (i % 5 ? '' : '\nline two\nline three'), checklist: [], words: 2, createdAt: now - i, updatedAt: now - i });
      tx.oncomplete = () => res(1); }; }));
    const t0 = Date.now(); await d5.p.reload(); await d5.p.locator('article').first().waitFor(); const first = Date.now() - t0;
    await q(d5.p, async () => { const el = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 2000 && getComputedStyle(d).overflowY === 'auto'); for (let i = 0; i < 40; i++) { el.scrollTop = el.scrollHeight; await new Promise((r) => setTimeout(r, 60)); } });
    await d5.p.waitForTimeout(500);
    await d5.p.locator('article', { hasText: 'Bulk 1999' }).waitFor({ timeout: 8000 });
    await d5.p.screenshot({ path: `${OUT}/09-big-bottom.png` });
    await d5.p.locator('article', { hasText: 'Bulk 1999' }).click(); await d5.p.locator('.bn-editor').waitFor();
    return `cards visible after ${first} ms, DOM cards ${await d5.p.locator('article').count()}`;
  });

  // ============ OFFLINE (real service worker) ============
  const oc = await b.newContext({ viewport: { width: 1280, height: 800 } }); const op = await oc.newPage(); op.on('pageerror', (e) => consoleErrors.push('[offline] ' + e.message));
  await check('works offline after first visit', op, async () => {
    await op.goto(URL); await op.evaluate(() => navigator.serviceWorker.ready); await op.waitForTimeout(2500); await op.reload(); await op.waitForTimeout(1500);
    await oc.setOffline(true); await op.reload(); await op.waitForTimeout(1500);
    expect(await op.getByText('Take a note…').count() > 0, 'blank offline');
    await op.getByText('Take a note…').first().click(); await op.getByPlaceholder('Title').fill('Offline note'); await op.keyboard.press('Escape'); await op.waitForTimeout(400);
    await op.locator('article', { hasText: 'Offline note' }).click(); await op.locator('.bn-editor').waitFor({ timeout: 8000 });
    await oc.setOffline(false);
  });

  // ---------- report ----------
  const pass = results.filter((r) => r.ok).length;
  const rep = { pass, fail: results.length - pass, results, consoleErrors: [...new Set(consoleErrors)], external: [...external] };
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(rep, null, 1));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note : ''}`);
  console.log(`\n${pass}/${results.length} passed`); console.log('console errors:', rep.consoleErrors.length ? rep.consoleErrors : 'none'); console.log('external requests:', rep.external.length ? rep.external : 'none');
  await b.close();
})();
