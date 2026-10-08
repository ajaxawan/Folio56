// V6.2 presentations revamp: storyline-first AI with GPT-OSS 120B and strict JSON, waiting / switching
// to GPT-OSS 20B on Groq's free limit, diagram layouts (flowchart, process, cycle, timeline, charts,
// 2×2, agenda) in the studio, PowerPoint (native charts and shapes) and PDF, the number check, the
// presenter view, and smarter "From headings". Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const { unzipSync, strFromU8 } = require('fflate')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'folio62d-'))
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const download = async (p, click) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), click()]); const f = path.join(TMP, dl.suggestedFilename()); await dl.saveAs(f); return { name: dl.suggestedFilename(), bytes: fs.readFileSync(f) } }

const PLAN = { title: 'Rooftop solar for the Mills site', subtitle: 'What the survey found and what we do next', slides: [
  { layout: 'title', title: 'Rooftop solar for the Mills site', points: [] },
  { layout: 'agenda', title: 'Agenda', points: ['Findings', 'How orders work', 'Plan'] },
  { layout: 'process', title: 'Install takes four steps', points: ['Survey', 'Design', 'Permit', 'Install'] },
  { layout: 'flow', title: 'Out-of-stock panels are reordered, not cancelled', points: ['If stock is short, reorder'] },
  { layout: 'cycle', title: 'Maintenance runs as a yearly loop', points: ['Inspect, clean, test, report'] },
  { layout: 'timeline', title: 'The site goes live in December', points: ['Sep survey', 'Dec install'] },
  { layout: 'chart', title: 'Output peaks in June at 88 MWh', points: ['Jan 31', 'Mar 52', 'Jun 88', 'Sep 61', 'Dec 28'] },
  { layout: 'chart', title: 'Panels are over half the cost', points: ['Panels 54%', 'Inverters 18%', 'Labour 20%', 'Permits 8%'] },
  { layout: 'matrix', title: 'Start with the quick wins', points: [] },
  { layout: 'bullets', title: 'The roof suits solar', points: ['South facing'] },
  { layout: 'closing', title: 'What to remember', points: [] },
] }
const n = null
const full = (x) => ({ subtitle: n, bullets: n, left: n, right: n, stats: n, quote: n, table: n, items: n, chart: n, matrix: n, flow: n, notes: n, ...x })
const SLIDES = [
  full({ layout: 'title', title: 'Rooftop solar for the Mills site', subtitle: 'What the survey found and what we do next', notes: 'Welcome.' }),
  full({ layout: 'agenda', title: 'Agenda', items: [{ label: 'Findings', detail: n, when: n }, { label: 'How orders work', detail: n, when: n }, { label: 'Plan', detail: n, when: n }] }),
  full({ layout: 'process', title: 'Install takes four steps', items: [{ label: 'Survey', detail: 'Roof and shading', when: n }, { label: 'Design', detail: n, when: n }, { label: 'Permit', detail: 'Council sign-off', when: n }, { label: 'Install', detail: n, when: n }], notes: 'Walk through each step.' }),
  full({ layout: 'flow', title: 'Out-of-stock panels are reordered, not cancelled', flow: { nodes: [{ id: 'in', label: 'Order in', kind: 'start' }, { id: 'ok', label: 'In stock?', kind: 'decision' }, { id: 'ship', label: 'Pack and ship', kind: 'step' }, { id: 're', label: 'Reorder', kind: 'step' }, { id: 'done', label: 'Customer told', kind: 'end' }], edges: [{ from: 'in', to: 'ok', label: n }, { from: 'ok', to: 'ship', label: 'yes' }, { from: 'ok', to: 're', label: 'no' }, { from: 're', to: 'ok', label: 'arrived' }, { from: 'ship', to: 'done', label: n }] } }),
  full({ layout: 'cycle', title: 'Maintenance runs as a yearly loop', subtitle: 'Every year', items: [{ label: 'Inspect', detail: n, when: n }, { label: 'Clean', detail: n, when: n }, { label: 'Test', detail: n, when: n }, { label: 'Report', detail: n, when: n }] }),
  full({ layout: 'timeline', title: 'The site goes live in December', items: [{ when: 'Sep', label: 'Survey done', detail: n }, { when: 'Oct', label: 'Design approved', detail: n }, { when: 'Nov', label: 'Permit', detail: n }, { when: 'Dec', label: 'Install', detail: n }] }),
  full({ layout: 'chart', title: 'Output peaks in June at 88 MWh', subtitle: 'Monthly output', chart: { kind: 'column', unit: 'MWh', series: 'Output', data: [{ label: 'Jan', value: 31 }, { label: 'Mar', value: 52 }, { label: 'Jun', value: 88 }, { label: 'Sep', value: 61 }, { label: 'Dec', value: 28 }] } }),
  full({ layout: 'chart', title: 'Panels are over half the cost', chart: { kind: 'pie', unit: '%', series: 'Cost', data: [{ label: 'Panels', value: 54 }, { label: 'Inverters', value: 18 }, { label: 'Labour', value: 20 }, { label: 'Permits', value: 8 }] } }),
  full({ layout: 'matrix', title: 'Start with the quick wins', matrix: { x: 'Effort', y: 'Impact', quads: [{ title: 'Big bets', points: ['Battery'] }, { title: 'Quick wins', points: ['Cleaning'] }, { title: 'Skip', points: [] }, { title: 'Fill-ins', points: ['App'] }] } }),
  // 73% is not in the source: the number check must flag it
  full({ layout: 'bullets', title: 'The roof suits solar', bullets: ['Roof is **south facing**', 'Shading cut by 73%', '410 W panels, 96 fit'] }),
  full({ layout: 'closing', title: 'What to remember', bullets: ['Go live in December', 'Order panels now'] }),
]
const SOURCE = `Mills site survey
The roof is south facing. 410 W panels; 96 panels fit.
Output by month (MWh): Jan 31, Mar 52, Jun 88, Sep 61, Dec 28.
Cost split: panels 54%, inverters 18%, labour 20%, permits 8%.
Steps: survey, design, permit, install. Survey in Sep, design approved in Oct, permit in Nov, install in Dec.
If panels are out of stock we reorder and wait; otherwise we pack and ship.
Maintenance each year: inspect, clean, test, report.`

