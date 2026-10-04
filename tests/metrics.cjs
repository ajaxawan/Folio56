// Performance metrics. Start `npm run preview` (port 4174) first, then: node tests/metrics.cjs <label> [notes]
// Folio metrics: first-load transfer, precache size, time-to-cards, search latency, storage use.
// usage: node metrics.js <label> [notes=2000]
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const URL = 'http://localhost:4174';
const label = process.argv[2] || 'run'; const N = Number(process.argv[3] || 2000);
const DIST = require('path').join(__dirname, '..', 'dist');
const PHOTO = fs.readFileSync(__dirname + '/photo.jpg').toString('base64');

function precache() {
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  let bytes = 0; for (const u of urls) { try { bytes += fs.statSync(path.join(DIST, u)).size } catch {} }
  return { entries: urls.length, mb: +(bytes / 1048576).toFixed(2) };
}

const seed = ({ n, photo }) => new Promise((res) => {
  const r = indexedDB.open('folio'); r.onsuccess = () => {
    const db = r.result; const tx = db.transaction(['notes', 'labels', 'versions'], 'readwrite'); const now = Date.now();
    const words = 'solar tracker array inverter module string combiner pile racking grade slope wetland setback parcel layout civil autocad command dotnet python note idea meeting plan review'.split(' ');
    const sent = (k) => Array.from({ length: k }, (_, i) => words[(i * 7 + k) % words.length]).join(' ');
    for (let l = 0; l < 8; l++) tx.objectStore('labels').put({ id: 'l' + l, name: 'Label ' + l });
    const img = 'data:image/jpeg;base64,' + photo;
    for (let i = 0; i < n; i++) {
      const content = [{ type: 'heading', props: { level: 2 }, content: 'Section ' + i }, { type: 'paragraph', content: sent(20 + (i % 30)) + ' #' + i }, { type: 'paragraph', content: sent(15) }];
      if (i % 3 === 0) content.push({ type: 'checkListItem', props: { checked: i % 2 === 0 }, content: 'Task ' + i });
      const withImg = i < 12;
      if (withImg) content.push({ type: 'image', props: { url: img } });
      const note = { id: 'n' + i, title: 'Note ' + i + ' ' + words[i % words.length], content, color: ['default', 'sand', 'dusk', 'storm'][i % 4], pinned: i < 3, archived: false, trashedAt: null, parentId: i > 10 && i % 50 === 0 ? 'n1' : null, labels: ['l' + (i % 8)], image: withImg ? img : null, position: n - i, locked: false, cipher: null, daily: null, icon: null, cover: null, paper: 'none', preview: '\u0001Section ' + i + '\n' + sent(20), checklist: i % 3 === 0 ? [{ text: 'Task ' + i, checked: i % 2 === 0 }] : [], words: 40, createdAt: now - i * 3600e3, updatedAt: now - i * 3600e3 };
      tx.objectStore('notes').put(note);
      // image notes have a long history (each snapshot stores the whole note today)
      if (withImg) for (let v = 0; v < 30; v++) tx.objectStore('versions').put({ id: `v${i}_${v}`, noteId: note.id, at: now - v * 60e3, title: note.title, content, words: 40 });
    }
    tx.oncomplete = () => res(1);
  };
});

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--enable-precise-memory-info'] });
  const out = { label, precache: precache() };
  // 1. cold first load (empty DB)
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const res = [];
    p.on('response', async (r) => { try { const buf = await r.body(); res.push({ url: r.url(), raw: buf.length, gz: zlib.gzipSync(buf).length }) } catch {} });
    const t0 = Date.now(); await p.goto(URL, { waitUntil: 'networkidle' }); out.coldLoadMs = Date.now() - t0;
    const sum = (f) => res.filter(f).reduce((a, x) => a + x.gz, 0);
    out.firstLoad = { requests: res.length, gzKB: Math.round(sum(() => true) / 1024), jsGzKB: Math.round(sum((x) => /\.js($|\?)/.test(x.url)) / 1024), fontKB: Math.round(sum((x) => /woff2?$/.test(x.url)) / 1024), fontFiles: res.filter((x) => /woff2?$/.test(x.url)).length };
    out.fcpMs = await p.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
    // open editor: what does it add?
    await ctx.close();
  }
  // 2. big library
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await p.evaluate(() => localStorage.setItem('folio.prefs', JSON.stringify({ candlelight: 'off', grain: false, todayCollapsed: true })));
    await p.evaluate(seed, { n: N, photo: PHOTO });
    const t0 = Date.now(); await p.reload(); await p.locator('article').first().waitFor({ timeout: 60000 }); out.timeToCardsMs = Date.now() - t0;
    await p.waitForTimeout(1500);
    out.cardsInDom = await p.locator('article').count();
    out.domNodes = await p.evaluate(() => document.getElementsByTagName('*').length);
    out.heapMB = await p.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
    // scroll smoothness: frames during a 2s programmatic scroll
    out.scrollFps = await p.evaluate(async () => {
      const el = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 500 && getComputedStyle(d).overflowY === 'auto');
      if (!el) return -1; let frames = 0; const start = performance.now();
      await new Promise((done) => { const step = (t) => { frames++; el.scrollTop += 60; if (t - start < 2000) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
      return Math.round(frames / ((performance.now() - start) / 1000));
    });
    // search latency (command palette)
    await p.keyboard.press('Control+k'); await p.waitForTimeout(300);
    const s0 = Date.now(); await p.keyboard.type('wetland 1999', { delay: 0 }); await p.waitForFunction(() => document.body.innerText.includes('Note 1999'), null, { timeout: 15000 }).catch(() => {}); out.searchMs = Date.now() - s0;
    await p.keyboard.press('Escape');
    // open a note with an image
    console.log('partial', JSON.stringify(out));
    try { await p.goto(URL); await p.locator('article').first().waitFor({ timeout: 60000 }); const o0 = Date.now(); await p.locator('article').first().click(); await p.locator('.bn-editor').waitFor({ timeout: 30000 }); out.openNoteMs = Date.now() - o0; } catch (e) { out.openNoteMs = 'fail: ' + e.message.split('\n')[0];  }
    await p.waitForTimeout(6000)
    out.storage = await p.evaluate(async () => {
      const e = await navigator.storage.estimate();
      const db = await new Promise((r) => { const q = indexedDB.open('folio'); q.onsuccess = () => r(q.result); });
      const size = (store) => new Promise((r) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result.reduce((a, x) => a + JSON.stringify(x).length + (x.value instanceof Blob ? x.value.size : x.blob instanceof Blob ? x.blob.size : 0), 0)); });
      const stores = [...db.objectStoreNames]; const per = {};
      for (const s of stores) per[s] = Math.round((await size(s)) / 1048576 * 10) / 10;
      return { usageMB: Math.round(e.usage / 1048576 * 10) / 10, perStoreMB: per, persisted: await navigator.storage.persisted() };
    });
    out.errors = errs.slice(0, 5);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(`${__dirname}/metrics-${label}.json`, JSON.stringify(out, null, 1));
  await b.close();
})();
