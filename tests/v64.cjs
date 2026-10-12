// V6.4 checks: "Sync my devices" — two Folios swap changes over a direct Wi-Fi link (WebRTC, set up
// by scanning QR codes both ways) or with QR codes only; merging (new, updated, trashed, changed on
// both → kept twice), pictures following by id, and "unlinked mentions". Needs `npm run preview` on :4174.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path')
const APP = (process.env.ORIGIN || 'http://localhost:4174') + '/app/'
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || ''
const results = []; const ok = (n, p, i = '') => { results.push({ n, p: !!p }); console.log(p ? 'PASS' : 'FAIL', n, i) };
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }) } }
const dbAll = (p, store) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('folio'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) } }), store)
const byTitle = async (p, t) => (await dbAll(p, 'notes')).find((n) => n.title === t)
const para = (s) => [{ type: 'paragraph', content: [{ type: 'text', text: s, styles: {} }] }]
const seed = (p, notes, labels = [], withImage = false) => p.evaluate(async ({ notes, labels, withImage }) => {
  let blob = null
  if (withImage) { const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#e0a040'; g.fillRect(0, 0, 200, 120); g.fillStyle = '#204060'; g.fillRect(40, 30, 80, 50); blob = await new Promise((r) => c.toBlob(r, 'image/png')) }
  return new Promise((res) => {
    const r = indexedDB.open('folio'); r.onsuccess = () => {
      const tx = r.result.transaction(['notes', 'labels', 'meta', 'blobs'], 'readwrite'); const now = Date.now()
      for (const n of notes) tx.objectStore('notes').put({ color: 'default', pinned: false, archived: false, trashedAt: null, parentId: null, labels: [], image: null, position: now, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: 'x', checklist: [], words: 20, createdAt: now - 864e5, updatedAt: now - 864e5, rev: now - 864e5, ...n })
      for (const l of labels) tx.objectStore('labels').put(l)
      if (blob) tx.objectStore('blobs').put({ id: 'pic0000test', blob, type: 'image/png', size: blob.size, at: now })
      tx.objectStore('meta').put({ key: 'welcomed', value: 1 }); tx.oncomplete = () => res(1)
    }
  })
}, { notes, labels, withImage })
/** Edits a note like the app does (bumps rev and updatedAt). */
const edit = (p, id, changes) => p.evaluate(({ id, changes }) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => { const s = r.result.transaction('notes', 'readwrite').objectStore('notes'); const g = s.get(id); g.onsuccess = () => { const now = Date.now(); s.put({ ...g.result, ...changes, rev: now, updatedAt: now }).onsuccess = () => res(1) } }
}), { id, changes })

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })
  const errors = []
  /** A device: a page whose "camera" films whatever frames we hand it (window.__cam). */
  const device = async (name, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', ...opts })
    await ctx.addInitScript(() => {
      if (!sessionStorage.getItem('v64')) { sessionStorage.setItem('v64', '1'); localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', theme: 'espresso', name: 'Zain' })); localStorage.setItem('folio.installHint', '1'); localStorage.setItem('folio.kinds62', '1') }
      window.__cam = []
      if (!navigator.mediaDevices) return
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas'); c.width = 720; c.height = 720; const g = c.getContext('2d')
        let k = 0, imgs = [], src = null
        const draw = async () => {
          if (src !== window.__cam) { src = window.__cam; imgs = await Promise.all(src.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u }))) }
          g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, 720, 720)
          if (imgs.length) { g.translate(360, 360); g.rotate(0.04); g.filter = 'blur(0.6px)'; g.drawImage(imgs[k++ % imgs.length], -230, -230, 460, 460) }
        }
        draw(); setInterval(draw, 110)
        return c.captureStream(20)
      }
    })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    return { ctx, p }
  }
  /** Films the codes a page is showing: `extra` × as many frames as codes (at least `min`). */
  const film = async (p, extra = 2.5, min = 6) => {
    const send = p.getByTestId('beam-send').last(); await send.waitFor()
    await p.waitForTimeout(300)
    return p.evaluate(({ extra, min }) => new Promise((res) => {
      const c = [...document.querySelectorAll('[data-testid="beam-send"] canvas')].pop(); const out = []; let last = -1
      const t = setInterval(() => { const st = Number(c.dataset.step); if (st !== last) { last = st; out.push(c.toDataURL('image/png')) } if (out.length >= min && out.length >= extra * 3) { clearInterval(t); res(out) } }, 12)
    }), { extra, min })
  }
  const show = (p, frames) => p.evaluate((f) => { window.__cam = f }, frames)
  const settled = async (p, re, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { const t = await p.getByTestId('sync').innerText().catch(() => ''); if (re.test(t)) return t; await p.waitForTimeout(250) } return await p.getByTestId('sync').innerText().catch(() => '') }
  const palette = async (p, q, label) => {
    await p.keyboard.press('Control+k'); const menu = p.getByRole('dialog', { name: 'Command menu' }); await menu.waitFor()
    await p.keyboard.type(q); const item = menu.getByText(label, { exact: true }).first(); await item.waitFor(); await item.click(); await p.waitForTimeout(500)
  }
  const openSync = (p) => palette(p, 'sync my devices', 'Sync my devices…')

  // ---------------- two devices with different notes (and one they share)
  const A = await device('laptop'), B = await device('phone')
  for (const d of [A, B]) { await d.p.goto(APP); await d.p.waitForTimeout(700) }
  await seed(A.p, [
    { id: 'a-only', title: 'Laptop idea', content: para('Written on the laptop.'), labels: ['nb-work'] },
    { id: 'pic', title: 'Site photo', content: [{ type: 'image', props: { url: 'folio-img:pic0000test', caption: 'Roof' } }, ...para('With a picture.')] },
    { id: 'shared', title: 'Groceries', content: para('Milk, eggs.') },
    { id: 'ref', title: 'Reading list', content: para('Check the laptop idea before Friday.') },
  ], [{ id: 'nb-work', name: 'Work' }], true)
  await seed(B.p, [
    { id: 'b-only', title: 'Phone thought', content: para('Typed on the phone.') },
    { id: 'shared', title: 'Groceries', content: para('Milk, eggs, bread.'), rev: Date.now() - 3600e3, updatedAt: Date.now() - 3600e3 },
  ], [{ id: 'nb-home', name: 'Work' }])
  for (const d of [A, B]) { await d.p.reload(); await d.p.waitForTimeout(1000) }

  // ---------------- Wi-Fi: Start on the laptop, Join on the phone
  await openSync(A.p)
  const dlgA = A.p.getByTestId('sync')
  ok('Ctrl K → Sync my devices explains the three steps', /On one device, tap Start/.test(await dlgA.innerText()))
  await shot(A.p, 's01-home')
  await A.p.getByRole('button', { name: 'Start', exact: true }).click()
  await A.p.getByTestId('beam-send').waitFor({ timeout: 10000 })
  ok('Start shows a short code to scan', await A.p.getByTestId('beam-send').isVisible())
  await shot(A.p, 's02-offer')
  await show(B.p, await film(A.p))
  await openSync(B.p); await shot(B.p, 's02b-phone')
  await B.p.getByRole('button', { name: 'Join', exact: true }).click()
  await B.p.getByTestId('beam-send').waitFor({ timeout: 30000 }).catch(() => {})
  ok('Join scans it and shows a reply code', await B.p.getByTestId('beam-send').isVisible(), await B.p.getByTestId('sync').innerText().catch(() => 'no dialog'))
  await shot(B.p, 's02c-phone')
  await shot(B.p, 's03-answer')
  await show(A.p, await film(B.p))
  await A.p.getByRole('button', { name: /Next: scan the code/ }).click()
  const doneA = await settled(A.p, /Up to date with/), doneB = await settled(B.p, /Up to date with/)
  ok('scanning the reply connects them and both finish', /Up to date with/.test(doneA) && /Up to date with/.test(doneB), `${doneA.slice(0, 80)} | ${doneB.slice(0, 80)}`)
  await shot(A.p, 's04-done')
  let na = await dbAll(A.p, 'notes'), nb = await dbAll(B.p, 'notes')
  ok('each device now has the other’s notes', na.some((n) => n.id === 'b-only') && nb.some((n) => n.id === 'a-only') && nb.some((n) => n.id === 'pic'))
  const txt = (n) => n?.content?.[0]?.content?.[0]?.text
  ok('first sync: different copies of the same note → the newer keeps it on both', txt(na.find((n) => n.id === 'shared')) === 'Milk, eggs, bread.' && txt(nb.find((n) => n.id === 'shared')) === 'Milk, eggs, bread.')
  const copyA = na.find((n) => n.id !== 'shared' && /^Groceries/.test(n.title)), copyB = nb.find((n) => n.id !== 'shared' && /^Groceries/.test(n.title))
  ok('…and the other version is kept as a copy — the same copy on both devices', copyA && copyB && copyA.id === copyB.id && txt(copyA) === 'Milk, eggs.' && /version\)$/.test(copyA.title), copyA?.title)
  ok('notebooks with the same name are matched, not doubled', (await dbAll(B.p, 'labels')).filter((l) => l.name === 'Work').length === 1 && nb.find((n) => n.id === 'a-only').labels[0] === 'nb-home')
  const pic = (await dbAll(B.p, 'blobs')).find((x) => x.id === 'pic0000test')
  ok('pictures follow over Wi-Fi, by id', !!pic && pic.size > 100)
  ok('the summary says what moved', /new/.test(doneB) && /sent/.test(doneB))
  await A.p.getByRole('button', { name: 'Done' }).click(); await B.p.getByRole('button', { name: 'Done' }).click()

  // ---------------- second sync: only changes travel; both-changed is kept twice; trash travels
  await edit(A.p, 'a-only', { content: para('Rewritten on the laptop.') })
  await edit(A.p, 'shared', { content: para('Milk, eggs, coffee.') })
  await edit(B.p, 'shared', { content: para('Milk, eggs, tea.') })
  await edit(B.p, 'b-only', { trashedAt: Date.now() })
  for (const d of [A, B]) { await d.p.reload(); await d.p.waitForTimeout(900) }
  await openSync(A.p)
  ok('the dialog remembers the other device', /Synced with/i.test(await dlgA.innerText()) && /Chrome|Browser/.test(await dlgA.innerText()))
  await A.p.getByRole('button', { name: 'Start', exact: true }).click(); await A.p.getByTestId('beam-send').waitFor({ timeout: 10000 })
  await show(B.p, await film(A.p))
  // the phone joins from Receive — sync codes are recognised there too
  await palette(B.p, 'receive with beam', 'Receive with Beam (scan a code)…')
  await B.p.getByTestId('beam-send').waitFor({ timeout: 30000 }).catch(() => {})
  ok('Receive also understands a sync code (opens Sync and replies)', await B.p.getByTestId('sync').isVisible() && await B.p.getByTestId('beam-send').isVisible())
  await show(A.p, await film(B.p))
  await A.p.getByRole('button', { name: /Next: scan the code/ }).click()
  const d2A = await settled(A.p, /Up to date with/), d2B = await settled(B.p, /Up to date with/)
  ok('second sync finishes', /Up to date/.test(d2A) && /Up to date/.test(d2B))
  ok('only what changed was sent', /2 sent|1 sent/.test(d2A) && /2 sent|1 sent/.test(d2B), `${d2A.match(/\d+ sent/)} / ${d2B.match(/\d+ sent/)}`)
  na = await dbAll(A.p, 'notes'); nb = await dbAll(B.p, 'notes')
  ok('a note changed on one device is updated on the other', nb.find((n) => n.id === 'a-only').content[0].content[0].text === 'Rewritten on the laptop.')
  ok('moving to Trash travels (into Trash, not deleted)', na.find((n) => n.id === 'b-only').trashedAt !== null)
  const keptA = na.filter((n) => /^Groceries/.test(n.title)).map((n) => `${n.id}=${txt(n)}`).sort(), keptB = nb.filter((n) => /^Groceries/.test(n.title)).map((n) => `${n.id}=${txt(n)}`).sort()
  ok('changed on both devices → newer edit keeps the note, the other is kept as a copy; both devices agree', keptA.length === 3 && JSON.stringify(keptA) === JSON.stringify(keptB) && txt(na.find((n) => n.id === 'shared')) === 'Milk, eggs, tea.' && keptA.some((x) => x.endsWith('=Milk, eggs, coffee.')), keptA.join(' | '))
  ok('…and the summary lists it to look over', /Changed on both devices/.test(d2A))
  await shot(A.p, 's05-conflict')
  await A.p.addScriptTag({ content: AXE })
  const ax = await A.p.evaluate(async () => (await window.axe.run(document.querySelector('[role="dialog"]'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => v.id))
  ok('the sync dialog passes axe (WCAG AA)', ax.length === 0, ax.join(','))
  await A.p.getByRole('button', { name: 'Done' }).click(); await B.p.getByRole('button', { name: 'Done' }).click()

  // ---------------- codes only (no shared Wi-Fi): laptop → phone, then the phone answers
  await edit(A.p, 'a-only', { content: para('Third version, sent by codes.') })
  await edit(B.p, 'pic', { title: 'Site photo (roof)' })
  for (const d of [A, B]) { await d.p.reload(); await d.p.waitForTimeout(900) }
  await openSync(A.p)
  await A.p.getByRole('button', { name: /Sync with codes instead/ }).click(); await A.p.waitForTimeout(300)
  ok('codes mode asks which device (and remembers it)', await A.p.getByRole('button', { name: /changes since/ }).count() === 1)
  await A.p.getByRole('button', { name: /changes since/ }).click()
  await A.p.getByTestId('beam-send').waitFor({ timeout: 10000 }).catch(() => {})
  ok('it shows only what changed since the last sync', /1 note to send/.test(await A.p.getByTestId('sync').innerText()), (await A.p.getByTestId('sync').innerText()).slice(0, 120))
  await shot(A.p, 's06-codes')
  await show(B.p, await film(A.p))
  await palette(B.p, 'receive with beam', 'Receive with Beam (scan a code)…')
  const got = await settled(B.p, /Up to date with/)
  ok('the phone receives them with Receive', /1 updated/.test(got) && (await byTitle(B.p, 'Laptop idea')).content[0].content[0].text === 'Third version, sent by codes.')
  await B.p.getByRole('button', { name: 'Send my changes back' }).click(); await B.p.getByTestId('beam-send').waitFor({ timeout: 10000 }).catch(() => {})
  ok('…then offers to send its own changes back (not echoing what it just got)', /1 note to send/.test(await B.p.getByTestId('sync').innerText()))
  await show(A.p, await film(B.p))
  await A.p.getByRole('button', { name: /Next: scan its changes/ }).click()
  const back = await settled(A.p, /Up to date with/)
  ok('the laptop scans them back: both up to date', /1 updated/.test(back) && !!(await byTitle(A.p, 'Site photo (roof)')))
  const peersA = (await dbAll(A.p, 'meta')).find((m) => m.key === 'syncPeers').value
  ok('the reply confirms what it got, so next time only new changes go', peersA.length === 1 && peersA[0].since > Date.now() - 120e3)
  await A.p.getByRole('button', { name: 'Done' }).click()

  // ---------------- no shared network → a clear way out
  await openSync(A.p)
  await A.p.getByRole('button', { name: 'Start', exact: true }).click(); await A.p.getByTestId('beam-send').waitFor({ timeout: 10000 })
  // a reply from a device that will never connect: made by a third, closed page
  const C = await device('stranger'); await C.p.goto(APP); await C.p.waitForTimeout(600)
  await show(C.p, await film(A.p)); await openSync(C.p); await C.p.getByRole('button', { name: 'Join', exact: true }).click()
  await C.p.getByTestId('beam-send').waitFor({ timeout: 30000 }).catch(() => {})
  const strangerFrames = await film(C.p); await C.ctx.close()
  await show(A.p, strangerFrames); await A.p.getByRole('button', { name: /Next: scan the code/ }).click()
  const nolink = await settled(A.p, /couldn’t reach each other/, 40000)
  ok('if the devices can’t connect, it says why and offers codes', /couldn’t reach each other/.test(nolink) && await A.p.getByRole('button', { name: 'Sync with codes' }).isVisible())
  await shot(A.p, 's07-nolink')
  await A.p.keyboard.press('Escape')

  // ---------------- unlinked mentions
  await A.p.reload(); await A.p.waitForTimeout(900)
  await palette(A.p, 'Laptop idea', 'Laptop idea'); await A.p.waitForTimeout(1600)
  const men = A.p.getByRole('region', { name: 'Unlinked mentions' })
  ok('a note lists others that name it without linking', await men.isVisible() && /Reading list/.test(await men.innerText()) && /laptop idea before Friday/i.test(await men.innerText()))
  await shot(A.p, 's08-mentions')
  await men.getByRole('button', { name: /Link the mention in Reading list/ }).click(); await A.p.waitForTimeout(700)
  const pt = await byTitle(A.p, 'Reading list')
  ok('Link turns the mention into a real link (and it moves to “Linked from”)', JSON.stringify(pt.content).includes('#note=a-only') && /Linked from/i.test(await A.p.locator('body').innerText()) && !(await men.count()))

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await b.close()
  const failed = results.filter((r) => !r.p)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
