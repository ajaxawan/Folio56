// V6.1 checks: presentations (from headings without AI, with AI from a note / Markdown / PDF, the
// studio, themes, Present mode, PowerPoint + PDF + outline export), and the layout fixes (Margins
// sidebar tabs, the contents rail beside long notes). Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const { unzipSync, strFromU8 } = require('fflate')
const URL = process.env.URL || 'http://localhost:4174/app';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'folio61-'))
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const download = async (p, click) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), click()]); const f = path.join(TMP, dl.suggestedFilename()); await dl.saveAs(f); return { file: f, name: dl.suggestedFilename(), bytes: fs.readFileSync(f) } }

const AI_DECK = { title: 'Rooftop solar for Mills site', subtitle: 'Findings and next steps', slides: [
  { layout: 'title', title: 'Rooftop solar for Mills site', subtitle: 'Findings and next steps', notes: 'Welcome everyone.' },
  { layout: 'bullets', title: 'The roof works for solar', bullets: ['Roof is **south facing**', 'Little shading after 9 am', 'Structure rated for panels'], notes: 'Start with the good news.' },
  { layout: 'stat', title: 'What the site can produce', stats: [{ value: '410 W', label: 'per panel' }, { value: '96', label: 'panels fit' }], notes: 'Numbers from the survey.' },
  { layout: 'two', title: 'Options compared', left: { heading: 'String inverters', bullets: ['Lower cost', 'Simpler'] }, right: { heading: 'Microinverters', bullets: ['Better with shade', 'Panel-level data'] } },
  { layout: 'table', title: 'Timeline', table: { head: ['Step', 'When'], rows: [['Permit', 'Nov'], ['Install', 'Dec']] } },
  { layout: 'quote', title: '', quote: { text: 'Measure twice, install once.', by: 'Site lead' } },
  { layout: 'closing', title: 'Next steps', bullets: ['Send the report', 'Order panels'] },
] }
async function mockGroq(ctx) {
  const calls = []
  const reply = (route, obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) }, finish_reason: 'stop' }] }) })
  await ctx.route('https://api.groq.com/**', async (route) => {
    const u = route.request().url()
    if (u.includes('/chat/completions')) {
      const body = JSON.parse(route.request().postData() || '{}'); calls.push(body)
      const sys = body.messages?.[0]?.content || ''
      const name = body.response_format?.json_schema?.name
      if (/editing one slide/.test(sys)) return reply(route, { slides: [{ layout: 'bullets', title: 'The roof is ideal', bullets: ['South facing', 'Strong structure'] }] })
      // V6.2: first the storyline, then the slides for the planned numbers
      if (name === 'outline') return reply(route, { title: AI_DECK.title, subtitle: AI_DECK.subtitle, slides: AI_DECK.slides.map((x) => ({ layout: x.layout, title: x.title, points: x.bullets ?? [] })) })
      if (name === 'slides') {
        const nums = [...body.messages[1].content.matchAll(/^(\d+)\. \[/gm)].map((m) => Number(m[1]) - 1)
        return reply(route, { slides: nums.map((i) => AI_DECK.slides[i]) })
      }
      return reply(route, 'Here you go:\n```json\n' + JSON.stringify(AI_DECK) + '\n```')
    }
    return route.fulfill({ status: 404, body: '' })
  })
  return calls
}
const seed = () => new Promise((res) => {
  const t = (s, st = {}) => [{ type: 'text', text: s, styles: st }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); const now = Date.now()
    const put = (id, title, content, extra = {}) => tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 300, createdAt: now - 864e5, updatedAt: now - 864e5, ...extra })
    const long = []
    for (const h of ['Overview', 'Site', 'Design', 'Permits', 'Budget']) {
      long.push({ type: 'heading', props: { level: 2 }, content: t(h) })
      for (const sub of ['Context', 'Details']) { long.push({ type: 'heading', props: { level: 3 }, content: t(`${h} ${sub}`) }); for (let i = 0; i < 4; i++) long.push({ type: 'paragraph', content: t(`A long paragraph about ${h.toLowerCase()} ${sub.toLowerCase()} number ${i} with enough words to fill the line nicely. `.repeat(2)) }) }
    }
    put('survey', 'Mills site survey', [
      { type: 'paragraph', content: t('Rooftop survey for the Mills site.') },
      { type: 'heading', props: { level: 2 }, content: t('Findings') },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Roof is ', styles: {} }, { type: 'text', text: 'south facing', styles: { bold: true } }] },
      { type: 'bulletListItem', content: t('Little shading after 9 am') },
      { type: 'heading', props: { level: 2 }, content: t('Panels') },
      { type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [{ cells: [t('Panel'), t('Watts')] }, { cells: [t('A'), t('410')] }] } },
      { type: 'quote', content: t('Measure twice, install once.') },
      { type: 'heading', props: { level: 2 }, content: t('Next steps') },
      { type: 'checkListItem', props: { checked: false }, content: t('Send the report') },
    ])
    put('handbook', 'Solar handbook', long, { cover: 'g:dawn' })
    tx.objectStore('meta').put({ key: 'voice', value: { key: 'gsk_test_123', stt: 'whisper-large-v3', llm: 'openai/gpt-oss-120b', language: '', output: 'same', keepAudio: true, style: 'minutes' } })
    tx.oncomplete = () => res(1)
  }
})
const dbNotes = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result) } }))

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('v61')) { sessionStorage.setItem('v61', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber', ai: false, name: 'Zain Iqbal' })); localStorage.setItem('folio.installHint', '1') } })
  const calls = await mockGroq(ctx)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(URL); await p.waitForTimeout(800)
  await p.evaluate(seed); await p.reload(); await p.waitForTimeout(1200)
  const side = p.getByRole('complementary')

  // ---------------- contents rail: beside the page, below the cover, never over the text
  await p.locator('article[data-note="handbook"]').getByText('Solar handbook').click(); await p.waitForTimeout(1200)
  const toc = p.getByRole('navigation', { name: 'Contents' })
  ok('long note: contents rail is shown on a wide screen', await toc.isVisible())
  const geo = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Contents"]').getBoundingClientRect()
    const page = document.querySelector('.bn-editor').getBoundingClientRect()
    const cover = document.querySelector('.print-area .h-40, .print-area [class*="sm:h-56"]')?.getBoundingClientRect()
    return { navLeft: nav.left, navTop: nav.top, pageRight: page.right, coverBottom: cover?.bottom ?? 0 }
  })
  ok('the rail never overlaps the page text', geo.navLeft >= geo.pageRight + 8, JSON.stringify(geo))
  ok('the rail starts below the cover', geo.navTop >= geo.coverBottom - 1, JSON.stringify(geo))
  ok('long outlines show top-level headings plus only the current section', (await toc.getByRole('button').count()) < 15 && (await toc.getByRole('button').count()) >= 5)
  await shot(p, '01-toc-wide')
  await p.setViewportSize({ width: 1100, height: 860 }); await p.waitForTimeout(500)
  ok('narrower: the rail gives way to a Contents button', !(await toc.isVisible()) && await p.getByRole('button', { name: 'Contents' }).first().isVisible())
  await p.getByRole('button', { name: 'Contents' }).first().click(); await p.waitForTimeout(300)
  ok('…which opens the contents', await p.getByRole('dialog', { name: 'Contents' }).isVisible())
  await shot(p, '02-toc-narrow')
  await p.keyboard.press('Escape'); await p.mouse.click(5, 300); await p.waitForTimeout(200)
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(300)
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)

  // ---------------- presentation without AI: from headings
  await p.locator('article[data-note="survey"]').getByText('Mills site survey').click(); await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'More', exact: true }).click(); await p.getByRole('button', { name: 'Make a presentation…' }).click(); await p.waitForTimeout(800)
  const dm = p.getByRole('dialog', { name: 'Make a presentation' })
  ok('maker opens with the note chosen', await dm.isVisible() && (await dm.getByLabel('Note', { exact: true }).inputValue()) === 'survey')
  ok('AI off: “Write it with AI” is offered but disabled, “From headings” is chosen', await dm.getByRole('radio', { name: /Write it with AI/ }).isDisabled() && (await dm.getByRole('radio', { name: /From headings/ }).getAttribute('aria-checked')) === 'true')
  ok('eight themes to choose from, previewed', (await dm.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio').count()) === 8)
  await dm.getByRole('radio', { name: 'Boardroom' }).click()
  await p.addScriptTag({ content: AXE })
  const va = await p.evaluate(async () => (await window.axe.run(document.querySelector('[role=dialog][aria-label="Make a presentation"]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}(${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')})`))
  ok('the maker passes WCAG A/AA (axe)', va.length === 0, va.join(' '))
  await shot(p, '03-maker')
  await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(1500)
  const studio = p.getByRole('textbox', { name: 'Presentation title' })
  ok('creates a presentation and opens the studio', await studio.isVisible() && (await studio.inputValue()) === 'Mills site survey')
  const slides = p.getByRole('list', { name: 'Slides' }).getByRole('listitem')
  const n1 = await slides.count()
  ok('headings become slides (title + 3 sections, plus a table and a quote slide)', n1 >= 5, String(n1))
  const deckNote = (await dbNotes(p)).find((n) => n.deck)
  ok('the deck is saved as a note with an outline of the slides', !!deckNote && deckNote.content.some((b) => b.type === 'heading') && deckNote.deck.theme === 'boardroom' && deckNote.deck.made === 'outline')
  await shot(p, '04-studio')
  // edit
  await p.getByRole('button', { name: /^Slide 2:/ }).click()
  await p.getByRole('complementary', { name: 'Slide content' }).getByLabel('Title').fill('What we found')
  await p.waitForTimeout(700)
  ok('editing a slide updates the slide and saves', (await p.getByRole('button', { name: /^Slide 2: What we found/ }).count()) === 1 && (await dbNotes(p)).find((n) => n.deck).deck.slides[1].title === 'What we found')
  await p.getByRole('complementary', { name: 'Slide content' }).getByRole('radio', { name: 'Big numbers' }).click()
  await p.getByLabel('Number 1').fill('410 W'); await p.getByLabel('Label 1').fill('per panel'); await p.waitForTimeout(300)
  ok('switching a slide to Big numbers shows the number', (await p.locator('main .dk .stat b').first().textContent()) === '410 W')
  await p.getByRole('button', { name: 'Add slide' }).click(); await p.getByRole('button', { name: 'Two columns', exact: true }).click(); await p.waitForTimeout(300)
  ok('Add slide inserts after the current one', (await slides.count()) === n1 + 1 && (await p.getByRole('button', { name: /^Slide 3:/ }).getAttribute('aria-current')) === 'true')
  await p.getByRole('button', { name: 'Delete slide' }).click(); await p.waitForTimeout(300)
  ok('Delete slide (with undo)', (await slides.count()) === n1 && await p.getByText('Slide deleted').isVisible())
  await p.getByRole('button', { name: 'Theme' }).click(); await p.getByRole('radio', { name: 'Midnight' }).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(600)
  ok('theme can be changed any time', (await dbNotes(p)).find((n) => n.deck).deck.theme === 'midnight')
  // present
  await p.getByRole('button', { name: /Present/ }).click(); await p.waitForTimeout(700)
  const show = p.getByRole('dialog', { name: 'Presenting' })
  ok('Present opens a full-screen slideshow', await show.isVisible())
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200)
  ok('→ advances', await show.getByText(/^Slide 4 of/).count() === 1 || (await show.textContent()).includes('Slide 4 of'))
  await p.keyboard.press('n'); await p.waitForTimeout(200)
  await shot(p, '05-present')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  ok('Esc ends the show on the slide you reached', !(await show.isVisible()) && (await p.getByRole('button', { name: /^Slide 4:/ }).getAttribute('aria-current')) === 'true')
  // exports
  await p.getByRole('button', { name: 'Download' }).click()
  const pp = await download(p, () => p.getByRole('button', { name: 'PowerPoint (.pptx)' }).click())
  const z = unzipSync(new Uint8Array(pp.bytes))
  const slideFiles = Object.keys(z).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  ok('PowerPoint: a real .pptx with one slide per slide', pp.name === 'Mills site survey.pptx' && slideFiles.length === n1, `${slideFiles.length}`)
  ok('PowerPoint: slide text is there', strFromU8(z['ppt/slides/slide2.xml']).includes('What we found'))
  await p.getByRole('button', { name: 'Download' }).click()
  const md = await download(p, () => p.getByRole('button', { name: 'Outline (Markdown)' }).click())
  ok('Outline exports as Markdown', md.bytes.toString().startsWith('# Mills site survey') && md.bytes.toString().includes('What we found'))
  await p.getByRole('button', { name: 'Download' }).click(); await p.getByRole('button', { name: 'PDF (print)' }).click(); await p.waitForTimeout(1500)
  ok('PDF opens the print dialog', await p.getByText(/Save as PDF/).isVisible())
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(700)
  ok('the deck shows on its card with its title slide', await p.locator('article', { hasText: 'Presentation ·' }).locator('.dk').count() === 1)
  await shot(p, '06-card')

  // ---------------- with AI (mocked Groq): note → deck, rewrite one slide
  await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('folio.prefs')); v.ai = true; localStorage.setItem('folio.prefs', JSON.stringify(v)) }); await p.reload(); await p.waitForTimeout(1200)
  await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('make a presentation'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(800)
  ok('AI on: “Write it with AI” is the default', (await dm.getByRole('radio', { name: /Write it with AI/ }).getAttribute('aria-checked')) === 'true')
  await dm.getByLabel('Note', { exact: true }).selectOption('survey')
  await dm.getByRole('radio', { name: 'Pitch' }).click(); await dm.getByRole('radio', { name: /Short/ }).click()
  await dm.getByLabel('Anything else').fill('for the client')
  await shot(p, '07-maker-ai')
  await dm.getByRole('button', { name: 'Plan the storyline' }).click(); await p.waitForTimeout(1500)
  ok('AI: the storyline is shown for review first', (await dm.getByRole('list', { name: 'Storyline' }).getByRole('listitem').count()) === 7)
  await dm.getByRole('button', { name: 'Design 7 slides' }).click(); await p.waitForTimeout(2000)
  ok('AI: the request carries the purpose, length and your instruction', calls.length >= 1 && /persuasive pitch/.test(calls[0].messages[0].content) && /5 to 7/.test(calls[0].messages[0].content) && /for the client/.test(calls[0].messages[0].content) && /south facing/.test(calls[0].messages[1].content))
  ok('AI: storyline → slides, with strict JSON', calls.some((c) => c.response_format?.json_schema?.strict === true && c.model === 'openai/gpt-oss-120b') && (await slides.count()) === 7 && (await studio.inputValue()) === 'Rooftop solar for Mills site')
  ok('AI: varied layouts (numbers, two columns, table, quote)', await p.getByRole('button', { name: /^Slide 3: What the site can produce/ }).isVisible() && (await dbNotes(p)).find((n) => n.deck?.made === 'ai').deck.slides.map((s) => s.layout).join(',') === 'title,bullets,stat,two,table,quote,closing')
  await p.getByRole('button', { name: /^Slide 2:/ }).click()
  ok('AI: speaker notes are kept', (await p.getByLabel('Speaker notes').inputValue()) === 'Start with the good news.')
  await p.getByRole('button', { name: 'Shorter' }).click(); await p.waitForTimeout(1200)
  ok('AI: rewrite one slide', (await p.getByRole('complementary', { name: 'Slide content' }).getByLabel('Title').inputValue()) === 'The roof is ideal')
  await p.getByRole('button', { name: 'Download' }).click()
  const pp2 = await download(p, () => p.getByRole('button', { name: 'PowerPoint (.pptx)' }).click())
  const z2 = unzipSync(new Uint8Array(pp2.bytes))
  ok('PowerPoint keeps speaker notes', Object.keys(z2).some((f) => /notesSlide\d+\.xml$/.test(f) && strFromU8(z2[f]).includes('Welcome everyone')))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(600)

  // ---------------- Markdown file → deck (no AI)
  await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('folio.prefs')); v.ai = false; localStorage.setItem('folio.prefs', JSON.stringify(v)) }); await p.reload(); await p.waitForTimeout(1000)
  const mdFile = path.join(TMP, 'plan.md'); fs.writeFileSync(mdFile, '---\ntitle: Launch plan\n---\n# Launch plan\n\n## Goals\n\n- Ship in November\n- 100 users\n\n## Risks\n\n| Risk | Fix |\n|---|---|\n| Delay | Buffer |\n')
  await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('make a presentation'); await p.keyboard.press('Enter'); await p.waitForTimeout(700)
  await dm.getByRole('button', { name: /Markdown file/ }).click()
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), dm.getByRole('button', { name: /Choose a Markdown file/ }).click()]); await fc.setFiles(mdFile); await p.waitForTimeout(300)
  await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(1500)
  ok('Markdown file → slides (title from front matter, a table slide)', (await studio.inputValue()) === 'Launch plan' && (await dbNotes(p)).find((n) => n.deck?.source?.kind === 'markdown').deck.slides.some((s) => s.layout === 'table'))
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)

  // ---------------- PDF in Margins → one slide per page (no AI); sidebar tabs fit
  await side.getByRole('button', { name: /^Margins/ }).click(); await p.waitForTimeout(800)
  const pdf = path.join(__dirname, 'sample.pdf')
  await p.evaluate((b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    const dt = new DataTransfer(); dt.items.add(new File([u], 'field-notes.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, fs.readFileSync(pdf).toString('base64')); await p.waitForTimeout(2500)
  const tabs = p.getByRole('tablist', { name: 'Sidebar' }).getByRole('tab')
  const fits = await tabs.evaluateAll((els) => els.every((e) => { const s = e.querySelector('span'); return s && s.scrollWidth <= s.clientWidth + 1 && e.getBoundingClientRect().height >= 36 }))
  ok('Margins sidebar: Contents / Pages / Marks / Find each show their full label', (await tabs.count()) === 4 && fits)
  await shot(p, '08-margins-tabs')
  // ---- quotes into a note you already have
  const select = (page, needle) => p.evaluate(([page, needle]) => {
    const sp = [...document.querySelectorAll(`.pdf-page[data-page="${page}"] .textLayer span`)].find((s) => s.textContent.includes(needle)); if (!sp) return false
    const r = document.createRange(); const t = sp.firstChild; const i = t.textContent.indexOf(needle)
    r.setStart(t, i); r.setEnd(t, i + needle.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true
  }, [page, needle])
  await p.getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(1200)
  const target = p.getByRole('button', { name: /Writing in/ })
  ok('notes panel says which note it writes in', await target.isVisible() && (await target.textContent()).includes('Field Notes on Simple Living — notes'))
  await target.click(); await p.getByLabel('Find a note').fill('mills'); await p.waitForTimeout(200)
  await shot(p, '08b-note-target')
  await p.getByRole('listbox', { name: 'Notes' }).getByRole('option', { name: /Mills site survey/ }).first().click(); await p.waitForTimeout(1200)
  ok('pick an existing note: the panel switches to it', (await target.textContent()).includes('Mills site survey'))
  await p.locator('.pdf-page[data-page="3"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200)
  await select(3, 'Our life is frittered away by detail.'); await p.waitForTimeout(300)
  await p.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Quote' }).click(); await p.waitForTimeout(1500)
  const survey = (await dbNotes(p)).find((n) => n.id === 'survey')
  const sj = JSON.stringify(survey.content)
  ok('Quote goes into that note, with a line saying which PDF it came from', sj.includes('frittered away') && sj.includes('From Field Notes on Simple Living (field-notes.pdf)'))
  await target.click(); await p.getByRole('option', { name: /This PDF’s own notes/ }).click(); await p.waitForTimeout(1000)
  ok('…and back to this PDF’s own notes (no second copy made)', (await target.textContent()).includes('Field Notes on Simple Living — notes') && (await dbNotes(p)).filter((n) => n.title === 'Field Notes on Simple Living — notes').length === 1)
  await p.getByRole('button', { name: 'Notes', exact: true }).click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'More', exact: true }).first().click(); await p.getByRole('button', { name: 'Make a presentation…' }).click(); await p.waitForTimeout(800)
  ok('from Margins: the open PDF is the source, “One slide per page” without AI', (await dm.getByRole('radio', { name: /One slide per page/ }).getAttribute('aria-checked')) === 'true')
  await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(6000)
  const pdfDeck = (await dbNotes(p)).find((n) => n.deck?.made === 'pages')
  ok('PDF → a picture slide for each page, stored once as images', !!pdfDeck && pdfDeck.deck.slides.filter((s) => s.layout === 'image').length === 8 && pdfDeck.deck.slides.every((s) => s.layout !== 'image' || s.image?.startsWith('folio-img:')))
  await shot(p, '09-pdf-deck')
  await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()

  // ---------------- phone: the studio stacks
  {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
    await c2.addInitScript(() => { localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', mode: 'light', lightTheme: 'paper', ai: false })); localStorage.setItem('folio.installHint', '1') })
    const q = await c2.newPage(); q.on('pageerror', (e) => errors.push('phone: ' + e.message))
    await q.goto(URL); await q.waitForTimeout(800); await q.evaluate(seed); await q.reload(); await q.waitForTimeout(1000)
    await q.getByRole('button', { name: 'Create' }).click(); await q.waitForTimeout(400)
    await q.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /Presentation/ }).click(); await q.waitForTimeout(800)
    await q.getByRole('dialog', { name: 'Make a presentation' }).getByLabel('Note', { exact: true }).selectOption('survey')
    await q.getByRole('dialog', { name: 'Make a presentation' }).getByRole('button', { name: 'Create presentation' }).tap(); await q.waitForTimeout(1500)
    const w = await q.evaluate(() => document.documentElement.scrollWidth)
    ok('phone: studio fits the screen (no sideways scroll)', w <= 391 && await q.getByRole('list', { name: 'Slides' }).isVisible())
    await shot(q, '10-phone-studio')
    await c2.close()
  }
  ok('no page errors (phone)', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log(`\n${results.filter((r) => r.p).length}/${results.length} passed`)
  await b.close()
})()
