#!/usr/bin/env python3
"""Artikel Q1-Q4 per TRG: artikel yang dicantumkan tiap TRG (publikasi.csv), dicocokkan ke OpenAlex (artikel_metrik.csv dari trg_enrich.py),
lalu diberi kuartil dari berkas SJR (SCImago) yang Anda sediakan.

Pemakaian:
  python3 scripts/trg_kuartil_trg.py --sjr 2025=scimagojr_2025.csv [--sjr 2024=...] [--dari 2020] [--data data/trg] [--metrik data/trg/artikel_metrik.csv] [--site site/peta-riset/data]
Keluaran:
  <data>/trg_kuartil.csv      satu baris per TRG
  <data>/artikel_kuartil.csv  satu baris per (TRG, artikel) bertindeks, untuk diperiksa manusia
  <site>/kuartil.json         ringkasan untuk dasbor
Aturan: satu artikel dihitung sekali per TRG (judul dinormalisasi); artikel yang dicantumkan beberapa TRG dihitung di tiap TRG itu.
Tahun: tahun OpenAlex bila ada, selain itu tahun dari TRG. Hitungan utama memakai SEMUA tahun; kolom/kunci "sejak<dari>" (default 2020) memberi hitungan terbaru berdampingan.
Kuartil = SJR Best Quartile berdasarkan ISSN, memakai berkas SJR tahun terdekat (artikel lama dinilai dengan kuartil jurnal saat ini; jurnal yang sudah berhenti terbit tidak ada di SJR).
"""
import argparse, csv, datetime, importlib.util, json, os, re, collections as C

HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("trg_kuartil", os.path.join(HERE, "trg_kuartil.py")); K = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(K)
norm = lambda t: re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--sjr", action="append", required=True, metavar="TAHUN=BERKAS"); ap.add_argument("--dari", type=int, default=2020)
    ap.add_argument("--data", default=os.environ.get("TRG_DATA", "data/trg")); ap.add_argument("--metrik", default=""); ap.add_argument("--site", default="site/peta-riset/data")
    a = ap.parse_args(); mpath = a.metrik or f"{a.data}/artikel_metrik.csv"
    R = lambda p: list(csv.DictReader(open(p, encoding="utf-8")))
    sjr = {int(s.split("=", 1)[0]): K.load_sjr(s.split("=", 1)[1]) for s in a.sjr}
    met = {r["kunci_judul"]: r for r in R(mpath)}; trg = {t["slug"]: t for t in R(f"{a.data}/trg.csv")}
    seen, per, rows = set(), {s: C.Counter() for s in trg}, []
    for r in R(f"{a.data}/publikasi.csv"):
        k = norm(r["judul"]); s = r["trg_slug"]
        if len(k) < 12 or (s, k) in seen or s not in per: continue
        seen.add((s, k)); m = met.get(k)
        yr = int(m["tahun"]) if m and str(m["tahun"]).isdigit() else (int(r["tahun"]) if str(r["tahun"]).isdigit() else None)
        recent = bool(yr and yr >= a.dari); c = per[s]; c["n"] += 1; c["rn"] += recent
        if not m: continue
        c["cocok"] += 1; c["rcocok"] += recent
        iss = {K.issn_norm(x) for x in [m["issn"]] + (m.get("issn_semua") or "").split(";") if x}
        mp = K.pick(sjr, yr if yr else max(sjr)); q = next((mp[i] for i in sorted(iss) if i in mp), None)
        if q:
            c[q] += 1; c["r" + q] += recent
            rows.append(dict(trg_slug=s, judul=r["judul"], tahun=yr or "", jurnal=m["jurnal"], issn=";".join(sorted(iss)), kuartil=q, dasar=m["dasar_kecocokan"]))
        else: c["tanpa"] += 1
    out = []
    for s, c in per.items():
        if not c["n"]: continue
        q12, idx = c["Q1"] + c["Q2"], c["Q1"] + c["Q2"] + c["Q3"] + c["Q4"]
        rq12, ridx = c["rQ1"] + c["rQ2"], c["rQ1"] + c["rQ2"] + c["rQ3"] + c["rQ4"]
        out.append(dict(slug=s, nama=trg[s]["nama"], artikel=c["n"], tercocok=c["cocok"], bertindeks=idx, Q1=c["Q1"], Q2=c["Q2"], Q3=c["Q3"], Q4=c["Q4"], Q12=q12,
                        Q12_pct_bertindeks=round(100 * q12 / idx) if idx else "", cakupan_pct=round(100 * c["cocok"] / c["n"]),
                        **{f"sejak{a.dari}_artikel": c["rn"], f"sejak{a.dari}_bertindeks": ridx, f"sejak{a.dari}_Q1": c["rQ1"], f"sejak{a.dari}_Q2": c["rQ2"], f"sejak{a.dari}_Q12": rq12}))
    out.sort(key=lambda r: (-r["Q12"], -r["bertindeks"], r["nama"]))
    for name, head, data in (("trg_kuartil", list(out[0].keys()), out), ("artikel_kuartil", list(rows[0].keys()) if rows else [], rows)):
        with open(f"{a.data}/{name}.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=head); w.writeheader(); w.writerows(data)
    tot = {k: sum(r[k] for r in out) for k in ("artikel", "tercocok", "bertindeks", "Q1", "Q2", "Q3", "Q4", "Q12")}
    tot["sejak_Q12"] = sum(r[f"sejak{a.dari}_Q12"] for r in out)
    os.makedirs(a.site, exist_ok=True)
    json.dump(dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex + SCImago SJR", sjr_tahun=sorted(sjr), dari=a.dari, total=tot,
                   trg={r["slug"]: dict(n=r["artikel"], c=r["tercocok"], i=r["bertindeks"], q1=r["Q1"], q2=r["Q2"], q3=r["Q3"], q4=r["Q4"],
                                        rn=r[f"sejak{a.dari}_artikel"], ri=r[f"sejak{a.dari}_bertindeks"], r1=r[f"sejak{a.dari}_Q1"], r2=r[f"sejak{a.dari}_Q2"]) for r in out if r["tercocok"]}),
              open(f"{a.site}/kuartil.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"TRG dengan artikel {len(out)} | artikel (per TRG, semua tahun): {tot['artikel']} | tercocok {tot['tercocok']} | bertindeks SJR {tot['bertindeks']} | Q1 {tot['Q1']} Q2 {tot['Q2']} Q3 {tot['Q3']} Q4 {tot['Q4']}")
    print(f"TRG dengan >=1 artikel Q1/Q2: {sum(1 for r in out if r['Q12'])} (semua tahun), {sum(1 for r in out if r[f'sejak{a.dari}_Q12'])} (sejak {a.dari}); Q1+Q2 sejak {a.dari}: {tot['sejak_Q12']}")


if __name__ == "__main__":
    main()
