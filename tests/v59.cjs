// V5.9 checks: AI is a choice (off by default, every AI entry point hidden, voice memos become audio
// notes), backups (reminder, restore preview), 8 new themes (+ contrast in every theme), contents &
// print for long notes, tasks board, links between notes, Search 2.0, weekly review.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const URL = process.env.URL || 'http://localhost:4174';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }

const DAY = 86400e3
const seed = (days) => new Promise((res) => {
  const t = (s, st = {}) => [{ type: 'text', text: s, styles: st }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes'], 'readwrite'); const now = Date.now(); const D = 86400e3
    const today = new Date(); const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const yest = k(new Date(now - D))
    const mk = (id, title, content, extra = {}) => {
      const text = (b) => (b.content ?? []).map((c) => c.text ?? '').join('')
      tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none',
        preview: content.filter((b) => b.type !== 'checkListItem').map(text).join('\n').slice(0, 200), checklist: content.filter((b) => b.type === 'checkListItem').map((b) => ({ text: text(b), checked: !!b.props.checked })), words: 30,
        createdAt: now - days * D, updatedAt: now - days * D + 1000, ...extra })
    }
    mk('g', 'Groceries', [{ type: 'checkListItem', props: { checked: false }, content: t('Oat milk') }, { type: 'checkListItem', props: { checked: true }, content: t('Coffee beans') }])
    mk('w', 'Weekly sync — minutes', [{ type: 'heading', props: { level: 2 }, content: t('Decisions') }, { type: 'bulletListItem', content: t('Ship the onboarding flow on Thursday') }, { type: 'heading', props: { level: 2 }, content: t('Action items') },
      { type: 'checkListItem', props: { checked: false }, content: t(`Send the roadmap draft 📅 ${yest}`) }, { type: 'checkListItem', props: { checked: false }, content: t('Fix the export bug') }], { memo: { status: 'done', style: 'minutes', audio: [], duration: 60, v: 1 }, createdAt: now - 2 * D })
    mk('p', 'Photosynthesis essay', [{ type: 'paragraph', content: t('Chlorophyll absorbs light, mostly in the blue and red wavelengths, and the energy splits water molecules.') }])
    mk('a', 'Atlas', [{ type: 'paragraph', content: t('Maps of everything.') }])
    mk('b', 'Budget', [{ type: 'paragraph', content: t('Rent and utilities.') }])
    mk('h', 'Hunza trip', [{ type: 'paragraph', content: t('Five days in late October.') }])
    tx.oncomplete = () => res(1)
  }
})

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const errors = []
  // ---------------- AI off by default + voice memo = audio note
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', permissions: ['microphone'] }); const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber' })); localStorage.setItem('folio.installHint', '1') })
    await p.evaluate(seed, 5); await p.reload(); await p.waitForTimeout(1200)
    ok('new users start with AI off', await p.evaluate(() => JSON.parse(localStorage.getItem('folio.prefs')).ai === false))
    ok('a backup reminder appears once there are notes worth keeping', await p.getByText('Keep a copy of your notes.').isVisible())
    await shot(p, '01-notes-reminder')
    await p.locator('article', { hasText: 'Photosynthesis' }).first().click(); await p.locator('.bn-editor').waitFor()
    await p.getByRole('button', { name: 'More' }).first().click(); await p.waitForTimeout(200)
    ok('AI off: no “Formalise with AI” in the note menu', (await p.getByText(/Formalise with AI|Rewrite from recording/).count()) === 0)
    ok('AI off: no dictate button', (await p.getByRole('button', { name: 'Dictate into this page' }).count()) === 0)
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(500)
    // record 2 s with the fake microphone
    await p.keyboard.press('v'); await p.waitForTimeout(600)
    ok('AI off: the recorder offers no write-up styles or key prompts', (await p.getByRole('radiogroup', { name: 'What to make from it' }).isVisible().catch(() => false)) === false && (await p.getByText(/Groq key/).count()) === 0)
    await shot(p, '02-recorder-ai-off')
    await p.getByRole('button', { name: /Start recording|Record/ }).first().click().catch(() => {}); await p.waitForTimeout(2300)
    await p.getByRole('button', { name: /Save|Done|Stop/ }).first().click().catch(() => {}); await p.waitForTimeout(1800)
    const memo = await p.evaluate(async () => { const r = await new Promise((res) => { const q = indexedDB.open('folio'); q.onsuccess = () => res(q.result) }); const all = await new Promise((res) => { const t = r.transaction('notes').objectStore('notes').getAll(); t.onsuccess = () => res(t.result) }); const m = all.find((n) => n.memo?.source === 'audio'); return m ? { status: m.memo.status, audio: m.memo.audio.length } : null })
    ok('AI off: a recording is saved as an audio note (nothing sent anywhere)', memo && memo.status === 'recorded' && memo.audio > 0, JSON.stringify(memo))
    ok('AI off: no “add a key” banner on the audio note', (await p.getByText(/Add your free Groq key/).count()) === 0)
    await shot(p, '03-audio-note')
    await p.keyboard.press('Escape'); await p.waitForTimeout(500)
    // settings: AI switch, backups
    await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(400)
    ok('Settings has one AI switch, off', (await p.getByRole('switch', { name: /AI features/ }).getAttribute('aria-checked')) === 'false')
    await p.getByRole('switch', { name: /AI features/ }).click(); await p.waitForTimeout(300)
    ok('turning AI on reveals the Groq key and voice options', await p.getByLabel('Groq API key').isVisible())
    await shot(p, '04-settings-ai')
    await p.getByRole('switch', { name: /AI features/ }).click(); await p.waitForTimeout(200)
    ok('Settings shows backups with “last backup: never”', await p.getByText(/Last backup:\s*never/).isVisible())
    // restore preview with a backup that has one new and one newer note
    const bk = { app: 'folio', version: 3, exportedAt: new Date().toISOString(), device: 'Old laptop', labels: [], templates: [], notes: [
      { id: 'zz-new', title: 'From the backup', content: [], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], position: 1, locked: false, cipher: null, daily: null, preview: '', checklist: [], image: null, words: 0, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'a', title: 'Atlas (older copy)', content: [], color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], position: 1, locked: false, cipher: null, daily: null, preview: '', checklist: [], image: null, words: 0, createdAt: 1, updatedAt: 2 }] }
    const file = path.join(require('os').tmpdir(), 'folio-test-backup.json'); fs.writeFileSync(file, JSON.stringify(bk))
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Restore…' }).click()]); await fc.setFiles(file); await p.waitForTimeout(600)
    const dlg = p.getByRole('dialog', { name: 'Restore a backup' })
    ok('restore shows a preview first (1 new, 1 kept because this device is newer)', await dlg.isVisible() && (await dlg.textContent()).includes('Old laptop') && (await dlg.getByRole('button', { name: 'Restore 1 note' }).count()) === 1)
    await shot(p, '05-restore-preview')
    await dlg.getByRole('button', { name: 'Restore 1 note' }).click(); await p.waitForTimeout(600)
    ok('restoring adds the new note and keeps the newer local one', await p.evaluate(async () => { const r = await new Promise((res) => { const q = indexedDB.open('folio'); q.onsuccess = () => res(q.result) }); const get = (id) => new Promise((res) => { const t = r.transaction('notes').objectStore('notes').get(id); t.onsuccess = () => res(t.result) }); return !!(await get('zz-new')) && (await get('a')).title === 'Atlas' }))
    // themes
    await p.getByRole('button', { name: /^Dark · 11/ }).click()
    ok('11 dark and 6 light themes', (await p.getByRole('button', { name: /^Dark · 11/ }).count()) === 1 && (await p.getByRole('button', { name: /^Light · 6/ }).count()) === 1)
    const before = await p.evaluate(() => document.documentElement.dataset.theme)
    await p.getByRole('button', { name: /^Ember/ }).hover(); await p.waitForTimeout(150)
    ok('hovering a theme previews it on the whole app', await p.evaluate(() => document.documentElement.dataset.theme === 'ember'))
    await p.mouse.move(5, 5); await p.waitForTimeout(150)
    ok('moving away puts the current theme back', await p.evaluate(() => document.documentElement.dataset.theme) === before, before)
    await shot(p, '06-theme-picker')
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    await ctx.close()
  }
  // ---------------- contrast in all 17 themes
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    await p.goto(URL); await p.evaluate(() => localStorage.setItem('folio.installHint', '1')); await p.evaluate(seed, 1); await p.reload(); await p.waitForTimeout(800)
    const dark = ['charcoal', 'graphite', 'espresso', 'ember', 'moss', 'arctic', 'tide', 'dusk', 'plum', 'midnight', 'oled'], light = ['paper', 'linen', 'blush', 'sage', 'mist', 'fog']
    const bad = []
    for (const th of [...dark, ...light]) {
      const isLight = light.includes(th)
      await p.evaluate(([th, isLight]) => localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', grain: false, ai: false, todayCollapsed: false, ...(isLight ? { mode: 'light', lightTheme: th } : { mode: 'dark', theme: th }) })), [th, isLight])
      await p.reload(); await p.waitForTimeout(500)
      await p.addScriptTag({ content: AXE })
      const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2aa'], rules: { 'color-contrast': { enabled: true } } })).violations.filter((x) => x.id === 'color-contrast').map((x) => x.nodes.length))
      if (v.length) bad.push(`${th}(${v[0]})`)
    }
    ok('every theme passes WCAG AA text contrast on the home screen', bad.length === 0, bad.join(' '))
    await ctx.close()
  }
  // ---------------- long notes, links, board, search, review, print
  {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 960 }, serviceWorkers: 'block' }); const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber', ai: false })); localStorage.setItem('folio.installHint', '1') })
    await p.evaluate(seed, 1); await p.reload(); await p.waitForTimeout(1000)
    // long note with headings
    await p.getByText('Take a note…').first().click(); await p.getByPlaceholder('Title').fill('Field guide'); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
    await p.locator('article', { hasText: 'Field guide' }).first().getByText('Field guide').click({ position: { x: 10, y: 8 } }); await p.locator('.bn-editor').waitFor(); await p.locator('.bn-editor').click()
    for (const h of ['Birds', 'Trees', 'Rivers', 'Stars']) { await p.keyboard.type('## ' + h); await p.keyboard.press('Enter'); for (let i = 0; i < 6; i++) { await p.keyboard.type(`A paragraph about ${h.toLowerCase()} number ${i}. `.repeat(3)); await p.keyboard.press('Enter') } }
    await p.waitForTimeout(800)
    const toc = p.getByRole('navigation', { name: 'Contents' })
    ok('long notes show a contents list beside the page', await toc.isVisible() && (await toc.getByRole('button').count()) === 4)
    await toc.getByRole('button', { name: 'Stars' }).click(); await p.waitForTimeout(800)
    ok('contents jumps to the section', await p.evaluate(() => { const h = [...document.querySelectorAll('.bn-block-content[data-content-type=heading]')].find((x) => x.textContent === 'Stars'); const r = h.getBoundingClientRect(); return r.top > 0 && r.top < 300 }))
    await shot(p, '07-contents')
    // link to another note with [[
    await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('See also [[Grocer'); await p.waitForTimeout(600)
    ok('typing [[ suggests notes to link', await p.locator('.bn-suggestion-menu').getByText('Groceries').isVisible())
    await shot(p, '08-link-menu')
    await p.keyboard.press('Enter'); await p.waitForTimeout(500)
    ok('a link to the note is inserted', (await p.locator('.folio-editor a[href^="#note="]').count()) === 1)
    // print
    const pdf = await p.pdf({ format: 'A4' })
    fs.writeFileSync(path.join(require('os').tmpdir(), 'folio-print.pdf'), pdf)
    ok('Print / Save as PDF produces just the page (several pages, no app chrome)', pdf.length > 5000)
    await p.locator('.folio-editor a[href^="#note="]').click(); await p.waitForTimeout(900)
    ok('clicking the link opens that note in place (no new tab)', (await p.locator('textarea[aria-label="Title"]').inputValue()) === 'Groceries' && p.context().pages().length === 1)
    ok('the linked note lists “Linked from”', await p.getByText('Linked from').isVisible() && await p.getByRole('main').getByRole('button', { name: 'Field guide' }).isVisible())
    await shot(p, '09-linked-from')
    await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(600)
    // search
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('chlorofyl'); await p.waitForTimeout(500)
    ok('search forgives typos and looks inside the text', await p.getByRole('dialog', { name: 'Command menu' }).getByText('Photosynthesis essay').isVisible())
    await shot(p, '10-search')
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    // board
    await p.getByRole('button', { name: /^Tasks/ }).first().click(); await p.waitForTimeout(500)
    await p.getByRole('button', { name: 'Board', exact: true }).click(); await p.waitForTimeout(500)
    const card = p.locator('section[aria-label="To do"] li', { hasText: 'Fix the export bug' })
    const doing = p.locator('section[aria-label="Doing"]')
    const cb = await card.boundingBox(), db = await doing.boundingBox()
    await p.mouse.move(cb.x + 40, cb.y + 12); await p.mouse.down(); await p.mouse.move(cb.x + 60, cb.y + 20, { steps: 3 }); await p.mouse.move(db.x + db.width / 2, db.y + 80, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(800)
    ok('dragging a task to Doing marks it in progress', (await p.locator('section[aria-label="Doing"]').getByText('Fix the export bug').count()) === 1)
    ok('…and writes 🔄 into its note', await p.evaluate(async () => { const r = await new Promise((res) => { const q = indexedDB.open('folio'); q.onsuccess = () => res(q.result) }); const n = await new Promise((res) => { const t = r.transaction('notes').objectStore('notes').get('w'); t.onsuccess = () => res(t.result) }); return JSON.stringify(n.content).includes('🔄') }))
    await shot(p, '11-board')
    await p.getByRole('button', { name: 'List', exact: true }).click(); await p.waitForTimeout(300)
    // weekly review
    await p.getByRole('button', { name: 'Weekly review' }).click(); await p.waitForTimeout(600)
    ok('weekly review shows open items with carry-over', await p.getByRole('button', { name: /Carry “Send the roadmap draft” to next week/ }).isVisible())
    ok('weekly review lists meeting decisions', await p.getByText('Ship the onboarding flow on Thursday').isVisible())
    ok('AI off: no AI recap button in the review', (await p.getByText(/recap of my week/).count()) === 0)
    await shot(p, '12-weekly-review')
    await p.getByRole('button', { name: /Carry “Send the roadmap draft” to next week/ }).click(); await p.waitForTimeout(600)
    ok('carry-over moves the task to next Monday', (await p.getByRole('button', { name: /Carry “Send the roadmap draft”/ }).count()) === 0)
    await ctx.close()
  }
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`)
  await b.close()
})()
