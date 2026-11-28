#!/usr/bin/env python3
"""Luaran riset Unhas secara keseluruhan (OpenAlex): per tahun, jenis, bidang, SDG, mitra institusi, dan kuartil jurnal. Untuk panel "Output Unhas" dan "Mitra".

Pemakaian:
  OPENALEX_API_KEY=... python3 scripts/trg_openalex_luaran.py --cache CACHE_DIR [--site site/peta-riset/data] [--out data/openalex] [--dari 2010] [--bidang-dari 2015]
Satuan: karya berafiliasi Unhas. "Artikel" = jenis article atau review. Disertasi (repositori) dan pracetak tidak masuk hitungan artikel.
Bidang dan SDG dihitung dari artikel+review sejak --bidang-dari; mitra dari karya dengan <50 penulis sejak --bidang-dari. Kuartil dibaca dari <out>/kuartil_unhas.csv bila ada.
Keluaran: <out>/luaran.json dan <site>/luaran.json
"""
import argparse, csv, datetime, importlib.util, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_negara", os.path.join(HERE, "trg_openalex_negara.py")); N = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(N)
E, INST = N.E, N.INST


def by_year(cache, flt):
    return {int(k): n for k, _, n in N.groups(cache, flt, "publication_year") if k.isdigit()}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/openalex"); ap.add_argument("--site", default="site/peta-riset/data")
    ap.add_argument("--dari", type=int, default=2010); ap.add_argument("--bidang-dari", type=int, default=2015)
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True); os.makedirs(a.site, exist_ok=True)
    now = datetime.date.today().year; B = f"authorships.institutions.id:{INST}"; yr = f"publication_year:{a.dari}-{now}"; art = "type:article|review"
    semua, artikel, oa = by_year(a.cache, f"{B},{yr}"), by_year(a.cache, f"{B},{yr},{art}"), by_year(a.cache, f"{B},{yr},{art},is_oa:true")
    tahun = [dict(y=y, semua=semua.get(y, 0), artikel=artikel.get(y, 0), oa=oa.get(y, 0)) for y in range(a.dari, now + 1)]
    jenis = [dict(k=k, n=n) for k, _, n in N.groups(a.cache, B, "type")][:8]
    since = f"{B},publication_year:{a.bidang_dari}-{now},{art}"
    bidang = [dict(id=k, nama=nm, n=n) for k, nm, n in N.groups(a.cache, since, "primary_topic.field.id")]
    sdg = [dict(id=int(k), nama=nm, n=n) for k, nm, n in N.groups(a.cache, since, "sustainable_development_goals.id") if k.isdigit()]
    gi = [g for g in N.groups(a.cache, f"{B},publication_year:{a.bidang_dari}-{now},authors_count:<50", "authorships.institutions.id") if g[0] != INST][:120]
    meta = N.inst_country(a.cache, [g[0] for g in gi]); intl, dom = [], []
    for k, nm, n in gi:
        c, name = meta.get(k, ("", nm)); row = dict(id=k, nama=name or nm, negara=c, n=n)
        if c == "ID" and len(dom) < 15: dom.append(row)
        elif c and c != "ID" and len(intl) < 15: intl.append(row)
    kq = []
    p = os.path.join(a.out, "kuartil_unhas.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8")):
            kq.append(dict(y=int(r["tahun"]), q1=int(r["Q1"]), q2=int(r["Q2"]), q3=int(r["Q3"]), q4=int(r["Q4"]), tanpa=int(r["tanpa_kuartil"]), total=int(r["total"])))
    dom_j = []                                   # satu jurnal yang menyumbang >= 8% artikel setahun (mis. suplemen konferensi) dapat memiringkan komposisi kuartil
    pj = os.path.join(a.out, "jurnal_unhas.csv")
    if os.path.exists(pj):
        per = {}
        for r in csv.DictReader(open(pj, encoding="utf-8")):
            per.setdefault(int(r["tahun"]), []).append((int(r["artikel"]), r["jurnal"]))
        for y, v in sorted(per.items()):
            tot = sum(n for n, _ in v); n, nm = max(v)
            if tot and n / tot >= 0.08: dom_j.append(dict(y=y, jurnal=nm, n=n, pct=round(100 * n / tot)))
    out = dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex (CC0), kuartil SCImago SJR", institusi="Universitas Hasanuddin (I98301867)", dari=a.dari, bidang_dari=a.bidang_dari,
               tahun=tahun, jenis=jenis, bidang=bidang, sdg=sdg, mitra=dict(intl=intl, dalam_negeri=dom), kuartil=kq, jurnal_dominan=dom_j)
    json.dump(out, open(f"{a.out}/luaran.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(out, open(f"{a.site}/luaran.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("tahun", tahun[-3:], "| bidang", len(bidang), "| sdg", len(sdg), "| mitra intl", [m['nama'][:20] for m in intl[:3]], "| mitra dalam negeri", [m['nama'][:20] for m in dom[:3]])


if __name__ == "__main__":
    main()
