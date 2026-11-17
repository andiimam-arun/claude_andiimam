// Uji tab "Cari publikasi" terhadap server OpenAlex tiruan (ber-CORS). Pemakaian: NODE_PATH=$(npm root -g) node scripts/tests/test_pub_tab.js
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const calls = []; let mode = 'ok';
const KQ = Object.keys(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../site/peta-riset/data/publikasi.json'), 'utf8')).kuartil)[0], ISSN = KQ.slice(0, 4) + '-' + KQ.slice(4);
const work = (i, extra) => Object.assign({ id: 'https://openalex.org/W' + (9000 + i), doi: 'https://doi.org/10.1000/test.' + i, title: 'Mock <i>work</i> ' + i + ' about coral', publication_year: 2020 + (i % 6), cited_by_count: 100 - i, type: i % 5 === 0 ? 'review' : 'article',
  open_access: { oa_status: ['gold', 'green', 'closed', 'hybrid'][i % 4] }, primary_location: { source: { display_name: 'Mock Journal', issn_l: i % 2 ? ISSN : '0000-0000' } },
  authorships: [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ author: { display_name: 'Author ' + i + '.' + k }, institutions: k === 1 ? [{ id: 'https://openalex.org/I98301867' }] : [] })) }, extra || {});
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); calls.push(u); const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (mode === '429') { res.writeHead(429, h); return res.end(JSON.stringify({ error: 'Rate limit exceeded', message: 'Insufficient budget' })); }
  const page = +(u.searchParams.get('page') || 1), per = +(u.searchParams.get('per-page') || 25), total = u.searchParams.get('search') === 'none' ? 0 : 60;
  const results = total ? Array.from({ length: Math.min(per, Math.max(0, total - (page - 1) * per)) }, (_, i) => work((page - 1) * per + i + 1)) : [];
  res.writeHead(200, h); res.end(JSON.stringify({ meta: { count: total, page, per_page: per }, results }));
});
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, base = 'http://127.0.0.1:' + port, errs = [], ok = (c, m) => { if (!c) { throw new Error('GAGAL: ' + m); } };
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(b2 => { let cfg = { openalexBase: b2 }; Object.defineProperty(window, 'PETA_CONFIG', { configurable: true, get() { return cfg; }, set(v) { cfg = Object.assign({}, v, { openalexBase: b2 }); } }); }, base);
  await p.goto('file://' + path.resolve(__dirname, '../../site/peta-riset/index.html')); await p.waitForSelector('.person');
  await p.click('#tab-pub'); await p.waitForSelector('#p-list li');
  const feat = await p.$$eval('#p-list li', e => e.length); ok(feat === 40, 'daftar awal harus 40, dapat ' + feat); ok(calls.length === 0, 'tidak boleh memanggil API sebelum pencarian');
  // pencarian dengan filter
  await p.fill('#p-q', 'coral reef'); await p.fill('#p-a', 'Jompa'); await p.fill('#p-y1', '2020'); await p.fill('#p-y2', '2024'); await p.selectOption('#p-t', 'article'); await p.check('#p-o'); await p.selectOption('#p-s', 'cited');
  await p.click('#p-form .go'); await p.waitForFunction(() => /ditemukan/.test(document.querySelector('#p-status').textContent));
  const q = calls[calls.length - 1].searchParams, f = q.get('filter');
  ok(q.get('search') === 'coral reef', 'search'); ok(f.includes('authorships.institutions.id:I98301867'), 'filter institusi'); ok(f.includes('publication_year:2020-2024'), 'rentang tahun ' + f); ok(f.includes('type:article'), 'jenis'); ok(f.includes('is_oa:true'), 'akses terbuka'); ok(f.includes('raw_author_name.search:Jompa'), 'penulis');
  ok(q.get('sort') === 'cited_by_count:desc', 'urut sitasi'); ok(q.get('per-page') === '25' && q.get('page') === '1', 'halaman'); ok(!q.has('api_key') && !q.has('mailto'), 'tanpa kunci/email di URL');
  ok((await p.$$eval('#p-list li', e => e.length)) === 25, '25 hasil'); ok(/60 karya ditemukan; menampilkan 25/.test(await p.$eval('#p-status', e => e.textContent)), 'status jumlah');
  const title = await p.$eval('#p-list li a', e => e.textContent); ok(title === 'Mock work 1 about coral', 'tag HTML pada judul harus dibuang, dapat: ' + title);
  ok((await p.$$eval('#p-list li strong', e => e.length)) >= 25, 'penulis Unhas ditebalkan'); ok(await p.$eval('#p-list li', e => /\+|dan 2 penulis lain/.test(e.textContent)), 'penulis tambahan');
  ok((await p.$$eval('.qb', e => e.length)) > 0, 'lencana kuartil untuk ISSN yang dikenal'); ok((await p.$$eval('.oab', e => e.length)) > 0, 'lencana OA');
  ok(await p.evaluate(() => location.search.includes('pq=coral+reef') && location.search.includes('py1=2020')), 'status tersimpan di URL');
  // muat lagi
  await p.click('#p-more'); await p.waitForFunction(() => document.querySelectorAll('#p-list li').length === 50); ok(calls[calls.length - 1].searchParams.get('page') === '2', 'halaman 2');
  // unduh CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#p-csv')]); const f2 = path.join(os.tmpdir(), 'pub_test.csv'); await dl.saveAs(f2); const csv = fs.readFileSync(f2, 'utf8');
  ok(csv.startsWith('﻿title,year,journal') && csv.split('\r\n').length === 51, 'CSV 50 baris + kepala'); ok(/10\.1000\/test\.1,/.test(csv), 'DOI di CSV');
  // tanpa hasil
  await p.fill('#p-q', 'none'); await p.click('#p-form .go'); await p.waitForFunction(() => /Tidak ada karya/.test(document.querySelector('#p-status').textContent));
  // kuota habis -> kembali ke daftar tersimpan
  mode = '429'; await p.fill('#p-q', 'x'); await p.click('#p-form .go'); await p.waitForFunction(() => /membatasi permintaan/.test(document.querySelector('#p-status').textContent));
  ok((await p.$$eval('#p-list li', e => e.length)) === 40, 'harus kembali ke daftar tersimpan saat 429');
  // atur ulang
  await p.click('#p-reset'); ok(/Daftar unggulan tersimpan/.test(await p.$eval('#p-status', e => e.textContent)), 'atur ulang');
  // layanan mati
  srv.close(); mode = 'ok'; await p.fill('#p-q', 'y'); await p.click('#p-form .go'); await p.waitForFunction(() => /tidak dapat dijangkau/.test(document.querySelector('#p-status').textContent));
  ok(errs.length === 0, 'galat JS: ' + errs.join(' | ')); console.log('OK | daftar awal, filter dan parameter API, tanpa kunci di URL, judul bersih, lencana, halaman, CSV, nol hasil, 429, atur ulang, peladen mati'); await b.close(); process.exit(0);
})().catch(e => { console.error(String(e)); process.exit(1); });
