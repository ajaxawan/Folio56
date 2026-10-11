// V6.2 RAV (Reason · Attack · Validate), the free model pool (GPT-OSS 120B, Qwen 3.8 27B, GPT-OSS 20B),
// scanned PDFs read by Qwen's vision, and readable dropdown lists. Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }

const IDEA = 'Folio Watch could charge a one-time price of $19 instead of a subscription. Three friends said they would pay once but never monthly. Screen sharing costs us almost nothing because it is peer to peer. Most people only need it a few times a month.'
const PAGE = 'Pricing notes: competitors charge $8 a month. Our relay server costs $5 a month in total.'
const RAV = {
  claim: 'A one-time $19 price will sell better than a subscription for Folio Watch.',
  summary: 'The note proposes a one-time price. It rests on low running costs and what three friends said.',
  logic: ['Running costs are near zero', 'People dislike subscriptions for rare use', 'So a one-time price covers costs and sells'],
  assumptions: [
    { id: 'A1', text: 'Running costs are near zero', status: 'supported', quote: 'Screen sharing costs us almost nothing because it is peer to peer.', why: 'The note says so.' },
    { id: 'A2', text: 'Enough people will pay $19', status: 'supported', quote: 'Hundreds of users signed up for the beta', why: 'Claimed demand.' },
    { id: 'A3', text: 'Usage is occasional', status: 'unsupported', quote: null, why: 'No data on usage.' },
  ],
  attacks: [
    { id: 'X1', point: 'Three friends are not a market', severity: 'high', why: 'Friends are polite and not representative' },
    { id: 'X2', point: 'One-time pricing caps revenue while the relay keeps costing money', severity: 'medium', why: 'Costs recur, income doesn’t' },
  ],
  tests: [
    { assumption: 'A2', test: 'Put a $19 pre-order button on the landing page for 50 visitors', pass: 'at least 3 pre-orders', kill: 'no pre-orders', days: 10 },
    { assumption: 'A3', test: 'Ask 10 users how often they share screens', pass: '7 of 10 say a few times a month', kill: 'most say daily', days: 7 },
  ],
  verdict: 'needs work', next: 'Run the pre-order test before building payments.',
}
const DECK_PLAN = { title: 'Scanned survey', subtitle: 'From a scan', slides: [{ layout: 'title', title: 'Scanned survey', points: [] }, { layout: 'stat', title: '96 panels fit', points: ['96 panels', '410 W'] }] }
const n = null
const DECK_SLIDES = [
  { layout: 'title', title: 'Scanned survey', subtitle: 'From a scan', bullets: n, left: n, right: n, stats: n, quote: n, table: n, items: n, chart: n, matrix: n, flow: n, notes: n },
  { layout: 'stat', title: '96 panels fit', subtitle: n, bullets: n, left: n, right: n, stats: [{ value: '96', label: 'panels' }, { value: '410 W', label: 'each' }], quote: n, table: n, items: n, chart: n, matrix: n, flow: n, notes: n },
]

