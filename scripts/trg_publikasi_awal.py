#!/usr/bin/env python3
"""Data awal untuk tab "Cari publikasi": daftar unggulan statis (cadangan saat OpenAlex tak terjangkau) dan peta ISSN -> kuartil jurnal.

Pemakaian:
  OPENALEX_API_KEY=... python3 scripts/trg_publikasi_awal.py --cache CACHE_DIR --sjr 2025=scimagojr_2025.csv [--out data/openalex] [--site site/peta-riset/data] [--dari 2020]
Keluaran: <out>/publikasi_awal.json dan <site>/publikasi.json
  terbanyak: 40 karya (artikel/review, kurang dari 50 penulis) paling banyak dikutip sejak --dari; terbaru: 25 karya terbaru
  kuartil:   {issn: 'Q1'..'Q4'} hanya untuk jurnal tempat Unhas menerbitkan (dari <out>/jurnal_unhas.csv); dipakai tab untuk lencana kuartil pada hasil pencarian langsung.
Tab pencarian sendiri memanggil API OpenAlex dari peramban pengunjung (lihat docs/PROXY_OPENALEX.md untuk memakai proxy peladen).
"""
import argparse, csv, datetime, importlib.util, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_negara", os.path.join(HERE, "trg_openalex_negara.py")); N = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(N)
E, INST = N.E, N.INST
FIELDS = "id,doi,title,publication_year,cited_by_count,type,open_access,primary_location,authorships"


def compact(w, sjr):
    src = (w.get("primary_location") or {}).get("source") or {}
    issn = re.sub(r"[^0-9X]", "", (src.get("issn_l") or "").upper())
    au = w.get("authorships") or []
    names = [(x["author"]["display_name"], int(any((i.get("id") or "").endswith(INST) for i in x.get("institutions") or []))) for x in au if x.get("author")]
    return dict(id=(w.get("id") or "").rsplit("/", 1)[-1], doi=(w.get("doi") or "").replace("https://doi.org/", ""), t=re.sub(r"<[^>]+>", "", w.get("title") or "").strip(),
                y=w.get("publication_year") or 0, c=w.get("cited_by_count") or 0, j=src.get("display_name") or "", ty=w.get("type") or "",
                oa=(w.get("open_access") or {}).get("oa_status") or "", q=sjr.get(issn, "") if w.get("type") in ("article", "review") else "",
                a=[[n, u] for n, u in names[:6]], na=len(names))


def pull(cache, flt, sort, n, sjr):
    d = E.get_json(E.q(E.OA, "/works", filter=flt, sort=sort, **{"per-page": n, "select": FIELDS}), cache)
    return [compact(w, sjr) for w in (d or {}).get("results", [])]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--sjr", default="", metavar="TAHUN=BERKAS", help="berkas SCImago; bila kosong, kuartil diambil dari data/trg/artikel_kuartil.csv (hanya jurnal artikel TRG)")
    ap.add_argument("--out", default="data/openalex"); ap.add_argument("--site", default="site/peta-riset/data"); ap.add_argument("--dari", type=int, default=2020)
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.site, exist_ok=True)
    now = datetime.date.today().year
    if a.sjr:
        sjr = N.load_sjr(a.sjr)
    else:                                          # cadangan: ISSN -> kuartil dari artikel TRG yang sudah diberi kuartil (cakupan sebagian)
        sjr = {}
        for r in csv.DictReader(open("data/trg/artikel_kuartil.csv", encoding="utf-8")):
            for i in r["issn"].split(";"):
                if i and r["kuartil"] in ("Q1", "Q2", "Q3", "Q4"): sjr[i] = r["kuartil"]
    flt = f"authorships.institutions.id:{INST},publication_year:{a.dari}-{now},type:article|review,authors_count:<50"      # tanpa konsorsium besar (mis. studi beban penyakit global)
    terbanyak, terbaru = pull(a.cache, flt, "cited_by_count:desc", 40, sjr), pull(a.cache, flt, "publication_date:desc", 25, sjr)
    kq = {}
    p = os.path.join(a.out, "jurnal_unhas.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8")):
            issns = [i for i in r["issn"].split(";") if i]
            q = next((sjr[i] for i in issns if i in sjr), "")
            if q:
                for i in issns: kq[i] = q
    if not a.sjr:                                  # tanpa berkas SJR: sertakan semua ISSN berkuartil yang kita punya
        kq.update(sjr)
    out = dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex (CC0), kuartil SCImago SJR", institusi="Universitas Hasanuddin (I98301867)", dari=a.dari,
               terbanyak=terbanyak, terbaru=terbaru, kuartil=kq)
    json.dump(out, open(os.path.join(a.out, "publikasi_awal.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(out, open(os.path.join(a.site, "publikasi.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"terbanyak {len(terbanyak)} | terbaru {len(terbaru)} | ISSN berkuartil {len(kq)} | {os.path.getsize(os.path.join(a.site, 'publikasi.json'))} bytes")


if __name__ == "__main__":
    main()
