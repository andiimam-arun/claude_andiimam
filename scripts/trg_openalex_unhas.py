#!/usr/bin/env python3
"""Tarik semua penulis berafiliasi Universitas Hasanuddin dari OpenAlex (langkah 2 pengayaan institusi).

Pemakaian:
  OPENALEX_API_KEY=... BIBLIO_MAILTO=... python3 scripts/trg_openalex_unhas.py --cache CACHE_DIR [--out data/openalex]
                                         [--institution I98301867] [--max-halaman N] [--semua-afiliasi]

Keluaran: <out>/penulis_unhas.csv  (satu baris per profil penulis OpenAlex)
          <out>/penarikan_log.csv  (jumlah, waktu, permintaan)
Default memakai afiliasi TERAKHIR (last_known_institutions): orang yang kini di Unhas. --semua-afiliasi juga mengambil yang pernah berafiliasi.
Kunci API wajib untuk penarikan penuh (kuota tanpa kunci dibagi per IP). Data OpenAlex berlisensi CC0.
"""
import argparse, csv, importlib.util, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_enrich", os.path.join(HERE, "trg_enrich.py")); E = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(E)
FIELDS = "id,orcid,display_name,works_count,cited_by_count,summary_stats,topics,last_known_institutions,ids"
HEAD = ["openalex_author", "nama", "orcid", "scopus_id", "karya", "sitasi", "h_index", "i10_index", "bidang", "subbidang", "topik", "institusi_terakhir"]


def row(a):
    ss = a.get("summary_stats") or {}; tp = a.get("topics") or []
    uniq = lambda xs: list(dict.fromkeys(x for x in xs if x))
    sc = ((a.get("ids") or {}).get("scopus") or "")
    return dict(openalex_author=(a.get("id") or "").rsplit("/", 1)[-1], nama=a.get("display_name") or "",
                orcid=(a.get("orcid") or "").rsplit("/", 1)[-1], scopus_id=sc.split("authorId=")[-1] if "authorId=" in sc else "",
                karya=a.get("works_count", 0), sitasi=a.get("cited_by_count", 0), h_index=ss.get("h_index", ""), i10_index=ss.get("i10_index", ""),
                bidang=" | ".join(uniq((t.get("field") or {}).get("display_name") for t in tp)[:3]),
                subbidang=" | ".join(uniq((t.get("subfield") or {}).get("display_name") for t in tp)[:3]),
                topik=" | ".join(uniq(t.get("display_name") for t in tp)[:5]),
                institusi_terakhir=" | ".join(i.get("display_name", "") for i in (a.get("last_known_institutions") or [])))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/openalex")
    ap.add_argument("--institution", default="I98301867"); ap.add_argument("--max-halaman", type=int, default=0); ap.add_argument("--semua-afiliasi", action="store_true")
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    flt = ("affiliations.institution.id:" if a.semua_afiliasi else "last_known_institutions.id:") + a.institution
    rows, cursor, page, total = [], "*", 0, None
    while cursor:
        d = E.get_json(E.q(E.OA, "/authors", filter=flt, **{"per-page": 200, "cursor": cursor, "select": FIELDS}), a.cache)
        if not d or "results" not in d:
            sys.exit(f"Respons tidak terbaca pada halaman {page + 1}: {str(d)[:200]}")
        total = total or (d.get("meta") or {}).get("count")
        rows += [row(x) for x in d["results"]]; page += 1
        cursor = (d.get("meta") or {}).get("next_cursor") if d["results"] else None
        print(f"halaman {page}: {len(rows)}/{total}", flush=True)
        if a.max_halaman and page >= a.max_halaman:
            break
    seen, uniq = set(), []
    for r in rows:
        if r["openalex_author"] and r["openalex_author"] not in seen:
            seen.add(r["openalex_author"]); uniq.append(r)
    with open(f"{a.out}/penulis_unhas.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=HEAD); w.writeheader(); w.writerows(uniq)
    lg = f"{a.out}/penarikan_log.csv"; new = not os.path.exists(lg)
    with open(lg, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new: w.writerow(["waktu", "institusi", "filter", "penulis", "total_openalex", "lengkap", "http", "cache"])
        w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), a.institution, flt.split(":")[0], len(uniq), total, int(not a.max_halaman or len(rows) >= (total or 0)), E.STATS["http"], E.STATS["cache"]])
    print(f"SELESAI: {len(uniq)} penulis -> {a.out}/penulis_unhas.csv")


if __name__ == "__main__":
    main()
