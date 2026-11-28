#!/usr/bin/env python3
"""Kolaborasi internasional Unhas menurut negara (OpenAlex) untuk peta dunia dasbor.

Pemakaian:
  OPENALEX_API_KEY=... python3 scripts/trg_openalex_negara.py --cache CACHE_DIR [--site site/peta-riset/data] [--out data/openalex] [--dari 2020] [--min-karya 3]

Satuan: karya (artikel, prosiding, dll.) yang memuat minimal satu penulis berafiliasi Unhas DAN minimal satu penulis berafiliasi di negara itu.
Karya dengan 50 penulis atau lebih dikeluarkan agar konsorsium besar tidak menambah hitungan untuk puluhan negara sekaligus.
Satu karya dihitung sekali per negara, tetapi dapat dihitung di banyak negara, jadi angka antar-negara tidak boleh dijumlahkan.
Penulis berafiliasi ganda (asing yang mencantumkan Unhas sebagai afiliasi kedua) ikut terhitung: itu juga hubungan nyata, tetapi bukan berarti proyek bersama.
Keluaran: <out>/negara_kolaborasi.json dan <site>/kolaborasi.json
"""
import argparse, csv, datetime, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_enrich", os.path.join(HERE, "trg_enrich.py")); E = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(E)
INST = "I98301867"


def groups(cache, flt, key):
    d = E.get_json(E.q(E.OA, "/works", filter=flt, group_by=key, **{"per-page": 200}), cache)
    return [(g["key"].rsplit("/", 1)[-1], g.get("key_display_name", ""), g["count"]) for g in (d or {}).get("group_by", []) if g.get("key") and g["key"] != "unknown"]


def inst_country(cache, ids):
    out = {}
    for b in E.batches(sorted(ids), 50):
        d = E.get_json(E.q(E.OA, "/institutions", filter="openalex:" + "|".join(b), **{"per-page": 50, "select": "id,country_code,display_name"}), cache)
        for r in (d or {}).get("results", []):
            out[r["id"].rsplit("/", 1)[-1]] = (r.get("country_code") or "", r.get("display_name") or "")
    return out


WORK_FIELDS = "id,doi,title,publication_year,cited_by_count,primary_location,authorships,type"


def load_sjr(spec):
    """'2025=berkas.csv' -> {issn: 'Q1'..'Q4'} (SCImago, 'SJR Best Quartile')."""
    m = {}
    for r in csv.DictReader(open(spec.split("=", 1)[1], encoding="utf-8-sig", newline=""), delimiter=";"):
        q = (r.get("SJR Best Quartile") or "").strip()
        if q in ("Q1", "Q2", "Q3", "Q4"):
            for i in (r.get("Issn") or "").split(","):
                m[re.sub(r"[^0-9X]", "", i.upper())] = q
    return m


def works(cache, flt, sort, n, country, sjr):
    """Karya terpilih: judul, tahun, jurnal (+kuartil), sitasi, penulis Unhas, dan institusi mitra di negara itu."""
    d = E.get_json(E.q(E.OA, "/works", filter=flt, sort=sort, **{"per-page": n, "select": WORK_FIELDS}), cache)
    out = []
    for w in (d or {}).get("results", []):
        au = (w.get("authorships") or []); src = (w.get("primary_location") or {}).get("source") or {}
        issn = re.sub(r"[^0-9X]", "", (src.get("issn_l") or "").upper())
        unhas = [x["author"]["display_name"] for x in au if any((i.get("id") or "").endswith(INST) for i in x.get("institutions") or [])]
        mitra = []
        for x in au:
            if country in (x.get("countries") or []):
                for i in x.get("institutions") or []:
                    if i.get("country_code") == country and i.get("display_name") and i["display_name"] not in mitra:
                        mitra.append(i["display_name"])
        out.append(dict(id=(w.get("id") or "").rsplit("/", 1)[-1], doi=(w.get("doi") or "").replace("https://doi.org/", ""), t=(w.get("title") or "").strip(), y=w.get("publication_year") or 0,
                        c=w.get("cited_by_count") or 0, j=src.get("display_name") or "", q=sjr.get(issn, "") if w.get("type") in ("article", "review") else "",   # kuartil hanya untuk artikel/review, bukan pracetak atau set data
                         u=unhas[:3], m=mitra[:2]))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/openalex"); ap.add_argument("--site", default="site/peta-riset/data")
    ap.add_argument("--dari", type=int, default=2020); ap.add_argument("--min-karya", type=int, default=3); ap.add_argument("--inst-per-negara", type=int, default=8)
    ap.add_argument("--sjr", default="", metavar="TAHUN=BERKAS", help="berkas SCImago untuk lencana kuartil pada daftar karya (opsional)"); ap.add_argument("--karya-teratas", type=int, default=8); ap.add_argument("--karya-terbaru", type=int, default=5)
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True); os.makedirs(a.site, exist_ok=True)
    now = datetime.date.today().year; sjr = load_sjr(a.sjr) if a.sjr else {}
    base = f"authorships.institutions.id:{INST},authors_count:<50"
    allc = {c: (nm, n) for c, nm, n in groups(a.cache, base, "authorships.countries")}
    recc = {c: n for c, _, n in groups(a.cache, base + f",publication_year:{a.dari}-{now}", "authorships.countries")}
    home = allc.pop("ID", ("Indonesia", 0))
    keep = sorted(((c, v) for c, v in allc.items() if v[1] >= a.min_karya), key=lambda x: -x[1][1])
    rows = []
    for i, (c, (nm, n)) in enumerate(keep, 1):
        gi = [g for g in groups(a.cache, base + f",authorships.countries:{c}", "authorships.institutions.id") if g[0] != INST][:40]
        meta = inst_country(a.cache, [g[0] for g in gi])
        inst = [dict(id=g[0], nama=meta.get(g[0], ("", g[1]))[1] or g[1], n=g[2]) for g in gi if meta.get(g[0], ("",))[0] == c][:a.inst_per_negara]
        flt = base + f",authorships.countries:{c}"
        top = works(a.cache, flt, "cited_by_count:desc", a.karya_teratas, c, sjr); ids = {w["id"] for w in top}
        baru = [w for w in works(a.cache, flt, "publication_date:desc", a.karya_terbaru + 3, c, sjr) if w["id"] not in ids][:a.karya_terbaru]
        rows.append(dict(c=c, en=nm, n=n, r=recc.get(c, 0), inst=inst, top=top, baru=baru))
        if i % 20 == 0: print(f"{i}/{len(keep)} negara", flush=True)
    out = dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex (CC0)", institusi="Universitas Hasanuddin (I98301867)", dari=a.dari, karya_unhas=home[1],
               n_negara=len(rows), n_negara_semua=len(allc), negara=rows)
    json.dump(out, open(f"{a.out}/negara_kolaborasi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(out, open(f"{a.site}/kolaborasi.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} negara (dari {len(allc)} yang pernah berkolaborasi); teratas:", [(r['c'], r['n']) for r in rows[:6]])


if __name__ == "__main__":
    main()