async function mockGroq(ctx, script = {}) {
  const calls = []
  let outlineHits = 0, slideHits = 0
  const reply = (route, obj, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }], ...extra }) })
  await ctx.route('https://api.groq.com/**', async (route) => {
    if (!route.request().url().includes('/chat/completions')) return route.fulfill({ status: 404, body: '' })
    const body = JSON.parse(route.request().postData() || '{}'); calls.push(body)
    const sys = body.messages[0].content
    const name = body.response_format?.json_schema?.name ?? (/writing slide content/.test(sys) ? 'slides' : /plans clear, persuasive/.test(sys) ? 'outline' : '')
    if (/editing one slide/.test(sys)) {
      if (/most fitting visual layout/.test(sys)) return reply(route, { slides: [full({ layout: 'process', title: 'The roof suits solar', items: [{ label: 'South facing', detail: n, when: n }, { label: 'Little shade', detail: n, when: n }, { label: '96 panels fit', detail: n, when: n }] })] })
      return reply(route, { slides: [full({ layout: 'bullets', title: 'Shorter', bullets: ['South facing'] })] })
    }
    if (name === 'outline') {
      outlineHits++
      if (script.limitFirst && outlineHits === 1) return route.fulfill({ status: 429, headers: { 'retry-after': String(script.limitFirst), 'access-control-expose-headers': 'retry-after', 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: `Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Used 7200, Requested 2400. Please try again in ${script.limitFirst}s.` } }) })
      return reply(route, PLAN)
    }
    if (name === 'slides') {
      slideHits++
      if (script.invalidFirst && slideHits === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Failed to generate JSON. Please adjust your prompt.', code: 'json_validate_failed' } }) })
      const titles = [...body.messages[1].content.matchAll(/^(\d+)\. \[(\w+)\] (.*)$/gm)].map((m) => ({ i: Number(m[1]) - 1, title: m[3] }))
      return reply(route, { slides: titles.map(({ i, title }) => ({ ...SLIDES[i], title: title || SLIDES[i].title })) })
    }
    return reply(route, { error: 'unexpected' })
  })
  return calls
}
const seed = (src) => new Promise((res) => {
  const t = (s) => [{ type: 'text', text: s, styles: {} }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); const now = Date.now()
    const put = (id, title, content) => tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 120, createdAt: now - 864e5, updatedAt: now - 864e5 })
    put('mills', 'Mills site survey', src.split('\n').map((l) => ({ type: 'paragraph', content: t(l) })))
    put('howto', 'Shipping guide', [
      { type: 'heading', props: { level: 1 }, content: t('Orders') },
      { type: 'heading', props: { level: 2 }, content: t('How an order ships') },
      ...['Order placed — website or phone', 'Stock checked', 'Packed the same day', 'Shipped with tracking'].map((x) => ({ type: 'numberedListItem', content: t(x) })),
      { type: 'heading', props: { level: 1 }, content: t('Plan') },
      { type: 'heading', props: { level: 2 }, content: t('Roll-out') },
      ...['Sep 2026: Survey done', 'Oct 2026: Design approved', 'Nov 2026: Permit', 'Dec 2026: Go live'].map((x) => ({ type: 'bulletListItem', content: t(x) })),
      { type: 'heading', props: { level: 1 }, content: t('Risks') },
      { type: 'heading', props: { level: 2 }, content: t('Watch list') },
      { type: 'bulletListItem', content: t('Supplier delays') },
    ])
    tx.objectStore('meta').put({ key: 'voice', value: { key: 'gsk_test_123', stt: 'whisper-large-v3', llm: 'openai/gpt-oss-120b', language: '', output: 'same', keepAudio: true, style: 'minutes' } })
    tx.objectStore('meta').put({ key: 'welcomed', value: 1 })
    tx.oncomplete = () => res(1)
  }
})
const dbNotes = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result) } }))
const openMaker = async (p) => { await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('make a presentation'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(800); return p.getByRole('dialog', { name: 'Make a presentation' }) }

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async (script) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('v62d')) { sessionStorage.setItem('v62d', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber', ai: true, name: 'Zain Iqbal' })); localStorage.setItem('folio.installHint', '1') } })
    const calls = await mockGroq(ctx, script)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(900); await p.evaluate(seed, SOURCE); await p.reload(); await p.waitForTimeout(1200)
    return { ctx, p, calls }
  }

  // ---------------- storyline first, then slides; Groq's limit is waited out
  {
    const { ctx, p, calls } = await mk({ limitFirst: 2 })
    const dm = await openMaker(p)
    await dm.getByLabel('Note', { exact: true }).selectOption('mills')
    await dm.getByRole('radio', { name: 'Pitch' }).click()
    await dm.getByLabel('Who is it for').fill('the client’s board')
    ok('AI asks for the storyline first', await dm.getByRole('button', { name: 'Plan the storyline' }).isVisible())
    await dm.getByRole('button', { name: 'Plan the storyline' }).click()
    await p.waitForTimeout(700)
    const waiting = await dm.innerText()
    ok('on Groq’s free limit it says it’s waiting', /Waiting \d+s for Groq’s free per-minute limit/.test(waiting), waiting.slice(-120))
    await dm.getByRole('list', { name: 'Storyline' }).waitFor({ timeout: 20000 })
    const o = calls.find((c) => c.response_format?.json_schema?.name === 'outline')
    ok('storyline: GPT-OSS 120B, strict JSON schema, medium reasoning', o && o.model === 'openai/gpt-oss-120b' && o.response_format.json_schema.strict === true && o.reasoning_effort === 'medium')
    ok('storyline prompt: action titles, the pitch arc, the audience, visual layouts', /action title/.test(o.messages[0].content) && /the problem → why it matters now/.test(o.messages[0].content) && /client’s board/.test(o.messages[0].content) && /"flow": a flowchart/.test(o.messages[0].content))
    ok('request fits Groq’s 8,000-token minute (question + answer)', calls.every((c) => (JSON.stringify(c.messages).length / 3.5) + c.max_completion_tokens < 8000))
    const items = dm.getByRole('list', { name: 'Storyline' }).getByRole('listitem')
    ok('the storyline is editable before any slide is made', (await items.count()) === 11 && (await dm.getByLabel('Slide 7 layout').inputValue()) === 'chart')
    await shot(p, 'd01-storyline')
    await dm.getByLabel('Slide 10 title').fill('The roof is right for solar')
    await dm.getByRole('button', { name: 'Design 11 slides' }).click(); await p.getByLabel('Presentation title').waitFor({ timeout: 20000 }); await p.waitForTimeout(800)
    const sl = calls.filter((c) => c.response_format?.json_schema?.name === 'slides')
    ok('slides are designed in batches that fit the free plan', sl.length === 3 && sl.every((c) => c.reasoning_effort === 'low'))
    ok('your edits to the storyline are used', sl.some((c) => /The roof is right for solar/.test(c.messages[1].content)))
    const deck = (await dbNotes(p)).find((x) => x.deck?.made === 'ai')?.deck
    ok('11 slides with every visual layout', deck && deck.slides.map((s) => s.layout).join(',') === 'title,agenda,process,flow,cycle,timeline,chart,chart,matrix,bullets,closing', deck?.slides.map((s) => s.layout).join(','))
    ok('only the figures of the source are kept (not the text)', Array.isArray(deck.figures) && deck.figures.includes('88') && !JSON.stringify(deck).includes('Maintenance each year'))
    // studio
    const thumbs = p.getByRole('list', { name: 'Slides' }).getByRole('button')
    for (const [i, name] of [[3, 'process'], [4, 'flow'], [5, 'cycle'], [6, 'timeline'], [7, 'chart'], [8, 'pie'], [9, 'matrix'], [2, 'agenda']]) {
      await thumbs.nth(i - 1).click(); await p.waitForTimeout(250)
      await shot(p, `d02-${name}`)
    }
    await thumbs.nth(3).click(); await p.waitForTimeout(300)
    const main = p.locator('div.max-w-\\[1100px\\] .dk').first()
    ok('flowchart: shapes, a decision and arrows are drawn', (await main.locator('svg.dg polyline').count()) >= 5 && (await main.locator('polygon').count()) === 1 && /In stock\?/.test(await main.innerText()))
    ok('diagrams carry a text description for screen readers', /Flowchart: Order in → In stock\?/.test(await main.locator('.sr').innerText()))
    // number check
    await thumbs.nth(9).click(); await p.waitForTimeout(300)
    const note = p.getByRole('note').filter({ hasText: 'Check these numbers' })
    ok('number check: a figure that isn’t in the source is flagged', await note.isVisible() && /73%/.test(await note.innerText()) && !/410|96/.test(await note.innerText()))
    ok('…and the header counts slides to check', await p.getByRole('button', { name: /1 to check/ }).isVisible())
    await shot(p, 'd03-check')
    await note.getByRole('button', { name: 'They’re right' }).click(); await p.waitForTimeout(500)
    ok('“They’re right” clears it and remembers', !(await note.count()) && !(await p.getByRole('button', { name: /to check/ }).count()))
    const panel = p.getByRole('complementary', { name: 'Slide content' })
    const pts = panel.getByLabel('Points · one per line')
    await pts.fill('Roof is south facing\nShading cut by 64%'); await p.waitForTimeout(500)
    ok('editing re-checks: a new unknown figure is flagged again', /64%/.test(await p.getByRole('note').filter({ hasText: 'Check these numbers' }).innerText()))
    // make it visual
    await panel.getByRole('button', { name: 'Make it visual' }).click(); await p.waitForTimeout(1200)
    ok('“Make it visual” turns a list into a diagram', (await panel.getByRole('radio', { name: 'Process' }).getAttribute('aria-checked')) === 'true')
    // editors
    await thumbs.nth(3).click(); await p.waitForTimeout(300)
    await panel.getByLabel(/Flowchart · one arrow per line/).fill('(Start) -> [Paid?]\n[Paid?] -yes-> Ship -> (Done)\n[Paid?] -no-> Send reminder'); await p.waitForTimeout(700)
    let d2 = (await dbNotes(p)).find((x) => x.deck?.made === 'ai').deck.slides[3]
    ok('flowchart text editor: (round) start/end, [square] decision, labelled branch', d2.flow.nodes.length === 5 && d2.flow.nodes.find((x) => x.label === 'Paid?').kind === 'decision' && d2.flow.nodes.find((x) => x.label === 'Done').kind === 'end' && d2.flow.edges.some((e) => e.label === 'yes'))
    await thumbs.nth(6).click(); await p.waitForTimeout(300)
    await panel.getByRole('radiogroup', { name: 'Chart type' }).getByRole('radio', { name: 'line' }).click(); await panel.getByLabel(/Data · /).fill('2022 | 12\n2023 | 19\n2024 | 27'); await p.waitForTimeout(700)
    d2 = (await dbNotes(p)).find((x) => x.deck?.made === 'ai').deck.slides[6]
    ok('chart editor: type and data', d2.chart.kind === 'line' && d2.chart.data.map((x) => x.value).join() === '12,19,27')
    await panel.getByRole('radiogroup', { name: 'Chart type' }).getByRole('radio', { name: 'column' }).click(); await panel.getByLabel(/Data · /).fill('Jan | 31\nMar | 52\nJun | 88\nSep | 61\nDec | 28'); await p.waitForTimeout(500)
    await thumbs.nth(1).click(); await panel.getByRole('radio', { name: 'Bullets' }).click(); await p.waitForTimeout(300)
    ok('switching a diagram to bullets keeps the content', /Findings/.test(await panel.getByLabel('Points · one per line').inputValue()))
    await panel.getByRole('radio', { name: 'Agenda' }).click(); await p.waitForTimeout(300)
    // accessibility on a diagram slide
    await thumbs.nth(3).click(); await p.waitForTimeout(300)
    await p.addScriptTag({ content: AXE })
    const ax = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ':' + v.nodes.length))
    ok('studio with a flowchart has no serious accessibility problems', !ax.length, ax.join(' '))

    // PowerPoint: native charts and shapes
    await p.getByRole('button', { name: 'Download' }).click()
    const pp = await download(p, () => p.getByRole('button', { name: 'PowerPoint (.pptx)' }).click())
    const z = unzipSync(new Uint8Array(pp.bytes))
    const files = Object.keys(z)
    const charts = files.filter((f) => /ppt\/charts\/chart\d+\.xml$/.test(f)).map((f) => strFromU8(z[f]))
    ok('PowerPoint: charts are real, editable charts', charts.length === 2 && charts.some((c) => /<c:barChart>/.test(c) && /<c:dPt>/.test(c)) && charts.some((c) => /<c:doughnutChart>/.test(c)))
    const slideXml = (i) => strFromU8(z[`ppt/slides/slide${i}.xml`])
    ok('PowerPoint: the flowchart is shapes and arrows (a diamond for the decision)', /prst="diamond"/.test(slideXml(4)) && (slideXml(4).match(/type="triangle"/g) ?? []).length >= 4 && /Paid\?/.test(slideXml(4)))
    ok('PowerPoint: process, cycle and timeline are shapes with their text', /Survey/.test(slideXml(3)) && /Inspect/.test(slideXml(5)) && /prst="ellipse"/.test(slideXml(6)) && /Survey done/.test(slideXml(6)))
    ok('PowerPoint: speaker notes kept', files.some((f) => /notesSlide\d+\.xml$/.test(f) && strFromU8(z[f]).includes('Walk through each step')))
    fs.writeFileSync(path.join(TMP, 'deck.pptx'), pp.bytes)
    if (SHOTS) fs.copyFileSync(path.join(TMP, 'deck.pptx'), path.join(SHOTS, 'deck.pptx'))

    // presenter view
    await thumbs.nth(2).click(); await p.waitForTimeout(200)
    await p.getByRole('button', { name: /^Present/ }).click(); await p.waitForTimeout(800)
    await p.keyboard.press('p'); await p.waitForTimeout(500)
    const pv = p.getByLabel('Presenter view')
    ok('presenter view: this slide, the next one, notes and a timer', await pv.isVisible() && /next/i.test(await pv.innerText()) && /Walk through each step/.test(await pv.innerText()) && /\d\d:\d\d/.test(await pv.innerText()))
    await shot(p, 'd04-presenter')
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300)
    ok('presenter view follows the show', /Slide 4 of 11/.test(await pv.innerText()))
    await p.keyboard.press('p'); await p.waitForTimeout(300)
    ok('P switches back to the audience view', !(await pv.count()))
    await p.keyboard.press('Escape'); await p.waitForTimeout(600)
    await ctx.close()
  }

  // ---------------- strict JSON refusal → retried; a long wait → GPT-OSS 20B steps in; skip review
  {
    const { ctx, p, calls } = await mk({ invalidFirst: true, limitFirst: 40 })
    const dm = await openMaker(p)
    await dm.getByLabel('Note', { exact: true }).selectOption('mills')
    await dm.getByRole('switch', { name: /review the storyline/ }).click()
    ok('with review off the button says Create', await dm.getByRole('button', { name: 'Create presentation' }).isVisible())
    await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(4500)
    const o = calls.filter((c) => c.response_format?.json_schema?.name === 'outline')
    ok('a 40-second wait on 120B → GPT-OSS 20B answers instead (its own allowance)', o.length === 2 && o[0].model === 'openai/gpt-oss-120b' && o[1].model === 'openai/gpt-oss-20b')
    const sl = calls.filter((c) => /writing slide content/.test(c.messages[0].content))
    ok('a schema miss is retried in plain JSON mode (and the deck still made)', sl.length === 4 && sl[1].response_format.type === 'json_object' && (await dbNotes(p)).some((x) => x.deck?.made === 'ai' && x.deck.slides.length === 11))
    await ctx.close()
  }

  // ---------------- From headings (no AI): processes, timelines and an agenda are spotted
  {
    const { ctx, p } = await mk()
    await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('folio.prefs')); v.ai = false; localStorage.setItem('folio.prefs', JSON.stringify(v)) }); await p.reload(); await p.waitForTimeout(1000)
    const dm = await openMaker(p)
    await dm.getByLabel('Note', { exact: true }).selectOption('howto')
    await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.waitForTimeout(1500)
    const deck = (await dbNotes(p)).find((x) => x.deck?.made === 'outline')?.deck
    const lay = deck?.slides.map((s) => s.layout).join(',')
    ok('From headings: numbered steps → process, dated list → timeline, 3 parts → agenda', lay === 'title,agenda,section,process,section,timeline,section,bullets', lay)
    ok('timeline items keep their dates', deck.slides.find((s) => s.layout === 'timeline').items[0].when === 'Sep 2026')
    await shot(p, 'd05-headings')
    await ctx.close()
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
