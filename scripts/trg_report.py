#!/usr/bin/env python3
"""Laporan kelengkapan per TRG dari data/trg/*.csv -> data/trg/laporan_kelengkapan.csv"""
import csv, collections as C
D = "data/trg"
R = lambda f: list(csv.DictReader(open(f"{D}/{f}.csv", encoding="utf-8")))
trg, pen, log = R("trg"), R("peneliti"), R("crawl_log")
st = {(r["trg_slug"], r["bagian"]): r["status_http"] for r in log if r["halaman"] == "1"}
by = C.defaultdict(list)
for p in pen:
    by[p["trg_slug"]].append(p)
rows = []
for t in trg:
    ps = by[t["slug"]]
    n = len(ps)
    pct = lambda c: round(100 * sum(1 for p in ps if p[c].strip()) / n) if n else 0
    idpct = round(100 * sum(1 for p in ps if p["scopus_id"] or p["orcid"] or p["sinta_id"]) / n) if n else 0
    flags = []
    if t.get("catatan") in ("tanpa_halaman", "situs_dipakai_bersama"): flags.append("tanpa_halaman_situs")
    elif st.get((t["slug"], "ourteam")) == "404": flags.append("halaman_tim_404")
    elif n == 0: flags.append("tim_tidak_terbaca_(tata_letak_lain_atau_kosong)")
    if t["n_publikasi"] == "0": flags.append("tanpa_publikasi")
    if t["n_proyek"] == "0": flags.append("tanpa_proyek")
    if n and pct("keahlian") < 50: flags.append("keahlian_<50%")
    if n and idpct < 30: flags.append("ID_peneliti_<30%")
    rows.append([t["klaster"], t["fakultas"], t["slug"], t["nama"], n, pct("keahlian"), idpct,
                 t["n_publikasi"], t["n_buku"], t["n_paten"], t["n_proyek"], ";".join(flags)])
rows.sort(key=lambda r: (-len(r[-1].split(";")) if r[-1] else 0, r[1], r[3]))
with open(f"{D}/laporan_kelengkapan.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["klaster", "fakultas", "slug", "nama", "n_peneliti", "pct_keahlian", "pct_punya_ID",
                "n_publikasi", "n_buku", "n_paten", "n_proyek", "masalah"])
    w.writerows(rows)
c = C.Counter(f for r in rows for f in (r[-1].split(";") if r[-1] else []))
print(len(rows), "TRG;", "TRG tanpa masalah:", sum(1 for r in rows if not r[-1]))
for k, v in c.most_common(): print(f"  {k}: {v}")
