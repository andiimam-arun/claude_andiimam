#!/usr/bin/env python3
"""Hitung artikel jurnal Unhas per kuartil (Q1-Q4): jurnal dari OpenAlex, kuartil dari berkas SCImago (SJR) yang Anda sediakan.

OpenAlex TIDAK memuat kuartil. Kuartil berasal dari SJR (SCImago Journal Rank); unduh berkas tahunan gratis dari scimagojr.com
(Journal Rankings > Download data; format CSV bertitik koma) lalu berikan dengan --sjr TAHUN=BERKAS (boleh berulang).

Pemakaian:
  OPENALEX_API_KEY=... python3 scripts/trg_kuartil.py --cache CACHE [--out data/openalex] [--dari 2020 --sampai 2025] [--sjr 2024=scimagojr_2024.csv ...]
Keluaran:
  <out>/jurnal_unhas.csv   tahun, jurnal (OpenAlex), ISSN, jumlah artikel (selalu dibuat)
  <out>/kuartil_unhas.csv  tahun, Q1, Q2, Q3, Q4, tanpa kuartil (hanya bila --sjr diberikan)
  <out>/jurnal_tanpa_kuartil.csv  jurnal terbanyak yang tidak ditemukan di SJR (untuk diperiksa)
Aturan: tahun publikasi memakai berkas SJR tahun yang sama; bila tidak ada, berkas tahun terdekat sebelumnya (atau yang paling awal).
Satuan: artikel dengan minimal satu penulis berafiliasi Unhas (hitung utuh, bukan pecahan), jenis sumber = jurnal.
"""
import argparse, csv, importlib.util, os, re, sys, collections as C

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_enrich", os.path.join(HERE, "trg_enrich.py")); E = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(E)
issn_norm = lambda s: re.sub(r"[^0-9X]", "", (s or "").upper())


def journals_year(inst, year, cache):
    """Hitung artikel per jurnal lewat penelusuran karya (group_by OpenAlex dibatasi 200 baris, tidak cukup bagi Unhas).
    -> ([(source_id, nama, jumlah)], {source_id: {issn}})"""
    cnt, names, issns, cursor = C.Counter(), {}, {}, "*"
    while cursor:
        d = E.get_json(E.q(E.OA, "/works", filter=f"authorships.institutions.id:{inst},publication_year:{year},primary_location.source.type:journal,type:article|review",
                           **{"per-page": 200, "cursor": cursor, "select": "id,primary_location"}), cache)
        if not d or "results" not in d:
            sys.exit(f"Respons tidak terbaca (tahun {year}): {str(d)[:200]}")
        for w in d["results"]:
            src = (w.get("primary_location") or {}).get("source") or {}
            sid = (src.get("id") or "").rsplit("/", 1)[-1]
            if not sid: continue
            cnt[sid] += 1; names[sid] = src.get("display_name") or ""
            issns[sid] = {issn_norm(x) for x in ([src.get("issn_l")] + (src.get("issn") or [])) if x}
        cursor = (d.get("meta") or {}).get("next_cursor") if d["results"] else None
    return [(sid, names[sid], n) for sid, n in cnt.most_common()], issns


def load_sjr(path):
    """-> {issn_norm: 'Q1'..'Q4'}. Kolom SCImago: 'Issn' (bisa dua, dipisah koma), 'SJR Best Quartile'."""
    m = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh, delimiter=";"):
            q = (r.get("SJR Best Quartile") or "").strip()
            if q in ("Q1", "Q2", "Q3", "Q4"):
                for i in (r.get("Issn") or "").split(","):
                    if issn_norm(i): m[issn_norm(i)] = q
    return m


def pick(sjr, year):
    ys = sorted(sjr); prev = [y for y in ys if y <= year]
    return sjr[prev[-1] if prev else ys[0]]


def quartiles(rows, issns, sjr):
    """rows: [(tahun, source_id, nama, n)] -> (hitung[tahun][Qx|'-'], tidak_ketemu[(source,nama)] -> n)"""
    cnt, miss = C.defaultdict(C.Counter), C.Counter()
    for y, sid, nama, n in rows:
        m = pick(sjr, y); q = next((m[i] for i in sorted(issns.get(sid, ())) if i in m), None)
        cnt[y][q or "-"] += n
        if not q: miss[(sid, nama)] += n
    return cnt, miss


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/openalex")
    ap.add_argument("--institution", default="I98301867"); ap.add_argument("--dari", type=int, default=2020); ap.add_argument("--sampai", type=int, default=2025)
    ap.add_argument("--sjr", action="append", default=[], metavar="TAHUN=BERKAS")
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    rows, issns = [], {}
    for y in range(a.dari, a.sampai + 1):
        got, iss = journals_year(a.institution, y, a.cache); issns.update(iss); rows += [(y, s, n_, c) for s, n_, c in got]; print(y, len(got), "jurnal,", sum(c for _, _, c in got), "artikel", flush=True)
    with open(f"{a.out}/jurnal_unhas.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["tahun", "source_id", "jurnal", "issn", "artikel"])
        for y, sid, nama, n in sorted(rows, key=lambda r: (r[0], -r[3])): w.writerow([y, sid, nama, ";".join(sorted(issns.get(sid, ()))), n])
    if not a.sjr:
        print("Berkas SJR belum diberikan: kuartil belum dihitung. Tabel jurnal ada di", f"{a.out}/jurnal_unhas.csv"); return
    sjr = {}
    for spec in a.sjr:
        y, p = spec.split("=", 1); sjr[int(y)] = load_sjr(p); print(f"SJR {y}: {len(sjr[int(y)])} ISSN")
    cnt, miss = quartiles(rows, issns, sjr)
    with open(f"{a.out}/kuartil_unhas.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["tahun", "Q1", "Q2", "Q3", "Q4", "tanpa_kuartil", "total"])
        for y in sorted(cnt): c = cnt[y]; w.writerow([y, c["Q1"], c["Q2"], c["Q3"], c["Q4"], c["-"], sum(c.values())])
    with open(f"{a.out}/jurnal_tanpa_kuartil.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["source_id", "jurnal", "artikel"]); [w.writerow([s, n_, c]) for (s, n_), c in miss.most_common(100)]
    tot = sum(sum(c.values()) for c in cnt.values()); q12 = sum(c["Q1"] + c["Q2"] for c in cnt.values())
    print(f"Q1+Q2 = {q12} dari {tot} artikel jurnal ({round(100 * q12 / max(1, tot))}%); rincian di {a.out}/kuartil_unhas.csv")


if __name__ == "__main__":
    main()
