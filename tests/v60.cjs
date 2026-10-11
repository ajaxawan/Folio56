// V6.0 checks: one name (no device name), templates (gallery, questions, multi-page, defaults, your own,
// editing, sharing, inserting), export (Word, Markdown, web page, text, PDF, copy, selection, library),
// and the review fixes (task badge, recents, card hit area). Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const { unzipSync, strFromU8 } = require('fflate')
const URL = process.env.URL || 'http://localhost:4174/app';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'folio60-'))
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const D = 86400e3
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const seed = ([yest, tomorrow, twoAgo]) => new Promise((res) => {
  const t = (s) => [{ type: 'text', text: s, styles: {} }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes'], 'readwrite'); const now = Date.now()
    const mk = (id, title, content, extra = {}) => {
      const text = (b) => (Array.isArray(b.content) ? b.content : []).map((c) => c.text ?? '').join('')
      tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none',
        preview: content.filter((b) => b.type !== 'checkListItem').map(text).join('\n').slice(0, 200), checklist: content.filter((b) => b.type === 'checkListItem').map((b) => ({ text: text(b), checked: !!b.props.checked })), words: 30,
        createdAt: now - 3 * 86400e3, updatedAt: now - 3 * 86400e3 + 1000, ...extra })
    }
    mk('site', 'Site survey', [
      { type: 'heading', props: { level: 2 }, content: t('Findings') },
      { type: 'paragraph', content: [{ type: 'text', text: 'Roof is ', styles: {} }, { type: 'text', text: 'south facing', styles: { bold: true } }, { type: 'text', text: '. See ', styles: {} }, { type: 'link', href: '#note=plan', content: t('Install plan') }] },
      { type: 'numberedListItem', content: t('Measure the roof') }, { type: 'numberedListItem', content: t('Check the inverter') },
      { type: 'checkListItem', props: { checked: false }, content: t(`Send the report 📅 ${yest}`) },
      { type: 'checkListItem', props: { checked: false }, content: t(`Order panels 📅 ${tomorrow}`) },
      { type: 'checkListItem', props: { checked: false }, content: t('Someday: drone photos') },
      { type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [{ cells: [t('Panel'), t('Watts')] }, { cells: [t('A'), t('410')] }] } },
      { type: 'quote', content: t('Measure twice') },
    ])
    mk('plan', 'Install plan', [{ type: 'paragraph', content: t('Two days on site.') }], { kind: 'note' }) // 6.2: kept on the board on purpose (a page would live under Pages)
    mk('plan-a', 'Day one', [{ type: 'paragraph', content: t('Mounting rails.') }], { parentId: 'plan' })
    mk('tiny', 'Tiny', [])
    mk('day', 'Monday, 5 October 2026', [{ type: 'paragraph', content: t('Daily stuff') }], { daily: twoAgo, updatedAt: Date.now() })
    for (let i = 0; i < 8; i++) mk('x' + i, `Old note ${i}`, [{ type: 'paragraph', content: t('Filler') }], { updatedAt: Date.now() - (10 + i) * 86400e3 })
    tx.oncomplete = () => res(1)
  }
})
const dbAll = (p, store) => p.evaluate((store) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result) } }), store)
const download = async (p, click, name) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), click()]); const f = path.join(TMP, name || dl.suggestedFilename()); await dl.saveAs(f); return { file: f, name: dl.suggestedFilename(), bytes: fs.readFileSync(f) } }

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('v60')) { sessionStorage.setItem('v60', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber', ai: false, name: 'Zain Iqbal' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(URL); await p.waitForTimeout(800)
  await p.evaluate(seed, [ymd(Date.now() - D), ymd(Date.now() + D), ymd(Date.now() - 2 * D)]); await p.reload(); await p.waitForTimeout(1200)

  // ---------------- one name, no device name
  ok('greeting uses the first name only', await p.getByText(/, Zain\.$/).count() === 1 && await p.getByText(/Zain Iqbal\./).count() === 0)
  const side = p.getByRole('complementary')
  ok('sidebar shows the person (initials + name), not a device', await side.getByText('Zain Iqbal').isVisible() && await side.getByText('ZI', { exact: true }).isVisible() && (await p.getByText(/Laptop|This device/).count()) === 0)
  ok('sidebar shows backup status instead of “offline”', await side.getByText('Not backed up yet').isVisible())
  ok('Tasks badge counts only overdue + due today (1 of 3 open)', (await side.getByRole('button', { name: /^Tasks/ }).textContent()).trim().endsWith('1'))
  const recents = await p.evaluate(() => { const h = [...document.querySelectorAll('aside div')].find((d) => d.textContent === 'Recents'); const out = []; for (let e = h?.nextElementSibling; e && e.tagName === 'BUTTON'; e = e.nextElementSibling) out.push(e.textContent); return out })
  ok('Recents: at most 6, daily notes left out', recents.length <= 6 && !recents.some((t) => t.includes('October')), recents.join(' | '))
  const tiny = p.locator('article[data-note="tiny"]')
  const tb = await tiny.boundingBox()
  ok('title-only cards are tall enough for the hover tools', tb.height >= 95, String(tb.height))
  await tiny.hover(); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.waitForTimeout(700)
  ok('clicking the middle of a short card opens it (not the colour menu)', (await p.locator('textarea[aria-label="Title"]').inputValue()) === 'Tiny')
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)
  await side.getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(500)
  const settings = p.getByRole('dialog', { name: 'Settings' })
  ok('Settings has one “Your name” field and no device name', (await settings.getByLabel('Your name').inputValue()) === 'Zain Iqbal' && (await settings.getByLabel('Device name').count()) === 0)
  ok('Settings has Templates and Export rows', await settings.getByRole('button', { name: 'Manage templates…' }).isVisible() && await settings.getByRole('button', { name: 'Export notes…' }).isVisible())
  await settings.getByRole('button', { name: 'Manage templates…' }).click(); await p.waitForTimeout(1200)

  // ---------------- gallery
  const gal = p.getByRole('dialog', { name: 'Templates' })
  const cards = gal.getByRole('list', { name: 'Templates' }).getByRole('listitem')
  ok('gallery opens with 25+ built-in templates', await gal.isVisible() && (await cards.count()) >= 25, String(await cards.count()))
  ok('gallery has categories', await gal.getByRole('navigation', { name: 'Template categories' }).getByRole('button', { name: /^Engineering/ }).isVisible())
  await shot(p, '01-gallery')
  await gal.getByRole('navigation').getByRole('button', { name: /^Engineering/ }).click()
  ok('a category filters the gallery', (await cards.count()) === 4)
  await gal.getByLabel('Search templates').fill('incident'); await p.waitForTimeout(200)
  ok('search finds templates', (await cards.count()) === 1 && await cards.first().getByRole('button', { name: 'Incident review' }).isVisible())
  await gal.getByLabel('Search templates').fill('')
  await gal.getByRole('navigation').getByRole('button', { name: /^All/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Meeting minutes', exact: true }).click(); await p.waitForTimeout(300)
  const prev = gal.getByRole('complementary', { name: 'Template preview' })
  ok('selecting shows a large live preview with its questions', await prev.isVisible() && await prev.getByLabel('Meeting title').isVisible() && await prev.getByText(/3 questions/).isVisible())
  ok('automatic values are previewed (your name, today)', (await prev.locator('.tpl-auto').count()) > 0)
  await shot(p, '02-preview')
  await prev.getByLabel('Meeting title').fill('Routing review'); await prev.getByLabel('Attendees').fill('Ahmed, Faizan')
  await prev.getByRole('button', { name: 'Create note' }).click(); await p.waitForTimeout(1200)
  const title = await p.locator('textarea[aria-label="Title"]').inputValue()
  ok('creating fills the title from the answers and today’s date', /^Routing review — /.test(title) && !title.includes('{{'), title)
  ok('answers are filled into the page', await p.locator('.bn-editor').getByText('Ahmed, Faizan').isVisible())
  ok('unanswered questions stay as grey placeholders to type over', await p.locator('.bn-editor').getByText('First topic').isVisible() && !(await p.locator('.bn-editor').textContent()).includes('{{'))
  ok('the template’s cover comes along', await p.locator('.print-area .h-40, .print-area [class*="sm:h-56"]').count() > 0)
  await shot(p, '03-from-template')
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)

  const openGallery = async () => { await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('Manage templates'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(1000) }
  // choice question + multi-page
  await openGallery()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Bug report', exact: true }).click()
  await prev.getByLabel('Bug summary').fill('Export hangs'); await prev.getByLabel('Severity').selectOption('High')
  await prev.getByRole('button', { name: 'Create note' }).click(); await p.waitForTimeout(1000)
  ok('choice questions (Severity) fill a table cell', await p.locator('.bn-editor table').getByText('High', { exact: true }).isVisible() && (await p.locator('textarea[aria-label="Title"]').inputValue()) === 'Bug: Export hangs')
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)
  await openGallery()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Project hub', exact: true }).click()
  await prev.getByLabel('Project name').fill('Rooftop')
  await prev.getByRole('button', { name: 'Create 5 pages' }).click(); await p.waitForTimeout(1500)
  const all1 = await dbAll(p, 'notes')
  const hub = all1.find((n) => n.title === 'Rooftop')
  ok('multi-page templates create the page and its 4 pages inside', !!hub && all1.filter((n) => n.parentId === hub.id).length === 4)
  ok('…with their icons', all1.filter((n) => n.parentId === hub?.id).every((n) => n.icon))

  // ---------------- save your own (with pages), then it’s in My templates
  await p.getByRole('button', { name: 'More', exact: true }).click(); await p.getByRole('button', { name: 'Save as template…' }).click(); await p.waitForTimeout(400)
  const save = p.getByRole('dialog', { name: 'Save as template' })
  ok('Save as template asks name, icon, category, pages and look', await save.getByLabel('Template name').isVisible() && await save.getByRole('radiogroup', { name: 'Template icon' }).isVisible() && await save.getByText(/Include its 4 pages inside/).isVisible())
  await save.getByLabel('Template name').fill('Client project'); await save.getByLabel('Category').selectOption('Projects')
  await shot(p, '04-save-template')
  await save.getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(500)
  const tpls = await dbAll(p, 'templates')
  const mine = tpls.find((t) => t.name === 'Client project')
  ok('your template keeps its pages inside', mine && mine.children?.length === 4 && mine.category === 'Projects')
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)

  // ---------------- edit your template in the full editor
  await openGallery()
  await gal.getByRole('navigation').getByRole('button', { name: /^My templates/ }).click()
  ok('My templates lists it', (await cards.count()) === 1)
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Client project' }).click()
  await prev.getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(1200)
  ok('editing opens the template in the editor with a template bar', await p.getByRole('region', { name: 'Editing a template' }).isVisible())
  const visibleCards = await p.locator('article[data-note]').count()
  await p.locator('.bn-editor').click(); await p.keyboard.press('Control+Home'); await p.keyboard.type('Client: {{Client}} — ')
  await p.waitForTimeout(400)
  await shot(p, '05-editing-template')
  ok('the working copy never appears among your notes', (await p.evaluate(() => [...document.querySelectorAll('article[data-note]')].length)) === visibleCards)
  await p.getByRole('region', { name: 'Editing a template' }).getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(1500)
  const t2 = (await dbAll(p, 'templates')).find((t) => t.name === 'Client project')
  ok('saving writes the changes into the template', JSON.stringify(t2.content).includes('{{Client}}'))
  ok('…and the working copy is removed', (await dbAll(p, 'notes')).every((n) => !n.templateDraft))
  ok('you land back in the gallery', await gal.isVisible())
  await gal.getByRole('navigation').getByRole('button', { name: /^My templates/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Client project' }).click()
  ok('a question you typed shows up in the Fill in step', await prev.getByLabel('Client').isVisible())
  // discard
  await prev.getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(1000)
  await p.locator('.bn-editor').click(); await p.keyboard.type('THROWAWAY')
  await p.getByRole('region', { name: 'Editing a template' }).getByRole('button', { name: 'Discard changes' }).click(); await p.waitForTimeout(1200)
  ok('discarding leaves the template as it was', !JSON.stringify((await dbAll(p, 'templates')).find((t) => t.name === 'Client project').content).includes('THROWAWAY') && (await dbAll(p, 'notes')).every((n) => !n.templateDraft))

  // customising a built-in makes your own copy; discarding straight away leaves nothing behind
  await gal.getByRole('navigation').getByRole('button', { name: /^All/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Recipe', exact: true }).click()
  await prev.getByRole('button', { name: 'Customise' }).click(); await p.waitForTimeout(1200)
  ok('Customise opens your own copy of a built-in', await p.getByRole('region', { name: 'Editing a template' }).isVisible() && (await dbAll(p, 'templates')).some((t) => t.name === 'Recipe'))
  await p.getByRole('region', { name: 'Editing a template' }).getByRole('button', { name: 'Discard changes' }).click(); await p.waitForTimeout(1200)
  ok('…and discarding it removes the unused copy', !(await dbAll(p, 'templates')).some((t) => t.name === 'Recipe'))
  // ---------------- share a template as a file, then import it
  await gal.getByRole('navigation').getByRole('button', { name: /^My templates/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Client project' }).click()
  const tf = await download(p, () => prev.getByRole('button', { name: 'Share file' }).click())
  const tjson = JSON.parse(tf.bytes.toString())
  ok('a template exports as a .folio-template.json file', tf.name.endsWith('.folio-template.json') && tjson.app === 'folio-template' && tjson.template.children.length === 4)
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), gal.getByRole('button', { name: 'Import a template…' }).click()]); await fc.setFiles(tf.file); await p.waitForTimeout(800)
  ok('importing a template file adds it to My templates', (await dbAll(p, 'templates')).filter((t) => t.name === 'Client project').length === 2)

  // ---------------- defaults: new notes + daily note
  await gal.getByRole('navigation').getByRole('button', { name: /^All/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Idea', exact: true }).click()
  await prev.getByRole('switch', { name: /Start every new note/ }).click(); await p.waitForTimeout(300)
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Morning pages', exact: true }).click()
  await prev.getByRole('switch', { name: /today’s daily note/ }).click(); await p.waitForTimeout(300)
  ok('defaults are starred in the gallery', (await gal.locator('[aria-label="Default"]').count()) === 2)
  await gal.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)
  await side.getByRole('button', { name: 'New note', exact: true }).click(); await p.waitForTimeout(1200)
  ok('New note starts from the default template', await p.locator('.bn-editor').getByText('Why it matters').isVisible())
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)
  await side.getByRole('button', { name: /^Today/ }).click(); await p.waitForTimeout(1500)
  ok('Today uses the chosen daily template (and keeps the date title)', await p.locator('.bn-editor').getByText('Grateful for').isVisible() && /\d{4}$/.test(await p.locator('textarea[aria-label="Title"]').inputValue()))

  // ---------------- "/" → Template inside a note
  await p.locator('.bn-editor').click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('/template'); await p.waitForTimeout(500)
  ok('the / menu offers Template', await p.locator('.bn-suggestion-menu').getByText('Template', { exact: true }).isVisible())
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200)
  const ins = p.getByRole('dialog', { name: 'Insert a template' })
  await ins.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Checklist', exact: true }).click()
  const before = await p.locator('.bn-block-content[data-content-type=checkListItem]').count()
  await ins.getByRole('button', { name: 'Insert into this note' }).click(); await p.waitForTimeout(800)
  ok('Insert drops the template’s content into the note', (await p.locator('.bn-block-content[data-content-type=checkListItem]').count()) === before + 3)
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)
  // reset defaults through the gallery
  await openGallery()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Idea', exact: true }).click(); await prev.getByRole('switch', { name: /Start every new note/ }).click()
  await gal.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Morning pages', exact: true }).click(); await prev.getByRole('switch', { name: /today’s daily note/ }).click(); await p.waitForTimeout(300)
  ok('defaults can be turned off again', (await gal.locator('[aria-label="Default"]').count()) === 0)
  await p.addScriptTag({ content: AXE })
  const va = await p.evaluate(async () => (await window.axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}(${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90)).join(' ; ')})`))
  ok('the gallery passes WCAG A/AA (axe)', va.length === 0, va.join(' '))
  await gal.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(300)

  // ---------------- export one note
  await p.locator('article[data-note="site"]').getByText('Site survey').click(); await p.waitForTimeout(800)
  const openExport = async () => { await p.getByRole('button', { name: 'More', exact: true }).click(); await p.getByRole('button', { name: 'Export…' }).click(); await p.waitForTimeout(500) }
  await openExport()
  const ex = p.getByRole('dialog', { name: /^Export/ })
  ok('export offers Word, PDF, Markdown, web page, text and copy', (await ex.getByRole('radio').count()) === 5 && await ex.getByText('Copy', { exact: true }).isVisible())
  await shot(p, '06-export')
  const vx = await p.evaluate(async () => (await window.axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}(${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90)).join(' ; ')})`))
  ok('the export dialog passes WCAG A/AA (axe)', vx.length === 0, vx.join(' '))
  await ex.getByRole('radio', { name: /^Word/ }).click()
  const w = await download(p, () => ex.getByRole('button', { name: 'Export .docx' }).click())
  const wz = unzipSync(new Uint8Array(w.bytes)); const xml = strFromU8(wz['word/document.xml'])
  ok('Word: a real .docx with the title, bold text, numbered list, checklist and table', w.name === 'Site survey.docx' && xml.includes('Site survey') && xml.includes('<w:b/>') && xml.includes('w:numId') && xml.includes('☐') && xml.includes('<w:tbl>'))
  ok('Word: the link to a note not included becomes plain words', xml.includes('Install plan') && !xml.includes('#note='))
  await openExport(); await ex.getByRole('radio', { name: /^Markdown/ }).click()
  const md = await download(p, () => ex.getByRole('button', { name: 'Export .md' }).click())
  const mdText = md.bytes.toString()
  ok('Markdown: headings, bold, checklist, table', mdText.startsWith('# Site survey') && mdText.includes('**south facing**') && mdText.includes('[ ] Send the report') && mdText.includes('| Panel'))
  await openExport(); await ex.getByRole('radio', { name: /^Web page/ }).click(); await ex.getByRole('switch', { name: /Dates and labels/ }).click()
  const html = await download(p, () => ex.getByRole('button', { name: 'Export .html' }).click())
  const ht = html.bytes.toString()
  ok('Web page: one self-contained styled file with dates', ht.startsWith('<!doctype html>') && ht.includes('<table') && ht.includes('class="doc-meta"') && ht.includes('<style>'))
  await openExport(); await ex.getByRole('radio', { name: /^Plain text/ }).click()
  const txt = await download(p, () => ex.getByRole('button', { name: 'Export .txt' }).click())
  ok('Plain text: readable lists and boxes', txt.bytes.toString().includes('[ ] Send the report') && txt.bytes.toString().includes('1. Measure the roof'))
  await openExport(); await ex.getByRole('radio', { name: /^PDF/ }).click(); await ex.getByRole('button', { name: 'Print…' }).click(); await p.waitForTimeout(1800)
  ok('PDF: opens the print dialog with just the document', await p.getByText(/for printing/).isVisible())
  await openExport(); await ex.getByRole('button', { name: 'Formatted' }).click(); await p.waitForTimeout(500)
  const clip = await p.evaluate(async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text(); return out })
  ok('Copy formatted puts rich text (HTML) and Markdown on the clipboard', (clip['text/html'] ?? '').includes('<table') && (clip['text/plain'] ?? '').includes('# Site survey'))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(400)

  // ---------------- export a selection (with pages inside) and everything
  const pick = async (id) => { const c = p.locator(`article[data-note="${id}"]`); await c.hover(); await c.getByRole('button', { name: /^Select/ }).click() }
  await pick('site'); await pick('plan'); await p.waitForTimeout(200)
  await p.getByRole('button', { name: 'Export', exact: true }).click(); await p.waitForTimeout(600)
  ok('selection export counts pages inside', await ex.getByText(/3 notes \(1 inside\)/).isVisible())
  await ex.getByRole('radio', { name: /^Markdown/ }).click(); await ex.getByRole('button', { name: 'Separate files (.zip)' }).click()
  const zip = await download(p, () => ex.getByRole('button', { name: 'Export .md' }).click())
  const files = Object.keys(unzipSync(new Uint8Array(zip.bytes)))
  ok('separate Markdown files keep pages in folders', files.includes('Site survey.md') && files.includes('Install plan.md') && files.includes('Install plan/Day one.md'), files.join(', '))
  const siteMd = strFromU8(unzipSync(new Uint8Array(zip.bytes))['Site survey.md'])
  ok('links between exported notes point at the exported file', siteMd.includes('](Install%20plan.md)'))
  await p.keyboard.press('Escape')
  await pick('site'); await pick('plan'); await p.waitForTimeout(200)
  await p.getByRole('button', { name: 'Export', exact: true }).click(); await p.waitForTimeout(500)
  await ex.getByRole('radio', { name: /^Word/ }).click(); await ex.getByRole('button', { name: 'One document' }).click()
  const wd = await download(p, () => ex.getByRole('button', { name: 'Export .docx' }).click())
  const wxml = strFromU8(unzipSync(new Uint8Array(wd.bytes))['word/document.xml'])
  ok('one Word document holds every note, each on a new page', wxml.includes('Site survey') && wxml.includes('Day one') && (wxml.match(/w:pageBreakBefore/g) ?? []).length >= 2)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await side.getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(400)
  await p.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Export notes…' }).click(); await p.waitForTimeout(700)
  ok('library export: “Export all notes”', await p.getByRole('dialog', { name: 'Export all notes' }).isVisible())
  await ex.getByRole('radio', { name: /^Markdown/ }).click()
  const lib = await download(p, () => ex.getByRole('button', { name: 'Export .md' }).click())
  const libFiles = Object.keys(unzipSync(new Uint8Array(lib.bytes)))
  ok('library Markdown export is a zip of every note', lib.name.endsWith('.zip') && libFiles.filter((f) => f.endsWith('.md')).length >= 15, String(libFiles.length))

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()

  // ---------------- phone: the gallery as a sheet
  {
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
    await ctx2.addInitScript(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', mode: 'light', lightTheme: 'paper', ai: false })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') })
    const q = await ctx2.newPage(); q.on('pageerror', (e) => errors.push('phone: ' + e.message))
    await q.goto(URL); await q.waitForTimeout(1200)
    await q.getByRole('button', { name: 'Create' }).click(); await q.waitForTimeout(400)
    await q.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /Template/ }).click(); await q.waitForTimeout(1500)
    const g = q.getByRole('dialog', { name: 'Templates' })
    const w2 = await q.evaluate(() => document.documentElement.scrollWidth)
    ok('phone: gallery is a full sheet with category chips, no sideways scroll', await g.isVisible() && w2 <= 391)
    await shot(q, '07-phone-gallery')
    await g.getByRole('list', { name: 'Templates' }).getByRole('button', { name: 'Weekly plan', exact: true }).tap(); await q.waitForTimeout(400)
    ok('phone: picking shows the preview with a way back', await g.getByRole('button', { name: 'Templates' }).isVisible() && await g.getByRole('button', { name: 'Create note' }).isVisible())
    await shot(q, '08-phone-preview')
    await q.addScriptTag({ content: AXE })
    const vp = await q.evaluate(async () => (await window.axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}(${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90)).join(' ; ')})`))
    ok('phone (light): the preview passes WCAG A/AA', vp.length === 0, vp.join(' '))
    await g.getByRole('button', { name: 'Create note' }).tap(); await q.waitForTimeout(1200)
    ok('phone: creates the note', /^Week \d+/.test(await q.locator('textarea[aria-label="Title"]').inputValue()))
    await ctx2.close()
  }
  ok('no page errors (phone)', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`)
  await b.close()
})()
