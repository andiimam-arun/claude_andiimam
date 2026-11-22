/* Rubrik PMU FKM Unhas: logika penilaian murni, tanpa DOM. Dipakai oleh index.html dan diuji di Node. */
(function (root) {
  'use strict';

  var LIST_YEAR = 2026;            // tahun edisi Scopus Source List
  var LIST_LABEL = 'Oktober 2026';

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // "2018-2026; 2004-2016" -> segmen terurut
  function parseCoverage(s) {
    var segs = [];
    String(s || '').split(';').forEach(function (p) {
      p = p.trim();
      if (!p) return;
      var m = p.match(/^(\d{4})\s*-\s*(\d{4})$/);
      if (m) segs.push([+m[1], +m[2]]);
      else if (/^\d{4}$/.test(p)) segs.push([+p, +p]);
    });
    segs.sort(function (a, b) { return a[0] - b[0]; });
    return segs;
  }

  function coverageInfo(s) {
    var segs = parseCoverage(s);
    if (!segs.length) return null;
    var maxY = Math.max.apply(null, segs.map(function (x) { return x[1]; }));
    var gaps = [];
    for (var i = 1; i < segs.length; i++) {
      if (segs[i][0] > segs[i - 1][1] + 1) {
        for (var y = segs[i - 1][1] + 1; y < segs[i][0]; y++) gaps.push(y);
      }
    }
    var recentGaps = gaps.filter(function (y) { return y >= LIST_YEAR - 12; });
    return { maxY: maxY, recentGaps: recentGaps };
  }

  function band(r) {            // r = N_t / N_(t-1)
    if (r < 0.5 || r > 2.0) return 'x';
    if (r < 0.7 || r > 1.5) return 'm';
    return 'n';
  }

  function evaluate(S) {
    var rows = [], red = [], yellow = [], steps = [];
    var rec = S.rec || null;

    function add(code, group, name, pts, max, note) {
      rows.push({ code: code, group: group, name: name, pts: pts, max: max, note: note || '', na: pts === null });
    }

    /* A1: status Source List (gerbang) */
    if (!rec) {
      add('A1', 'A', 'Status di Scopus Source List', 0, 15, 'Tidak ditemukan di Source List ' + LIST_LABEL + '.');
      red.push('R1: tidak ditemukan di Scopus Source List');
      steps.push('Cek ejaan nama atau ISSN. Jika memang tidak ada, jurnal tidak terindeks Scopus dan tidak layak untuk target ini.');
    } else if (rec.s === 'P') {
      add('A1', 'A', 'Status di Scopus Source List', 0, 15, 'Baru diterima untuk ditambahkan (' + (rec.fin || 'tanggal tidak tercatat') + '), belum terindeks.');
      red.push('R1: belum terindeks, baru dalam proses penambahan ke Scopus');
      steps.push('Tunggu sampai muncul sebagai Active di Source List. Artikel yang terbit sebelum itu belum tentu terindeks.');
    } else if (rec.d || rec.s === 'I') {
      add('A1', 'A', 'Status di Scopus Source List', 0, 15,
        rec.d ? 'Discontinued oleh Scopus' + (rec.fin ? ' (coverage akhir: ' + rec.fin + ')' : '') + '.' : 'Berstatus Inactive.');
      red.push(rec.d ? 'R1: discontinued oleh Scopus' : 'R1: berstatus Inactive di Scopus');
      steps.push('Jangan submit. Pilih jurnal lain yang berstatus Active.');
    } else {
      add('A1', 'A', 'Status di Scopus Source List', 15, 15, 'Active, tidak ada di daftar Discontinued.');
    }

    /* A2, A3: Scimago */
    var q = S.quartile || '';
    if (!q) {
      add('A2', 'A', 'Ada di Scimago', null, 5, 'Belum diisi.');
      add('A3', 'A', 'Kuartil Scimago', null, 5, 'Belum diisi.');
    } else if (q === 'NONE') {
      add('A2', 'A', 'Ada di Scimago', 0, 5, 'Tidak ada di Scimago (jurnal baru atau tertinggal data).');
      add('A3', 'A', 'Kuartil Scimago', 0, 5, 'Tanpa kuartil.');
    } else {
      add('A2', 'A', 'Ada di Scimago', 5, 5, 'SJR dan kuartil tersedia.');
      add('A3', 'A', 'Kuartil Scimago', (q === 'Q1' || q === 'Q2') ? 5 : 3, 5, q);
    }

    /* A4: kloning (gerbang) */
    var a4 = S.a4 === '' || S.a4 === undefined ? null : Number(S.a4);
    if (a4 === null) {
      add('A4', 'A', 'Bukan kloning / hijack', null, 15, 'Belum diisi.');
    } else {
      var a4n = { 15: 'Domain terverifikasi.', 12: 'Situs resmi dan ISSN terkonfirmasi, URL submit belum dicek.', 8: 'Hanya ISSN dan penerbit konsisten di Scopus.', 0: 'Terindikasi kloning.' }[a4];
      add('A4', 'A', 'Bukan kloning / hijack', a4, 15, a4n);
      if (a4 === 0) {
        red.push('R2: terindikasi kloning/hijack');
        steps.push('Jangan submit. Laporkan ke Ketua PMU dan hubungi penerbit asli lewat kontak resmi di Scopus.');
      } else if (a4 < 12) {
        yellow.push('K4: URL submit belum diverifikasi');
        steps.push('Cocokkan domain submit dengan homepage di Scimago atau penerbit, dan cek Hijacked Journal Checker (Retraction Watch).');
      }
    }

    /* B1: stabilitas volume */
    var docs = (S.docs || []).map(num);
    var baseY = Number(S.base) || LIST_YEAR - 1;
    if (docs.length < 4 || docs.some(function (d) { return d === null; })) {
      add('B1', 'B', 'Stabilitas jumlah dokumen Scopus', null, 15, 'Isi dokumen 4 tahun terakhir.');
    } else {
      var nN = 0, nM = 0, nX = 0, parts = [], collapse = false, surgeThenCollapse = false;
      var bands = [];
      for (var i = 1; i < 4; i++) {
        var prev = docs[i - 1], cur = docs[i], b;
        var small = prev < 30 && cur < 30;
        var r = prev === 0 ? (cur > 0 ? Infinity : 1) : cur / prev;
        if (small && Math.abs(cur - prev) <= 10) b = 'n'; else b = band(r);
        bands.push(b);
        if (b === 'n') nN++; else if (b === 'm') nM++; else nX++;
        if (prev >= 30 && r < 0.2) collapse = true;
        parts.push((baseY - 3 + i) + ': ' + (isFinite(r) ? 'x' + r.toFixed(2) : 'dari 0'));
      }
      for (var k = 0; k < 2; k++) {
        var rp = docs[k] === 0 ? Infinity : docs[k + 1] / docs[k];
        var rn = docs[k + 1] === 0 ? Infinity : docs[k + 2] / docs[k + 1];
        if (rp > 2 && docs[k] >= 30 && rn < 0.5 && docs[k + 1] >= 30) surgeThenCollapse = true;
      }
      var nXyear = nX;
      var ytd = num(S.ytd), surgeYtd = false, lowYtd = false;
      if (ytd !== null) {
        var pn = docs[3], ry = pn === 0 ? (ytd > 0 ? Infinity : 1) : ytd / pn;
        var smallY = pn < 30 && ytd < 30 && Math.abs(ytd - pn) <= 10;
        if (!smallY) {
          if (ry >= 2) { nX++; surgeYtd = true; }
          else if (ry > 1.5) nM++;
          else if (ry < 0.25 && pn >= 30) { nM++; lowYtd = true; }
        }
        parts.push((baseY + 1) + ' (berjalan): ' + (isFinite(ry) ? 'x' + ry.toFixed(2) : 'dari 0'));
      }
      var peak = num(S.peak), peakNote = '';
      if (peak !== null && peak >= 30 && docs[3] < 0.4 * peak) {
        nM++;
        peakNote = ' Turun ' + Math.round((1 - docs[3] / peak) * 100) + '% dari puncak 5 tahun.';
      }
      var pts = nX >= 2 ? 0 : (nX === 1 || nM >= 2) ? 6 : nM === 1 ? 11 : 15;
      add('B1', 'B', 'Stabilitas jumlah dokumen Scopus', pts, 15, 'Rasio tahunan: ' + parts.join(', ') + '.' + peakNote);
      if (surgeYtd) {
        red.push('R5: dokumen tahun berjalan (' + ytd + ') sudah ≥ 2x tahun penuh sebelumnya (' + docs[3] + '), padahal tahun belum selesai');
        steps.push('Tunda submit. Buka Scopus.com dan lihat tipe dokumen serta tanggal terbit tahun berjalan (artikel vs supplement/abstrak, volume ganda, terbitan beruntun). Bandingkan dengan jumlah di situs resmi.');
      }
      if (lowYtd) {
        yellow.push('K6: dokumen tahun berjalan (' + ytd + ') kurang dari 25% tahun penuh sebelumnya');
        steps.push('Indexing atau penerbitan mungkin melambat. Cek apakah issue terbaru sudah terbit dan masuk Scopus.');
      }
      if (collapse || surgeThenCollapse) {
        red.push('R3: jumlah dokumen runtuh' + (collapse ? ' (turun > 80% dalam setahun)' : ' setelah lonjakan > 2x'));
        steps.push('Buka Scopus.com dan hitung dokumen tahun berjalan. Jangan submit sebelum jelas apakah indexing masih berjalan.');
      } else if (nXyear >= 1) {
        yellow.push('K1: ada lonjakan atau penurunan ekstrem jumlah dokumen');
        steps.push('Cek komposisi tipe dokumen tahun yang melonjak di Scopus.com (artikel vs abstrak/supplement).');
      }
    }

    /* B2: web vs Scopus */
    var web = num(S.web), scp = num(S.scopus);
    if (web === null || scp === null || web <= 0) {
      add('B2', 'B', 'Jumlah dokumen website vs Scopus', null, 10, 'Isi jumlah dokumen website dan Scopus untuk tahun yang sama.');
    } else {
      var rr = scp / web;
      add('B2', 'B', 'Jumlah dokumen website vs Scopus', rr >= 0.8 ? 10 : rr >= 0.6 ? 6 : rr >= 0.4 ? 3 : 0,
        10, 'Scopus/web = ' + rr.toFixed(2) + ' (' + scp + ' dari ' + web + ').');
    }

    /* B3: self-citation */
    var sc = num(S.self), tc = num(S.total);
    if (sc === null || tc === null || tc <= 0) {
      add('B3', 'B', 'Self-citation', null, 10, 'Isi self cites dan total cites.');
    } else {
      var p = sc / tc * 100;
      add('B3', 'B', 'Self-citation', p <= 15 ? 10 : p <= 25 ? 7 : p <= 40 ? 3 : 0, 10, p.toFixed(1) + '% (' + sc + ' dari ' + tc + ').');
      if (p > 50) {
        yellow.push('K2: self-citation di atas 50%');
        steps.push('Self-citation tinggi mendongkrak metrik dan menjadi kriteria re-evaluasi Scopus. Pertimbangkan jurnal lain.');
      }
    }

    /* C1: waktu submit sampai accepted */
    var days = num(S.days);
    if (days === null) {
      add('C1', 'C', 'Waktu submit sampai accepted', null, 10, 'Belum ada data.');
    } else {
      add('C1', 'C', 'Waktu submit sampai accepted', days >= 42 ? 10 : days >= 28 ? 6 : 2, 10, days + ' hari.');
    }
    if ((days !== null && days < 28) || S.loa7) {
      yellow.push('K5: proses accepted tercatat terlalu cepat' + (S.loa7 ? ' (LOA ≤ 7 hari setelah review)' : ''));
      steps.push('Minta riwayat korespondensi dan tanggal LOA. Proses yang terlalu cepat adalah tanda review tidak wajar.');
    }

    /* C2: rekam jejak mahasiswa */
    var c2 = S.c2 || '';
    var c2m = { ge2: [10, 'Dua kasus atau lebih sudah terbit.'], one: [7, 'Satu kasus sudah terbit.'], wait: [3, 'Sudah submit, belum ada yang terbit (< 6 bulan).'], zero6: [0, 'Tiga kasus atau lebih submit > 6 bulan tanpa terbit.'] };
    if (!c2 || !c2m[c2]) {
      add('C2', 'C', 'Rekam jejak terbit nyata', null, 10, 'Belum ada data.');
    } else {
      add('C2', 'C', 'Rekam jejak terbit nyata', c2m[c2][0], 10, c2m[c2][1]);
      if (c2 === 'zero6') {
        red.push('R4: ≥ 3 kasus submit > 6 bulan tanpa terbit');
        steps.push('Jangan jadikan jurnal utama. Peluang terbit nyata terlalu kecil untuk tenggat mahasiswa.');
      }
    }

    /* C3: kontinuitas coverage (otomatis dari Source List) */
    var ci = rec ? coverageInfo(rec.cov) : null;
    if (!ci) {
      add('C3', 'C', 'Kontinuitas coverage', null, 5, rec ? 'Coverage tidak tercatat.' : 'Tidak ada data coverage.');
    } else if (ci.maxY > LIST_YEAR) {
      add('C3', 'C', 'Kontinuitas coverage', 2, 5, 'Coverage sampai ' + ci.maxY + ', melewati tahun edisi list (' + LIST_YEAR + ').');
      yellow.push('K3: coverage Scopus melewati tahun berjalan (' + ci.maxY + ')');
      steps.push('Buka daftar isi di situs resmi dan cek tanggal terbit tiap issue. Coverage lebih maju dari kalender tidak wajar.');
    } else if (ci.recentGaps.length) {
      add('C3', 'C', 'Kontinuitas coverage', 3, 5, 'Ada jeda coverage pada ' + ci.recentGaps.join(', ') + '.');
    } else if (ci.maxY === LIST_YEAR) {
      add('C3', 'C', 'Kontinuitas coverage', 5, 5, 'Coverage sampai ' + ci.maxY + ' tanpa jeda.');
    } else if (ci.maxY === LIST_YEAR - 1) {
      add('C3', 'C', 'Kontinuitas coverage', 3, 5, 'Coverage berhenti di ' + ci.maxY + '; belum ada terbitan ' + LIST_YEAR + ' yang terindeks.');
    } else {
      add('C3', 'C', 'Kontinuitas coverage', 1, 5, 'Coverage berhenti di ' + ci.maxY + '.');
    }

    var got = 0, avail = 0;
    rows.forEach(function (r) { if (r.pts !== null) { got += r.pts; avail += r.max; } });
    var score = avail ? Math.round(got / avail * 100) : 0;
    var complete = avail >= 70;

    var key;
    if (red.length) key = 'merah';
    else if (score < 60) key = 'merah';
    else if (score < 80 || yellow.length) key = 'kuning';
    else key = 'hijau';
    var inconclusive = !complete && !red.length;

    if (key === 'merah' && !red.length) steps.unshift('Skor di bawah 60. Cari jurnal alternatif.');

    return { rows: rows, got: got, avail: avail, score: score, complete: complete, inconclusive: inconclusive, key: key, red: red, yellow: yellow, steps: steps };
  }


  /* Parser teks halaman Scimago (hasil Ctrl+A, Ctrl+C di halaman jurnal) */
  function parseScimago(text) {
    var t = String(text || '').replace(/\r/g, '');
    var out = { found: false, quartile: '', base: null, docs: ['', '', '', ''], peak: '', self: '', total: '', issns: [], notes: [] };
    var m = t.match(/SJR\s+(\d{4})\s+[\d.,]+\s+(Q[1-4])\b/) || t.match(/\((Q[1-4]),\s*\d{4}\)/);
    if (m) { out.quartile = m[2] && /^Q/.test(m[2]) ? m[2] : m[1]; out.found = true; }
    var ib = t.match(/\nISSN\s*\n([^\n]+)/);
    if (ib) out.issns = (ib[1].replace(/-/g, '').match(/\d{7}[\dXx]/g) || []).map(function (x) { return x.toUpperCase(); });
    var db = t.match(/Year\s*\tDocuments\s*\n((?:\d{4}\t\d+[ \t]*(?:\n|$))+)/);
    if (db) {
      var byYear = {}, maxY = 0;
      db[1].split('\n').forEach(function (ln) {
        var x = ln.trim().match(/^(\d{4})\t(\d+)$/);
        if (x) { byYear[+x[1]] = +x[2]; if (+x[1] > maxY) maxY = +x[1]; }
      });
      if (maxY) {
        out.found = true; out.base = maxY;
        for (var i = 0; i < 4; i++) { var y = maxY - 3 + i; out.docs[i] = byYear[y] !== undefined ? String(byYear[y]) : ''; }
        if (out.docs.some(function (d) { return d === ''; })) out.notes.push('Data dokumen kurang dari 4 tahun; kolom yang kosong tidak dihitung.');
        var pk = 0;
        for (var yy = maxY - 5; yy < maxY; yy++) if (byYear[yy] !== undefined && byYear[yy] > pk) pk = byYear[yy];
        out.peak = pk ? String(pk) : '';
        var pick = function (label) {
          var re = new RegExp(label + '\\t(\\d{4})\\t(\\d+)', 'g'), r, best = null, any = null;
          while ((r = re.exec(t))) { if (+r[1] === maxY) best = r[2]; any = r; }
          return best !== null ? best : (any ? any[2] : '');
        };
        out.self = pick('Self Cites'); out.total = pick('Total Cites');
      }
    }
    return out;
  }

  var api = { parseScimago: parseScimago, evaluate: evaluate, parseCoverage: parseCoverage, coverageInfo: coverageInfo, LIST_YEAR: LIST_YEAR, LIST_LABEL: LIST_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PMULogic = api;
})(typeof window !== 'undefined' ? window : this);
