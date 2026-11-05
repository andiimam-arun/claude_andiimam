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
import argparse, datetime, importlib.util, json, os, sys

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


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/openalex"); ap.add_argument("--site", default="site/peta-riset/data")
    ap.add_argument("--dari", type=int, default=2020); ap.add_argument("--min-karya", type=int, default=3); ap.add_argument("--inst-per-negara", type=int, default=8)
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True); os.makedirs(a.site, exist_ok=True)
    now = datetime.date.today().year
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
        rows.append(dict(c=c, en=nm, n=n, r=recc.get(c, 0), inst=inst))
        if i % 20 == 0: print(f"{i}/{len(keep)} negara", flush=True)
    out = dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex (CC0)", institusi="Universitas Hasanuddin (I98301867)", dari=a.dari, karya_unhas=home[1],
               n_negara=len(rows), n_negara_semua=len(allc), negara=rows)
    json.dump(out, open(f"{a.out}/negara_kolaborasi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(out, open(f"{a.site}/kolaborasi.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} negara (dari {len(allc)} yang pernah berkolaborasi); teratas:", [(r['c'], r['n']) for r in rows[:6]])


if __name__ == "__main__":
    main()
