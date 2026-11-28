// Uji paket Google Apps Script: bangun, rakit seperti HtmlService, buka di peramban. Pemakaian: NODE_PATH=$(npm root -g) node scripts/tests/test_apps_script.js
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gas_')), out = path.join(tmp, 'o'), prev = path.join(tmp, 'p.html'), ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); };
  execFileSync('python3', ['-I', path.resolve(__dirname, '../build_apps_script.py'), '--out', out, '--preview', prev], { env: Object.assign({}, process.env, { PREVIEW_QS: 'tab=dunia&lang=en' }) });
  for (const f of ['Code.gs', 'appsscript.json', 'Index.html', 'Css.html', 'Config.html', 'Data.html', 'App.html']) ok(fs.existsSync(path.join(out, f)), 'berkas ' + f);
  const man = JSON.parse(fs.readFileSync(path.join(out, 'appsscript.json'))); ok(man.runtimeVersion === 'V8' && man.webapp.executeAs === 'USER_DEPLOYING', 'manifest');
  const idx = fs.readFileSync(path.join(out, 'Index.html'), 'utf8'); for (const n of ['Css', 'Config', 'Data', 'App']) ok(idx.includes("include('" + n + "')"), 'include ' + n); ok(idx.includes('JSON.stringify(qs)'), 'qs');
  ok(!/assets\/|data\/peta-data/.test(idx), 'tidak boleh ada rujukan berkas relatif di Index'); ok(fs.readFileSync(path.join(out, 'Code.gs'), 'utf8').includes('XFrameOptionsMode.ALLOWALL'), 'ALLOWALL');
  const b = await chromium.launch(), p = await b.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + prev); await p.waitForSelector('#d-countries path', { state: 'attached' });
  ok((await p.$eval('[role=tab][aria-selected=true]', e => e.textContent)) === 'Global collaboration', 'parameter tab/lang dari web app dibaca'); ok((await p.$$eval('#d-countries path', e => e.length)) > 150, 'peta tampil');
  await p.click('#tab-cari'); await p.waitForSelector('.person'); ok(errs.length === 0, 'galat JS: ' + errs.join(' | '));
  console.log('OK | paket lengkap, manifest, include, tanpa rujukan relatif, parameter alamat dibaca, peta dan kartu tampil'); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error(String(e)); process.exit(1); });