async function mockGroq(ctx, opts = {}) {
  const calls = []
  const reply = (route, content) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: 'stop' }] }) })
  await ctx.route('https://api.groq.com/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }, { id: 'qwen/qwen3.8-27b' }, { id: 'whisper-large-v3' }] }) })
    const body = JSON.parse(route.request().postData() || '{}'); calls.push(body)
    const name = body.response_format?.json_schema?.name
    if (Array.isArray(body.messages[0].content)) return reply(route, '## Site survey (scanned)\nRoof faces south.\n96 panels fit, 410 W each.\nOutput peaks in June: 88 MWh.')
    if (name === 'rav') {
      if (opts.retired && body.model !== 'openai/gpt-oss-120b') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: `The model \`${body.model}\` has been decommissioned`, code: 'model_decommissioned' } }) })
      return reply(route, RAV)
    }
    if (name === 'outline') return reply(route, DECK_PLAN)
    if (name === 'slides') { const nums = [...body.messages[1].content.matchAll(/^(\d+)\. \[/gm)].map((m) => Number(m[1]) - 1); return reply(route, { slides: nums.map((i) => DECK_SLIDES[i]) }) }
    return reply(route, 'ok')
  })
  return calls
}
const seed = ({ idea, page, llm = 'openai/gpt-oss-120b', memo = false }) => new Promise((res) => {
  const t = (s) => [{ type: 'text', text: s, styles: {} }]
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const tx = r.result.transaction(['notes', 'meta'], 'readwrite'); const now = Date.now()
    const put = (id, title, content, extra = {}) => tx.objectStore('notes').put({ id, title, content, color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 60, createdAt: now - 864e5, updatedAt: now - 864e5, ...extra })
    put('idea', 'Folio Watch pricing', [{ type: 'paragraph', content: t(idea) }])
    put('page', 'Pricing notes', [{ type: 'paragraph', content: t(page) }], { parentId: 'idea' })
    if (memo) put('memo', 'Chat about value', [{ type: 'heading', props: { level: 1 }, content: t('Summary') }, { type: 'paragraph', content: t('Keep your own methodology in markdown files per project, and let AI judge it over a few months.') }], { memo: { status: 'done', style: 'minutes', audio: [], duration: 120 } })
    tx.objectStore('meta').put({ key: 'voice', value: { key: 'gsk_test_123', stt: 'whisper-large-v3', llm, language: '', output: 'same', keepAudio: true, style: 'minutes' } })
    tx.objectStore('meta').put({ key: 'welcomed', value: 1 })
    tx.oncomplete = () => res(1)
  }
})
const dbNotes = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result) } }))

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const mk = async ({ ai = true, opts = {}, seedOpts = {}, prefs = {} } = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    await ctx.addInitScript((pr) => { if (!sessionStorage.getItem('rav')) { sessionStorage.setItem('rav', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', accent: 'amber', name: 'Zain Iqbal', ...pr })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') } }, { ai, ...prefs })
    const calls = await mockGroq(ctx, opts)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(APP); await p.waitForTimeout(800); await p.evaluate(seed, { idea: IDEA, page: PAGE, ...seedOpts }); await p.reload(); await p.waitForTimeout(1200)
    return { ctx, p, calls }
  }
  const openNote = async (p, title) => { const card = p.locator('article', { hasText: title }).first(); if (await card.count()) await card.click(); else await p.getByRole('region', { name: 'Recent pages' }).getByRole('button', { name: new RegExp(title) }).click(); await p.locator('.bn-editor').waitFor(); await p.waitForTimeout(500) }
  const more = async (p) => { await p.getByRole('button', { name: /^More/ }).first().click(); await p.waitForTimeout(250) }

  // ---------------- dropdown lists follow the theme
  {
    const { ctx, p } = await mk()
    const st = await p.evaluate(() => { const s = document.createElement('select'); const o0 = document.createElement('option'); const o = document.createElement('option'); o.textContent = 'x'; s.append(o0, o); document.body.append(s); const cs = getComputedStyle(o); const pop = getComputedStyle(document.documentElement).getPropertyValue('--color-pop').trim(); const r = { bg: cs.backgroundColor, fg: cs.color, scheme: getComputedStyle(document.documentElement).colorScheme, pop }; s.remove(); return r })
    const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('')
    ok('dark theme: dropdown options are dark with light text (readable)', hex(st.bg) === st.pop.toLowerCase() && st.scheme === 'dark' && st.fg !== st.bg, JSON.stringify(st))
    await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('folio.prefs')); v.mode = 'light'; localStorage.setItem('folio.prefs', JSON.stringify(v)) }); await p.reload(); await p.waitForTimeout(900)
    const lt = await p.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: (() => { const s = document.createElement('select'); const o = document.createElement('option'); s.append(document.createElement('option'), o); document.body.append(s); const c = getComputedStyle(o).backgroundColor; s.remove(); return c })() }))
    ok('light theme: dropdown lists are light', lt.scheme === 'light' && !/rgb\(\s*[0-6]\d,/.test(lt.bg), JSON.stringify(lt))
    await ctx.close()
  }

  // ---------------- the free models, in Settings
  {
    const { ctx, p } = await mk()
    await p.getByRole('complementary').getByRole('button', { name: /^Settings/ }).click(); await p.waitForTimeout(500)
    const dlg = p.getByRole('dialog', { name: 'Settings' })
    const sel = dlg.getByLabel('Main model')
    const opts = await sel.locator('option').allInnerTexts()
    ok('Settings: the three free Groq models, with what each is good at', opts.some((o) => /GPT-OSS 120B — best writing/.test(o)) && opts.some((o) => /Qwen 3\.8 27B — .*reads pictures.*preview/.test(o)) && opts.some((o) => /GPT-OSS 20B — fastest/.test(o)), opts.join(' | '))
    ok('Settings: “let the other free models help” is on by default', (await dlg.getByRole('switch', { name: /other free models help/ }).getAttribute('aria-checked')) === 'true')
    await sel.selectOption('qwen/qwen3.8-27b'); await p.waitForTimeout(200)
    ok('choosing a preview model explains what happens if it’s retired', /retired by Groq at short notice/.test(await dlg.innerText()))
    await dlg.getByRole('button', { name: /^(Test|Save)$/ }).click(); await p.waitForTimeout(600)
    ok('testing the key lists the free models it can use', /Models: GPT-OSS 120B, Qwen 3\.8 27B, GPT-OSS 20B/.test(await dlg.innerText()))
    await shot(p, 'r01-settings-models')
    await ctx.close()
  }

  // ---------------- RAV on a note
  {
    const { ctx, p, calls } = await mk()
    const before = (await dbNotes(p)).find((x) => x.id === 'idea')
    await openNote(p, 'Folio Watch pricing')
    await more(p)
    ok('note menu: “Reason · Attack · Validate…” (AI on)', await p.getByRole('button', { name: /Reason · Attack · Validate…/ }).isVisible())
    await p.getByRole('button', { name: /Reason · Attack · Validate…/ }).click(); await p.waitForTimeout(400)
    const dlg = p.getByRole('dialog', { name: 'Reason · Attack · Validate' })
    ok('the dialog explains the three passes and what is sent', /Reason/.test(await dlg.innerText()) && /Attack/.test(await dlg.innerText()) && /Validate/.test(await dlg.innerText()) && /this note and its pages, nothing else/.test(await dlg.innerText()))
    ok('a note with pages offers to include them (its library)', await dlg.getByRole('switch', { name: /Include its 1 page/ }).isVisible())
    await shot(p, 'r02-dialog')
    await p.addScriptTag({ content: AXE })
    const ax = await p.evaluate(async () => (await axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id))
    ok('RAV dialog has no serious accessibility problems', !ax.length, ax.join(' '))
    await dlg.getByRole('button', { name: 'Run RAV' }).click(); await p.waitForTimeout(2200)
    const call = calls.find((c) => c.response_format?.json_schema?.name === 'rav')
    ok('one strict-JSON request to GPT-OSS 120B with medium reasoning', call && call.model === 'openai/gpt-oss-120b' && call.response_format.json_schema.strict === true && call.reasoning_effort === 'medium')
    ok('it carries the note and its page — the project’s library', call && call.messages[1].content.includes('one-time price of $19') && call.messages[1].content.includes('relay server costs $5'))
    ok('the prompt asks for exact quotes and a pass/kill test', /exact words from the note/.test(call.messages[0].content) && /"kill"/.test(call.messages[0].content))
    const notes = await dbNotes(p)
    const rav = notes.find((x) => x.rav)
    ok('a “RAV — …” page is made under the note, and opened', rav && rav.title === 'RAV — Folio Watch pricing' && rav.parentId === 'idea' && /RAV — Folio Watch pricing/.test(await p.locator('textarea[aria-label="Title"]').inputValue()))
    const plain = (c) => JSON.stringify(c).match(/"text":"[^"]*"/g).join('')
    ok('the original note is untouched', plain(notes.find((x) => x.id === 'idea').content) === plain(before.content) && notes.find((x) => x.id === 'idea').title === before.title)
    const txt = JSON.stringify(rav.content)
    ok('quote check: a real quote stays “backed by your note”', /A1 [^]*?Backed by your note/.test(txt))
    ok('quote check: a made-up quote is downgraded to “not shown yet”', /A2 [^]*?Not shown yet[^]*?aren’t in your note/.test(txt) && !/Hundreds of users signed up/.test(txt))
    const due = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
    ok('each test is a task with a pass, a kill and a due date', rav.content.filter((b) => b.type === 'checkListItem').length === 2 && txt.includes(`📅 ${due(10)}`) && /Pass if at least 3 pre-orders/.test(txt) && /Kill if no pre-orders/.test(txt))
    const banner = p.getByRole('region', { name: 'RAV review' })
    ok('the RAV page shows the verdict and the objections to mark', /Verdict: Needs work/.test(await banner.innerText()) && (await banner.getByRole('radiogroup').count()) === 2)
    await banner.getByRole('radiogroup', { name: 'Objection X1' }).getByRole('radio', { name: 'Valid' }).click(); await p.waitForTimeout(400)
    await banner.getByRole('radiogroup', { name: 'Objection X2' }).getByRole('radio', { name: 'Answered' }).click(); await p.waitForTimeout(400)
    const marks = (await dbNotes(p)).find((x) => x.rav).rav.marks
    ok('objection marks are saved with the page', marks.X1 === 'valid' && marks.X2 === 'answered', JSON.stringify(marks))
    await shot(p, 'r03-rav-page')
    // tasks
    await banner.getByRole('button', { name: /Open “Folio Watch pricing”/ }).click(); await p.waitForTimeout(600)
    ok('the RAV page links back to the note', /Folio Watch pricing/.test(await p.locator('textarea[aria-label="Title"]').inputValue()))
    await more(p)
    ok('RAV can be run again from the note', await p.getByRole('button', { name: /Reason · Attack · Validate…/ }).isVisible())
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await p.getByRole('button', { name: /^Back/ }).first().click(); await p.waitForTimeout(500)
    await p.getByRole('complementary').getByRole('button', { name: /^Tasks/ }).click(); await p.waitForTimeout(800)
    const tasksText = await p.locator('body').innerText()
    ok('the tests appear in Tasks (as coming up, with their dates)', /2 coming up/.test(tasksText), tasksText.slice(0, 300).replace(/\n/g, ' | '))
    // second run skips the first RAV page
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('Reason'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(600)
    const d2 = p.getByRole('dialog', { name: 'Reason · Attack · Validate' })
    ok('search: “Reason · Attack · Validate…” with a note picker', await d2.getByLabel('Note').isVisible())
    await d2.getByLabel('Note').selectOption('idea'); await d2.getByRole('button', { name: 'Run RAV' }).click(); await p.waitForTimeout(2000)
    const c2 = calls.filter((c) => c.response_format?.json_schema?.name === 'rav')[1]
    ok('a second RAV doesn’t read the earlier RAV page', c2 && !c2.messages[1].content.includes('RAV —') && !c2.messages[1].content.includes('Three friends are not a market'))
    await ctx.close()
  }

  // ---------------- AI off: no RAV anywhere
  {
    const { ctx, p } = await mk({ ai: false })
    await openNote(p, 'Folio Watch pricing'); await more(p)
    ok('AI off: no RAV in the note menu', !(await p.getByRole('button', { name: /Reason · Attack · Validate…/ }).count()))
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('reason attack validate'); await p.waitForTimeout(300)
    ok('AI off: not offered in search', !(await p.getByRole('option', { name: /Reason · Attack · Validate/ }).count()))
    await ctx.close()
  }

  // ---------------- voice memo → offer RAV; retired model → the best free one
  {
    const { ctx, p, calls } = await mk({ seedOpts: { memo: true, llm: 'llama-3.3-70b-versatile' }, opts: { retired: true } })
    await openNote(p, 'Chat about value')
    const offer = p.getByText(/Test the ideas in this recording/)
    ok('a written-up memo offers to test its ideas', await offer.isVisible())
    await shot(p, 'r04-memo-offer')
    await p.getByRole('button', { name: 'Reason · Attack · Validate' }).click(); await p.waitForTimeout(400)
    await p.getByRole('dialog', { name: 'Reason · Attack · Validate' }).getByRole('button', { name: 'Run RAV' }).click(); await p.waitForTimeout(2200)
    const c = calls.find((x) => x.response_format?.json_schema?.name === 'rav')
    ok('a retired model in old settings (Llama 3.3) is replaced by GPT-OSS 120B', c && c.model === 'openai/gpt-oss-120b')
    await p.getByRole('region', { name: 'RAV review' }).getByRole('button', { name: /Open “Chat about value”/ }).click(); await p.waitForTimeout(600)
    ok('once tested, the memo stops offering', !(await p.getByText(/Test the ideas in this recording/).count()))
    const all = await dbNotes(p); const rv = all.find((x) => x.rav?.of === 'memo')
    ok('6.2: a quick note’s review sits beside it (not inside), so the note stays a note', rv && rv.parentId === null && !all.some((x) => x.parentId === 'memo'))
    ok('6.2: the note links to its review', await p.getByRole('button', { name: /RAV review ·/ }).isVisible())
    await p.getByRole('button', { name: /^Back/ }).click(); await p.waitForTimeout(500)
    ok('6.2: the memo is still on the Notes board', await p.locator('article', { hasText: 'Chat about value' }).count() > 0)
    await ctx.close()
  }
  {
    const { ctx, p } = await mk({ seedOpts: { memo: true } })
    await openNote(p, 'Chat about value')
    await p.getByRole('button', { name: 'Not now' }).click(); await p.waitForTimeout(500)
    ok('“Not now” dismisses the offer for good', !(await p.getByText(/Test the ideas in this recording/).count()) && (await dbNotes(p)).find((x) => x.id === 'memo').memo.ravDismissed === true)
    await ctx.close()
  }

  // ---------------- scanned PDF → Qwen 3.8 reads the pages → deck
  {
    const { ctx, p, calls } = await mk()
    await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('make a presentation'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(800)
    const dm = p.getByRole('dialog', { name: 'Make a presentation' })
    await dm.getByRole('button', { name: 'PDF', exact: true }).click()
    await p.waitForTimeout(300)
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), dm.getByRole('button', { name: /Choose a PDF/ }).click()]); await fc.setFiles(path.join(__dirname, 'scanned.pdf')); await p.waitForTimeout(300)
    ok('the maker says scanned PDFs are read by Qwen 3.8', /scanned PDF .* read by Qwen 3\.8/.test(await dm.innerText()))
    await dm.getByRole('switch', { name: /review the storyline/ }).click()
    await dm.getByRole('button', { name: 'Create presentation' }).click(); await p.getByLabel('Presentation title').waitFor({ timeout: 30000 }); await p.waitForTimeout(600)
    const v = calls.find((c) => Array.isArray(c.messages[0].content))
    ok('a scan (no text) is read by Qwen 3.8 from page images', v && v.model === 'qwen/qwen3.8-27b' && v.messages[0].content.some((x) => x.type === 'image_url' && /^data:image\/jpeg;base64,/.test(x.image_url.url)) && v.reasoning_format === 'hidden')
    const o = calls.find((c) => c.response_format?.json_schema?.name === 'outline')
    ok('…and what it read becomes the source of the deck', o && /96 panels fit, 410 W each/.test(o.messages[1].content))
    const deck = (await dbNotes(p)).find((x) => x.deck?.made === 'ai')?.deck
    ok('the scanned deck is made, its numbers checked against what was read', deck && deck.slides.length === 2 && !deck.slides.some((s) => s.check?.length))
    await ctx.close()
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
