#!/usr/bin/env python3
"""Bangun dataset JSON untuk dashboard (peneliti, trg, tag) dari data/trg/*.csv.
Pemakaian: python3 scripts/trg_dashboard_data.py OUT_DIR [--tanpa-mahasiswa]
--tanpa-mahasiswa: untuk situs publik, buang orang yang hanya berperan Student (bukan ahli) dan hitung ulang jumlah per TRG."""
import csv, json, os, sys
D = "data/trg"; O = sys.argv[1]; os.makedirs(O, exist_ok=True)
R = lambda f: list(csv.DictReader(open(f"{D}/{f}.csv", encoding="utf-8")))
trg, unik, tt, tags, lap = R("trg"), R("peneliti_unik"), R("trg_tag_tier1"), R("tag_tier1"), R("laporan_kelengkapan")
tname = {t["tag_id"]: t["nama_id"] for t in tags}
tmap = {r["slug"]: [x for x in r["tag_ids"].split(";") if x] for r in tt}
tinfo = {t["slug"]: t for t in trg}
lapd = {r["slug"]: r for r in lap}
KL = {"Agro Complex": "Agro", "Social Science": "Sosial", "Science and Engineering": "Sains-Teknik",
      "Medical and Health Science": "Kesehatan", "Vocational": "Vokasi", "Multidisciplinary": "Multidisiplin"}
ROLE = {"leader": "Leader", "lecturers": "Lecturer", "lecturer": "Lecturer", "researchers": "Researcher",
        "researcher": "Researcher", "students": "Student", "student": "Student",
        "external collaborators": "External collaborator", "external collaborator": "External collaborator"}
MASALAH = {"tanpa_halaman_situs": "Belum punya halaman TRG", "halaman_tim_404": "Halaman tim tidak ada", "tim_tidak_terbaca_(tata_letak_lain_atau_kosong)": "Tim tidak terbaca",
           "tanpa_publikasi": "Tanpa publikasi", "tanpa_proyek": "Tanpa proyek", "keahlian_<50%": "Keahlian <50%",
           "ID_peneliti_<30%": "ID peneliti <30%"}
short = lambda n: n.replace(" Research Group", "").strip()

def dedupe(items):
    seen, out = set(), []
    for x in items:
        k = x.strip().lower()
        if k and k not in seen:
            seen.add(k); out.append(x.strip())
    return out

pen = []
for u in unik:
    slugs = [s for s in u["trg_slugs"].split(";") if s]
    tids = sorted({t for s in slugs for t in tmap.get(s, [])})
    ids = []
    if u["sinta_id"]: ids.append("SINTA " + u["sinta_id"])
    if u["scopus_id"]: ids.append("Scopus " + u["scopus_id"])
    if u["orcid"]: ids.append("ORCID " + u["orcid"])
    peran = dedupe([ROLE.get(r.strip().lower(), r.strip()) for r in u["peran"].split(";")])
    pen.append(dict(id=u["peneliti_id"], nama=u["nama"], peran=" · ".join(peran), ketua_di=u["ketua_di"], trg_slugs=u["trg_slugs"],
        trg=" · ".join(short(tinfo[s]["nama"]) for s in slugs), trg_n=len(slugs),
        klaster=" · ".join(sorted({KL.get(tinfo[s]["klaster"], tinfo[s]["klaster"]) for s in slugs})),
        tag_ids=";".join(tids), tag=" · ".join(tname[t] for t in tids),
        keahlian="; ".join(dedupe(u["keahlian_bersih"].split(" | "))), id_peneliti=" · ".join(ids),
        orcid=u["orcid"], sinta_id=u["sinta_id"], scopus_id=u["scopus_id"]))
lead = {}
for u in unik:
    for sl in [x for x in u["ketua_slugs"].split(";") if x]:
        lead.setdefault(sl, []).append(u["nama"])
tr = []
for t in trg:
    l = lapd[t["slug"]]
    tr.append(dict(slug=t["slug"], nama=short(t["nama"]), fakultas=t["fakultas"].replace("Faculty of ", "").replace("School of ", ""),
        klaster=KL.get(t["klaster"], t["klaster"]), tag=" · ".join(tname[x] for x in tmap[t["slug"]]), tag_ids=";".join(tmap[t["slug"]]),
        n_peneliti=int(t["n_peneliti"]), pct_keahlian=int(l["pct_keahlian"]), pct_id=int(l["pct_punya_ID"]),
        n_publikasi=int(t["n_publikasi"]), n_buku=int(t["n_buku"]), n_paten=int(t["n_paten"]), n_proyek=int(t["n_proyek"]),
        masalah=" · ".join(MASALAH[m] for m in l["masalah"].split(";") if m), url=t["url"],
        ketua=" · ".join(lead.get(t["slug"], []))))
tg = []
for t in tags:
    tid = t["tag_id"]; slugs = [s for s, v in tmap.items() if tid in v]
    tg.append(dict(tag_id=tid, nama=t["nama_id"], name_en=t["name_en"], klaster=t["klaster"], n_trg=len(slugs),
        n_peneliti=sum(1 for p in pen if tid in p["tag_ids"].split(";")),
        n_publikasi=sum(int(tinfo[s]["n_publikasi"]) for s in slugs)))
if "--tanpa-mahasiswa" in sys.argv:
    only_student = lambda p: p["peran"].strip().lower() in ("student",)
    pen = [p for p in pen if not only_student(p)]
    cnt = {}
    for p in pen:
        for sl in p["trg_slugs"].split(";"):
            if sl: cnt[sl] = cnt.get(sl, 0) + 1
    for t in tr:
        t["n_peneliti"] = cnt.get(t["slug"], 0)
    for g in tg:
        g["n_peneliti"] = sum(1 for p in pen if g["tag_id"] in p["tag_ids"].split(";"))
    meta_extra = {"n_peneliti": len(pen), "n_ketua": sum(1 for p in pen if p["ketua_di"])}
else:
    meta_extra = {}
import datetime
json.dump({"dibuat": datetime.date.today().isoformat(), "sumber": "Halaman publik trg.unhas.ac.id", "n_trg": len(tr), "n_peneliti": len(pen),
           "n_ketua": sum(1 for p in pen if p["ketua_di"]), "n_artikel": sum(t["n_publikasi"] for t in tr), **meta_extra},
          open(f"{O}/meta.json", "w", encoding="utf-8"), ensure_ascii=False)
for name, rows in (("peneliti", pen), ("trg", tr), ("tag", tg)):
    json.dump(rows, open(f"{O}/{name}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(name, len(rows), os.path.getsize(f"{O}/{name}.json"))
