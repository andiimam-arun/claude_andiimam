#!/usr/bin/env python3
"""Wawasan untuk halaman publik: statistik tema (artikel unik, tren), jaringan tema, dan kata kunci riset.

Pemakaian: python3 scripts/trg_insights.py [SITE_DATA_DIR]   (default site/peta-riset/data)
Jalankan setelah: trg_dashboard_data.py SITE_DATA_DIR --tanpa-mahasiswa
Menulis insights.json, memperbarui meta.json (jumlah artikel unik), dan membuat ulang peta-data.js.

Catatan metodologi: ukuran = jumlah artikel unik yang tercatat di halaman TRG (judul dinormalkan, artikel yang sama di
beberapa TRG dihitung sekali). Ini ukuran aktivitas riset tercatat, bukan mutu atau dampak.
"""
import csv, itertools, json, os, re, sys, collections as C

D = "data/trg"
O = sys.argv[1] if len(sys.argv) > 1 else "site/peta-riset/data"
R = lambda f: list(csv.DictReader(open(f"{D}/{f}.csv", encoding="utf-8")))
J = lambda n: json.load(open(f"{O}/{n}.json", encoding="utf-8"))
people, trg, tag = J("peneliti"), J("trg"), J("tag")
tmap = {r["slug"]: [x for x in r["tag_ids"].split(";") if x] for r in R("trg_tag_tier1")}
tinfo = {t["slug"]: t for t in trg}
klaster_of_tag = {g["tag_id"]: g["klaster"] for g in tag}

# ---------- artikel unik ----------
norm = lambda t: re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()
arts = {}
for r in R("publikasi"):
    k = norm(r["judul"])
    if len(k) < 12:
        continue
    a = arts.setdefault(k, dict(judul=r["judul"], slugs=set(), tahun=None))
    a["slugs"].add(r["trg_slug"])
    if a["tahun"] is None and r["tahun"].isdigit() and 2000 <= int(r["tahun"]) <= 2026:
        a["tahun"] = int(r["tahun"])
art = list(arts.values())

# ---------- statistik per tema ----------
st = {g["tag_id"]: dict(id=g["tag_id"], n_artikel=0) for g in tag}
for a in art:
    tema = {t for s in a["slugs"] for t in tmap.get(s, [])}
    for t in tema:
        st[t]["n_artikel"] += 1
# Tren per tahun sengaja tidak dihitung: halaman TRG baru diisi sejak program TRG (2025-2026), sehingga artikel
# terbaru tercatat jauh lebih lengkap daripada yang lama dan "pertumbuhan" akan menyesatkan.

# ---------- jaringan: peneliti bersama ----------
edge = C.Counter()
for p in people:
    ts = sorted(p["tag_ids"].split(";")) if p["tag_ids"] else []
    for a, b in itertools.combinations(ts, 2):
        edge[(a, b)] += 1
edges = [[a, b, n] for (a, b), n in edge.most_common() if n >= 3]

# ---------- kata kunci ----------
STOP = set("""the of and in on for to a an with by from at as is are was were be this that these those using use based study studies analysis effect effects
impact approach evaluation assessment case development potential application applications south sulawesi indonesia indonesian makassar new its their between
among through during into under over vol no pp journal dan di ke dari yang untuk pada dengan dalam terhadap oleh atau sebagai antara analisis pengaruh studi kajian
penerapan pengembangan berbasis melalui serta kota kabupaten provinsi selatan model system systems method methods performance quality management how what factors
factor role review after before within other not can may more most also two one three towards toward via our non used results different level levels growth rate
rates production value area areas data information network research regency city district province island local characteristics influence relationship against
patients patient literature systematic effectiveness behavior activity distribution detection control treatment properties social sustainable community risk
water extract implementation process identification status changes index high west time novel type small combination enhancing technology comparative conditions
change early north east strategy design comparison perspective family national evidence support human integrated public work state students knowledge response
estimation optimization correlation investigation characterization stability formation strength monitoring global population regional delivery vitro physical acid
blood power hybrid natural green waters care security capital rats stress satisfaction environment families village centers center university universitas
indonesia's among without toward towards based using effect between impact analysis hasanuddin
characteristic property propertie dynamic dynamics condition service services student implication practice practices product products concentration hospital
specie factor aspect application approach increase increased improving improvement toward role relation relations difference differences comparison effectively
program parameter variable profile function pattern solution utilization improve integration life modified surface structure space industry variety
school clinical modified model application factor level various several effective efficient""".split())
BAD_BIGRAM = {"hasanuddin university", "type diabetes", "small medium", "medium enterprises", "linear canonical", "anisotropic functionally",
              "frugiperda smith", "bantimurung bulusaraung", "bulusaraung national", "health center", "lepidoptera noctuidae", "nusa tenggara",
              "elementary school", "older people", "functionally graded", "graded materials", "vascular streak", "streak dieback", "dieback disease"}
