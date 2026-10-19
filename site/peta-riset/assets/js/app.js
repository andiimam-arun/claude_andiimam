/* Peta Riset Unhas: pencarian ahli, peta tema, daftar TRG. Tanpa pustaka luar. */
(function () {
  "use strict";
  var CFG = window.PETA_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var I18N = {
    id: {
      skip: "Lewati ke konten", back: "Kembali ke GloRI", eyebrow: "Global Research Institute · Universitas Hasanuddin",
      title: "Peta Riset Unhas", lede: "Temukan peneliti dan kelompok riset tematik (TRG) Universitas Hasanuddin berdasarkan nama, keahlian, dan tema riset.",
      searchLabel: "Cari ahli", searchPh: "Cari nama, keahlian, atau TRG: kakao, malaria, hukum pidana", searchBtn: "Cari",
      kTrg: "TRG", kPeople: "Peneliti", kLead: "Ketua TRG", kPapers: "Artikel tercatat",
      tabSearch: "Cari ahli", tabTheme: "Peta tema", tabTrg: "Daftar TRG", loading: "Memuat data…",
      fKlaster: "Klaster", fTema: "Tema", fLead: "Hanya ketua TRG", fId: "Punya ID peneliti", reset: "Atur ulang",
      allKlaster: "Semua klaster", allTema: "Semua tema", themeHead: "Peneliti menurut tema",
      themeNote: "Klik sebuah tema untuk melihat para penelitinya. Satu peneliti bisa masuk beberapa tema, jadi totalnya melebihi jumlah peneliti unik.",
      fTrg: "Cari TRG", fSort: "Urutkan", sName: "Nama", sPeople: "Jumlah peneliti", sPapers: "Jumlah artikel",
      disclaimer: "Data dikumpulkan otomatis dari halaman publik TRG dan dapat memuat kekeliruan atau ketinggalan. Peneliti dengan nama yang sama dapat tergabung secara keliru, dan keahlian yang kosong berarti belum dicantumkan di halaman TRG. Daftar ini memuat ketua, dosen, peneliti, dan kolaborator eksternal; mahasiswa tidak ditampilkan.",
      leaderOf: "Ketua TRG", trgLabel: "TRG", themeLabel: "Tema", noExpertise: "Keahlian belum dicantumkan di halaman TRG.",
      showing: function (a, b) { return "Menampilkan " + a + " dari " + b + " peneliti"; }, none: "Tidak ada peneliti yang cocok. Coba kata kunci lain atau longgarkan filter.",
      more: function (n) { return "Tampilkan " + n + " lagi"; }, people: "peneliti", trgs: "TRG", papers: "artikel", leader: "Ketua", faculty: "Fakultas",
      trgShowing: function (a) { return a + " TRG"; }, noLeader: "Ketua belum terbaca dari situs", moreChips: function (n) { return "+" + n + " lainnya"; },
      source: function (d, u) { return "Sumber: halaman publik " + u + ", dikumpulkan " + d + "."; },
      contact: function (e) { return "Koreksi data: " + e; }, contactNone: "Untuk koreksi data, hubungi pengelola GloRI.",
      loadErr: "Data tidak dapat dimuat. Pastikan folder data/ (berisi peta-data.js dan berkas JSON) ada di samping index.html."
    },
    en: {
      skip: "Skip to content", back: "Back to GloRI", eyebrow: "Global Research Institute · Hasanuddin University",
      title: "Unhas Research Map", lede: "Find researchers and Thematic Research Groups (TRGs) at Hasanuddin University by name, expertise, and research theme.",
      searchLabel: "Find an expert", searchPh: "Search name, expertise, or TRG: cocoa, malaria, criminal law", searchBtn: "Search",
      kTrg: "TRGs", kPeople: "Researchers", kLead: "TRG leaders", kPapers: "Recorded articles",
      tabSearch: "Find experts", tabTheme: "Theme map", tabTrg: "TRG directory", loading: "Loading data…",
      fKlaster: "Cluster", fTema: "Theme", fLead: "TRG leaders only", fId: "Has researcher ID", reset: "Reset",
      allKlaster: "All clusters", allTema: "All themes", themeHead: "Researchers by theme",
      themeNote: "Click a theme to see its researchers. A researcher can belong to several themes, so totals exceed the number of unique researchers.",
      fTrg: "Search TRGs", fSort: "Sort by", sName: "Name", sPeople: "Number of researchers", sPapers: "Number of articles",
      disclaimer: "Data are collected automatically from public TRG pages and may contain errors or omissions. Researchers with the same name may be merged incorrectly, and missing expertise means it is not listed on the TRG page. The list covers leaders, lecturers, researchers, and external collaborators; students are not shown.",
      leaderOf: "TRG leader", trgLabel: "TRG", themeLabel: "Themes", noExpertise: "Expertise not listed on the TRG page.",
      showing: function (a, b) { return "Showing " + a + " of " + b + " researchers"; }, none: "No matching researchers. Try other keywords or loosen the filters.",
      more: function (n) { return "Show " + n + " more"; }, people: "researchers", trgs: "TRGs", papers: "articles", leader: "Leader", faculty: "Faculty",
      trgShowing: function (a) { return a + " TRGs"; }, noLeader: "Leader not yet read from the site", moreChips: function (n) { return "+" + n + " more"; },
      source: function (d, u) { return "Source: public pages of " + u + ", collected " + d + "."; },
      contact: function (e) { return "Data corrections: " + e; }, contactNone: "For data corrections, contact the GloRI administrators.",
      loadErr: "Data could not be loaded. Make sure the data/ folder (containing peta-data.js and the JSON files) sits next to index.html."
    }
  };
  var KLASTER_EN = { "Agro": "Agro", "Sosial": "Social Sciences", "Sains-Teknik": "Science & Engineering", "Kesehatan": "Health", "Vokasi": "Vocational", "Multidisiplin": "Multidisciplinary" };
  var KLASTER_COL = { "Agro": "var(--c-agro)", "Sosial": "var(--c-sosial)", "Sains-Teknik": "var(--c-sains)", "Kesehatan": "var(--c-kesehatan)" };
  var KLASTER_ORDER = ["Agro", "Sosial", "Sains-Teknik", "Kesehatan", "Vokasi", "Multidisiplin"];
  // Sinonim Indonesia <-> Inggris: data peneliti banyak berbahasa Inggris, pencari sering menulis Indonesia.
  var SYN_RAW = {
    kakao: ["cocoa", "cacao"], kopi: ["coffee"], padi: ["rice"], jagung: ["corn", "maize"], udang: ["shrimp"], kepiting: ["crab"], ikan: ["fish"],
    rumput: ["seaweed", "grass"], laut: ["marine", "sea", "ocean"], hukum: ["law", "legal"], pidana: ["criminal"], gizi: ["nutrition", "nutritional"],
    kesehatan: ["health"], masyarakat: ["community", "society", "public"], pertanian: ["agriculture", "agricultural"], peternakan: ["livestock", "animal"],
    hutan: ["forest"], kehutanan: ["forestry"], perikanan: ["fisheries", "fishery"], tanah: ["soil"], lahan: ["land"], hama: ["pest"], penyakit: ["disease"],
    ekonomi: ["economics", "economy"], akuntansi: ["accounting"], keuangan: ["finance", "financial"], bisnis: ["business"], pendidikan: ["education"],
    bahasa: ["language", "linguistics"], budaya: ["culture", "cultural"], lingkungan: ["environment", "environmental"], energi: ["energy"], listrik: ["electric", "electrical"],
    sampah: ["waste"], banjir: ["flood"], gempa: ["earthquake"], pesisir: ["coastal"], iklim: ["climate"], kecerdasan: ["intelligence"], buatan: ["artificial"],
    matematika: ["mathematics", "math"], statistika: ["statistics"], obat: ["drug", "pharmaceutical", "medicine"], farmasi: ["pharmacy", "pharmaceutical"],
    keperawatan: ["nursing"], gigi: ["dental", "dentistry"], kanker: ["cancer", "oncology"], jantung: ["cardiovascular", "heart"], anak: ["child", "pediatric"],
    ibu: ["maternal", "mother"], obesitas: ["obesity"], vaksin: ["vaccine"], tuberkulosis: ["tuberculosis"], perdamaian: ["peace"], konflik: ["conflict"],
    pemerintahan: ["government", "governance"], politik: ["political", "politics"], komunikasi: ["communication"], disabilitas: ["disability"], migrasi: ["migration"],
    pariwisata: ["tourism"], sejarah: ["history"], arkeologi: ["archaeology", "prehistoric"], manajemen: ["management"], pemasaran: ["marketing"], transportasi: ["transport", "transportation"],
    bangunan: ["building"], infrastruktur: ["infrastructure"], kapal: ["ship", "vessel"], bakteri: ["bacteria", "bacterial"], jamur: ["fungi", "fungal", "mycology"],
    serangga: ["insect", "entomology"], tanaman: ["plant", "crop"], buah: ["fruit"], sayur: ["vegetable", "horticulture"], pangan: ["food"], kemasan: ["packaging"], terumbu: ["reef"],
    karang: ["coral"], lamun: ["seagrass"], bakau: ["mangrove"], mangrove: ["bakau"], hiu: ["shark"], tuna: ["tuna"], lobster: ["lobster"], sapi: ["cattle", "beef"], susu: ["milk", "dairy"], ayam: ["poultry", "chicken"]
  };
  var SYN = {};
  Object.keys(SYN_RAW).forEach(function (k) {
    SYN[k] = (SYN[k] || []).concat(SYN_RAW[k]);
    SYN_RAW[k].forEach(function (e) { SYN[e] = (SYN[e] || []).concat([k]); });
  });
  var TABS = ["cari", "tema", "trg"];
  var PAGE = 24;

  var D = { people: [], trg: [], tag: [], meta: {} };
  var tagById = {}, trgBySlug = {}, haystack = [];
  var S = { lang: CFG.defaultLang === "en" ? "en" : "id", tab: "cari", q: "", klaster: "", tema: "", lead: false, hasId: false, limit: PAGE,
            tq: "", tk: "", tsort: "nama" };
  var T = function () { return I18N[S.lang]; };
  var fmt = function (n) { return new Intl.NumberFormat(S.lang === "en" ? "en" : "id-ID").format(n); };
  var norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
  var tagName = function (t) { return S.lang === "en" ? t.name_en : t.nama; };
  var klasterName = function (k) { return S.lang === "en" ? (KLASTER_EN[k] || k) : k; };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- URL state ---------- */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    if (p.get("lang") === "en" || p.get("lang") === "id") S.lang = p.get("lang");
    if (TABS.indexOf(p.get("tab")) >= 0) S.tab = p.get("tab");
    S.q = p.get("q") || ""; S.klaster = p.get("k") || ""; S.tema = p.get("t") || "";
    S.lead = p.get("l") === "1"; S.hasId = p.get("i") === "1";
    if (p.get("embed") === "1") document.body.classList.add("embed");
  }
  function writeUrl() {
    var p = new URLSearchParams(location.search), keep = p.get("embed");
    p = new URLSearchParams();
    if (S.lang !== (CFG.defaultLang || "id")) p.set("lang", S.lang);
    if (S.tab !== "cari") p.set("tab", S.tab);
    if (S.q) p.set("q", S.q); if (S.klaster) p.set("k", S.klaster); if (S.tema) p.set("t", S.tema);
    if (S.lead) p.set("l", "1"); if (S.hasId) p.set("i", "1"); if (keep) p.set("embed", keep);
    var qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* diabaikan */ }
  }

  /* ---------- teks antarmuka ---------- */
  function applyI18n() {
    var t = T();
    document.documentElement.lang = S.lang;
    $$("[data-i]").forEach(function (n) { if (typeof t[n.dataset.i] === "string") n.textContent = t[n.dataset.i]; });
    $$("[data-i-ph]").forEach(function (n) { n.placeholder = t[n.dataset.iPh]; });
    $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)); });
    document.title = (S.lang === "en" ? "Unhas Research Map" : "Peta Riset Unhas") + " | GloRI";
    $("#brand-link").href = CFG.homeUrl || "#"; $("#back-link").href = CFG.homeUrl || "#";
    var src = D.meta.dibuat ? t.source(D.meta.dibuat, (CFG.trgSiteUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "")) : "";
    $("#foot-src").textContent = src;
    $("#foot-contact").textContent = CFG.contactEmail ? t.contact(CFG.contactEmail) : t.contactNone;
  }

  /* ---------- KPI ---------- */
  function kpis() {
    var m = D.meta; if (!m.n_trg) return;
    $("#k-trg").textContent = fmt(m.n_trg); $("#k-people").textContent = fmt(m.n_peneliti);
    $("#k-lead").textContent = fmt(m.n_ketua); $("#k-papers").textContent = fmt(m.n_artikel);
  }

  /* ---------- filter dropdown ---------- */
  function fillSelects() {
    var t = T(), ks = $("#f-klaster"), ts = $("#f-tema"), tk = $("#t-klaster");
    var kl = KLASTER_ORDER.filter(function (k) { return D.trg.some(function (x) { return x.klaster === k; }); });
    var mk = function (sel, first) {
      var cur = sel.value; sel.replaceChildren(new Option(first, ""));
      kl.forEach(function (k) { sel.appendChild(new Option(klasterName(k), k)); }); sel.value = cur;
    };
    mk(ks, t.allKlaster); mk(tk, t.allKlaster);
    var cur = ts.value; ts.replaceChildren(new Option(t.allTema, ""));
    D.tag.forEach(function (g) { ts.appendChild(new Option(tagName(g) + " (" + g.n_peneliti + ")", g.tag_id)); });
    ts.value = cur;
    ks.value = S.klaster; ts.value = S.tema; tk.value = S.tk;
    $("#q").value = S.q; $("#f-lead").checked = S.lead; $("#f-id").checked = S.hasId; $("#t-sort").value = S.tsort;
  }

  /* ---------- pencarian ahli ---------- */
  function buildIndex() {
    haystack = D.people.map(function (p) {
      var tags = p.tag_ids ? p.tag_ids.split(";").map(function (id) { var g = tagById[id]; return g ? g.nama + " " + g.name_en : ""; }).join(" ") : "";
      return { all: norm([p.nama, p.ketua_di, p.keahlian, p.trg, tags].join(" ")), nama: norm(p.nama), keah: norm(p.keahlian), ketua: norm(p.ketua_di) };
    });
  }
  var cache = { key: "", rows: [] };
  function results() {
    var key = JSON.stringify([S.q, S.klaster, S.tema, S.lead, S.hasId]);
    if (cache.key === key) return cache.rows;
    var toks = norm(S.q).split(/\s+/).filter(Boolean), out = [];
    for (var i = 0; i < D.people.length; i++) {
      var p = D.people[i], h = haystack[i];
      if (S.klaster && p.klaster.split(" · ").indexOf(S.klaster) < 0) continue;
      if (S.tema && p.tag_ids.split(";").indexOf(S.tema) < 0) continue;
      if (S.lead && !p.ketua_di) continue;
      if (S.hasId && !(p.orcid || p.sinta_id || p.scopus_id)) continue;
      var s = 0, ok = true;
      for (var j = 0; j < toks.length; j++) {
        var alts = [toks[j]].concat(SYN[toks[j]] || []), best = -1;
        for (var a = 0; a < alts.length; a++) {
          var t = alts[a];
          if (h.all.indexOf(t) < 0) continue;
          var sc = (h.nama.indexOf(t) >= 0 ? 4 : 0) + (h.ketua.indexOf(t) >= 0 ? 2 : 0) + (h.keah.indexOf(t) >= 0 ? 2 : 1) - (a ? 0.5 : 0);
          if (sc > best) best = sc;
        }
        if (best < 0) { ok = false; break; }
        s += best;
      }
      if (!ok) continue;
      out.push([s + (p.ketua_di ? 1 : 0) + (p.keahlian ? 0.5 : 0) + (p.orcid || p.sinta_id || p.scopus_id ? 0.25 : 0), p]);
    }
    out.sort(function (a, b) { return b[0] - a[0] || a[1].nama.localeCompare(b[1].nama); });
    cache = { key: key, rows: out.map(function (x) { return x[1]; }) };
    return cache.rows;
  }

  function idLinks(p) {
    var box = el("div", "ids"), add = function (label, url) { var a = el("a", null, label); a.href = url; a.target = "_blank"; a.rel = "noopener"; box.appendChild(a); };
    if (p.sinta_id) add("SINTA", "https://sinta.kemdiktisaintek.go.id/authors/profile/" + encodeURIComponent(p.sinta_id));
    if (p.scopus_id) add("Scopus", "https://www.scopus.com/authid/detail.uri?authorId=" + encodeURIComponent(p.scopus_id));
    if (p.orcid) add("ORCID", "https://orcid.org/" + encodeURIComponent(p.orcid));
    return box.children.length ? box : null;
  }
  function chipList(label, items) {
    var wrap = el("div"); wrap.appendChild(el("p", "row-label", label));
    var ul = el("ul", "chips"); items.forEach(function (c) { var li = el("li"); li.appendChild(c); ul.appendChild(li); });
    wrap.appendChild(ul); return wrap;
  }
  function personCard(p) {
    var t = T(), li = el("li", "person");
    li.appendChild(el("h3", null, p.nama));
    if (p.ketua_di) li.appendChild(el("span", "badge", t.leaderOf + ": " + p.ketua_di));
    li.appendChild(el("p", p.keahlian ? "expertise" : "expertise none", p.keahlian || t.noExpertise));
    var slugs = (p.trg_slugs || "").split(";").filter(Boolean), chips = [];
    slugs.slice(0, 4).forEach(function (sl) {
      var g = trgBySlug[sl]; if (!g) return;
      var c = g.url ? el("a", "chip", g.nama) : el("span", "chip", g.nama);
      if (g.url) { c.href = g.url; c.target = "_blank"; c.rel = "noopener"; } chips.push(c);
    });
    if (slugs.length > 4) chips.push(el("span", "chip", t.moreChips(slugs.length - 4)));
    if (chips.length) li.appendChild(chipList(t.trgLabel, chips));
    var tg = (p.tag_ids || "").split(";").filter(Boolean).map(function (id) { return tagById[id]; }).filter(Boolean);
    if (tg.length) li.appendChild(chipList(t.themeLabel, tg.slice(0, 4).map(function (g) { return el("span", "chip theme", tagName(g)); })));
    var ids = idLinks(p); if (ids) li.appendChild(ids);
    return li;
  }
  function renderSearch() {
    var t = T(), rows = results(), shown = rows.slice(0, S.limit);
    $("#cards").replaceChildren.apply($("#cards"), shown.map(personCard));
    $("#count").textContent = rows.length ? t.showing(fmt(shown.length), fmt(rows.length)) : t.none;
    var more = $("#more"); more.hidden = rows.length <= S.limit;
    more.textContent = t.more(Math.min(PAGE, rows.length - S.limit));
  }

  /* ---------- peta tema ---------- */
  function renderTheme() {
    var rows = D.tag.slice().sort(function (a, b) { return b.n_peneliti - a.n_peneliti; }), max = rows[0] ? rows[0].n_peneliti : 1, t = T();
    var bars = $("#bars"); bars.replaceChildren.apply(bars, rows.map(function (g) {
      var b = el("button", "bar"); b.type = "button";
      b.appendChild(el("span", null, tagName(g)));
      var tr = el("span", "track"), f = el("span", "fill"); f.style.width = Math.max(1.5, 100 * g.n_peneliti / max) + "%"; f.style.background = KLASTER_COL[g.klaster] || "var(--c-lain)";
      tr.appendChild(f); b.appendChild(tr);
      b.appendChild(el("span", "num", fmt(g.n_peneliti) + " " + t.people + " · " + g.n_trg + " " + t.trgs));
      b.addEventListener("click", function () { S.q = ""; S.tema = g.tag_id; S.klaster = ""; S.limit = PAGE; $("#q").value = ""; $("#f-tema").value = g.tag_id; $("#f-klaster").value = ""; show("cari"); renderSearch(); window.scrollTo({ top: $("#main").offsetTop - 8 }); });
      return b;
    }));
    var lg = $("#legend"); lg.replaceChildren.apply(lg, KLASTER_ORDER.filter(function (k) { return KLASTER_COL[k]; }).map(function (k) {
      var s = el("span"), i = el("i"); i.style.background = KLASTER_COL[k]; s.append(i, document.createTextNode(klasterName(k))); return s;
    }));
  }

  /* ---------- daftar TRG ---------- */
  function renderTrg() {
    var t = T(), q = norm(S.tq), rows = D.trg.filter(function (g) {
      if (S.tk && g.klaster !== S.tk) return false;
      return !q || norm(g.nama + " " + g.fakultas + " " + g.ketua + " " + g.tag).indexOf(q) >= 0 || q.split(/\s+/).every(function (w) { return norm(g.nama + " " + g.fakultas + " " + g.ketua + " " + g.tag).indexOf(w) >= 0; });
    });
    rows.sort(function (a, b) { return S.tsort === "nama" ? a.nama.localeCompare(b.nama) : (b[S.tsort] - a[S.tsort]) || a.nama.localeCompare(b.nama); });
    $("#t-count").textContent = t.trgShowing(fmt(rows.length));
    var ul = $("#trg-list"); ul.replaceChildren.apply(ul, rows.map(function (g) {
      var li = el("li", "trg"), c1 = el("div"), h = el("h3");
      if (g.url) { var a = el("a", null, g.nama); a.href = g.url; a.target = "_blank"; a.rel = "noopener"; h.appendChild(a); } else h.textContent = g.nama;
      c1.appendChild(h); c1.appendChild(el("p", "sub", g.fakultas + " · " + klasterName(g.klaster))); li.appendChild(c1);
      var c2 = el("p", "lead"); c2.appendChild(el("b", null, t.leader)); c2.appendChild(document.createTextNode(g.ketua || t.noLeader)); li.appendChild(c2);
      var c3 = el("div"); var tags = (g.tag_ids || "").split(";").filter(Boolean).map(function (id) { return tagById[id]; }).filter(Boolean);
      if (tags.length) { var u = el("ul", "chips"); tags.forEach(function (x) { var l = el("li"); l.appendChild(el("span", "chip theme", tagName(x))); u.appendChild(l); }); c3.appendChild(u); }
      li.appendChild(c3);
      var st = el("div", "stat"), b1 = el("span"); b1.append(el("b", null, fmt(g.n_peneliti)), document.createTextNode(t.people));
      var b2 = el("span"); b2.append(el("b", null, fmt(g.n_publikasi)), document.createTextNode(t.papers)); st.append(b1, b2); li.appendChild(st);
      return li;
    }));
  }

  /* ---------- tab ---------- */
  function show(tab) {
    S.tab = tab;
    TABS.forEach(function (x) { $("#" + x).hidden = x !== tab; $("#tab-" + x).setAttribute("aria-selected", String(x === tab)); });
    writeUrl();
  }

  function renderAll() { applyI18n(); kpis(); fillSelects(); renderSearch(); renderTheme(); renderTrg(); writeUrl(); }

  function bind() {
    var debounce; $("#q").addEventListener("input", function (e) { clearTimeout(debounce); debounce = setTimeout(function () { S.q = e.target.value; S.limit = PAGE; renderSearch(); writeUrl(); }, 150); });
    $("#hero-form").addEventListener("submit", function (e) { e.preventDefault(); S.q = $("#q").value; S.limit = PAGE; show("cari"); renderSearch(); writeUrl(); $("#main").scrollIntoView(); });
    $("#f-klaster").addEventListener("change", function (e) { S.klaster = e.target.value; S.limit = PAGE; renderSearch(); writeUrl(); });
    $("#f-tema").addEventListener("change", function (e) { S.tema = e.target.value; S.limit = PAGE; renderSearch(); writeUrl(); });
    $("#f-lead").addEventListener("change", function (e) { S.lead = e.target.checked; S.limit = PAGE; renderSearch(); writeUrl(); });
    $("#f-id").addEventListener("change", function (e) { S.hasId = e.target.checked; S.limit = PAGE; renderSearch(); writeUrl(); });
    $("#f-reset").addEventListener("click", function () { Object.assign(S, { q: "", klaster: "", tema: "", lead: false, hasId: false, limit: PAGE }); fillSelects(); renderSearch(); writeUrl(); });
    $("#more").addEventListener("click", function () { S.limit += PAGE; renderSearch(); });
    $("#t-q").addEventListener("input", function (e) { S.tq = e.target.value; renderTrg(); });
    $("#t-klaster").addEventListener("change", function (e) { S.tk = e.target.value; renderTrg(); });
    $("#t-sort").addEventListener("change", function (e) { S.tsort = e.target.value; renderTrg(); });
    $$(".tab").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.tab); }); });
    $$(".lang button").forEach(function (b) { b.addEventListener("click", function () { S.lang = b.dataset.lang; renderAll(); }); });
  }

  function load(name) { return fetch("data/" + name + ".json").then(function (r) { if (!r.ok) throw new Error(name + " " + r.status); return r.json(); }); }
  // Data tertanam (data/peta-data.js) dipakai lebih dulu agar halaman bisa dibuka langsung dari berkas; bila tidak ada, ambil JSON lewat server.
  function loadAll() {
    var B = window.PETA_DATA;
    if (B && B.peneliti) return Promise.resolve([B.peneliti, B.trg, B.tag, B.meta]);
    return Promise.all([load("peneliti"), load("trg"), load("tag"), load("meta")]);
  }

  readUrl(); applyI18n(); bind(); show(S.tab);
  loadAll().then(function (r) {
    D.people = r[0]; D.trg = r[1]; D.tag = r[2]; D.meta = r[3];
    D.tag.forEach(function (g) { tagById[g.tag_id] = g; }); D.trg.forEach(function (g) { trgBySlug[g.slug] = g; });
    buildIndex(); $("#loadmsg").hidden = true; renderAll();
  }).catch(function (e) {
    $("#loadmsg").hidden = true; var m = $("#errmsg"); m.hidden = false; m.textContent = T().loadErr; if (window.console) console.error(e);
  });
})();