ID2EN = {"kakao": "cocoa", "kopi": "coffee", "padi": "rice", "jagung": "corn", "udang": "shrimp", "kepiting": "crab", "ikan": "fish", "hukum": "law",
         "gizi": "nutrition", "kesehatan": "health", "tanah": "soil", "lahan": "land", "hama": "pest", "penyakit": "disease", "ekonomi": "economic",
         "akuntansi": "accounting", "keuangan": "financial", "pendidikan": "education", "budaya": "culture", "lingkungan": "environmental",
         "energi": "energy", "sampah": "waste", "banjir": "flood", "gempa": "earthquake", "pesisir": "coastal", "iklim": "climate", "pariwisata": "tourism",
         "pangan": "food", "hutan": "forest", "tanaman": "plant", "perempuan": "women", "anak": "children", "kanker": "cancer", "ibu": "maternal"}
EN2ID = {"cocoa": "kakao", "coffee": "kopi", "rice": "padi", "corn": "jagung", "shrimp": "udang", "crab": "kepiting", "fish": "ikan", "law": "hukum",
         "nutrition": "gizi", "health": "kesehatan", "soil": "tanah", "land": "lahan", "disease": "penyakit", "economic": "ekonomi", "accounting": "akuntansi",
         "financial": "keuangan", "education": "pendidikan", "culture": "budaya", "environmental": "lingkungan", "energy": "energi", "waste": "sampah",
         "flood": "banjir", "earthquake": "gempa", "coastal": "pesisir", "climate": "iklim", "tourism": "pariwisata", "food": "pangan", "forest": "hutan",
         "plant": "tanaman", "women": "perempuan", "children": "anak", "cancer": "kanker", "tuberculosis": "tuberkulosis", "tuna": "tuna",
         "coral reef": "terumbu karang", "climate change": "perubahan iklim", "food security": "ketahanan pangan", "breast cancer": "kanker payudara",
         "pregnant women": "ibu hamil", "remote sensing": "penginderaan jauh", "seaweed": "rumput laut", "mangrove": "mangrove", "diabetes": "diabetes",
         "cardiovascular": "kardiovaskular", "machine learning": "pembelajaran mesin", "renewable": "terbarukan", "wound healing": "penyembuhan luka"}


def toks(t):
    out = []
    for w in re.findall(r"[a-zA-Z][a-zA-Z\-]{3,}", t.lower()):
        w = w.strip("-")
        w = ID2EN.get(w, w)
        if w in STOP:
            continue
        if w == "species":
            pass
        elif w.endswith("ies") and len(w) > 5:
            w = w[:-3] + "y"
        elif w.endswith("s") and not w.endswith(("ss", "us", "is", "ics")) and len(w) > 5:
            w = w[:-1]
        if w not in STOP and len(w) > 3:
            out.append(w)
    return out


uni, bi, where = C.Counter(), C.Counter(), C.defaultdict(C.Counter)
tema_of = C.defaultdict(C.Counter)
for a in art:
    w = toks(a["judul"])
    tm = {t for s in a["slugs"] for t in tmap.get(s, [])}
    keys = set(w) | {" ".join(x) for x in zip(w, w[1:])}
    for k in keys:
        (bi if " " in k else uni)[k] += 1
        for s in a["slugs"]:
            where[k][s] += 1
        for t in tm:
            tema_of[k][t] += 1
sel = {}
for k, c in uni.items():
    if c >= 9 and len(where[k]) >= 2:
        sel[k] = c
for k, c in bi.items():
    if c >= 9 and len(where[k]) >= 3 and k not in BAD_BIGRAM and not any(p in STOP for p in k.split()):
        sel[k] = c
for k in [k for k in sel if " " in k]:           # buang kata tunggal yang hampir seluruhnya berasal dari frasa
    for part in k.split():
        if part in sel and sel[k] >= 0.6 * sel[part]:
            sel.pop(part, None)
kw = []
for k, c in sorted(sel.items(), key=lambda kv: -kv[1])[:72]:
    kl = C.Counter()
    for t, n in tema_of[k].items():
        kl[klaster_of_tag[t]] += n
    kw.append(dict(t=k, id=EN2ID.get(k, ""), n=c, n_trg=len(where[k]), klaster=kl.most_common(1)[0][0] if kl else "",
                   slugs=[s for s, _ in where[k].most_common(30)], tema=[t for t, _ in tema_of[k].most_common(3)]))

yrs = [a["tahun"] for a in art if a["tahun"]]
ins = dict(n_artikel_unik=len(art), n_dengan_tahun=len(yrs), tahun_min=min(yrs), tahun_maks=max(yrs), tema=list(st.values()), edges=edges, keywords=kw)
json.dump(ins, open(f"{O}/insights.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

meta = J("meta")
meta["n_artikel"] = len(art)
json.dump(meta, open(f"{O}/meta.json", "w", encoding="utf-8"), ensure_ascii=False)
bundle = {n: J(n) for n in ("peneliti", "trg", "tag", "meta", "insights")}
with open(f"{O}/peta-data.js", "w", encoding="utf-8") as fh:
    fh.write("/* dibuat oleh scripts/trg_dashboard_data.py dan scripts/trg_insights.py; jangan disunting manual */\nwindow.PETA_DATA = ")
    json.dump(bundle, fh, ensure_ascii=False, separators=(",", ":"))
    fh.write(";\n")
print("artikel unik", len(art), "| tema", len(st), "| edges", len(edges), "| kata kunci", len(kw))
print("TOP:", ", ".join(f"{k['t']} {k['n']}/{k['n_trg']}" for k in kw[:60]))
