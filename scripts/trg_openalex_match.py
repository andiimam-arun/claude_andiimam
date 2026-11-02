#!/usr/bin/env python3
"""Cocokkan penulis Unhas dari OpenAlex ke peneliti TRG, lalu hasilkan lapis data situs (langkah 3 dan 4).

Pemakaian: python3 scripts/trg_openalex_match.py [--oa data/openalex] [--data data/trg] [--site site/peta-riset/data] [--min-karya 5]

Urutan kecocokan (yang lebih kuat menang): ORCID sama > Scopus ID sama > nama sama (token berurutan bebas, >= 2 kata).
Kecocokan nama yang ambigu (satu nama ke banyak orang, atau sebaliknya) TIDAK dipakai; masuk <oa>/tinjau.csv untuk diputuskan manusia
(tambahkan orcid lewat data/overrides/profil_orang.csv agar kecocokannya pasti pada putaran berikut).

Keluaran:
  <oa>/pakar_openalex.csv   semua penulis + status + peneliti_id
  <oa>/tinjau.csv           kecocokan nama ambigu
  <site>/openalex.json      metrik per peneliti TRG, daftar pakar di luar TRG, ringkasan bidang  (sumber: OpenAlex, CC0)
"""
import argparse, csv, datetime, json, os, re, collections as C

ap = argparse.ArgumentParser(); ap.add_argument("--oa", default="data/openalex"); ap.add_argument("--data", default=os.environ.get("TRG_DATA", "data/trg"))
ap.add_argument("--site", default="site/peta-riset/data"); ap.add_argument("--min-karya", type=int, default=5); ap.add_argument("--maks-luar", type=int, default=3000)
a = ap.parse_args()
R = lambda p: list(csv.DictReader(open(p, encoding="utf-8")))
oa = R(f"{a.oa}/penulis_unhas.csv"); people = R(f"{a.data}/peneliti_unik.csv")
key = lambda s: " ".join(sorted(t for t in re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split() if len(t) > 1))
ntok = lambda k: len(k.split())
by_orcid = {p["orcid"].strip(): p for p in people if p["orcid"].strip()}
by_scopus = {p["scopus_id"].strip(): p for p in people if p["scopus_id"].strip()}
pk = C.defaultdict(list)
for p in people:
    k = key(p["nama_norm"] or p["nama"])
    if ntok(k) >= 2: pk[k].append(p)
ok_ = C.defaultdict(list)
for r in oa:
    k = key(r["nama"])
    if ntok(k) >= 2: ok_[k].append(r)

matched = {}                         # peneliti_id -> (baris OA, dasar)
for r in oa:
    p = by_orcid.get(r["orcid"]) if r["orcid"] else None
    dasar = "orcid"
    if not p and r["scopus_id"]: p, dasar = by_scopus.get(r["scopus_id"]), "scopus"
    r["status"], r["peneliti_id"], r["dasar"] = ("cocok", p["peneliti_id"], dasar) if p else ("", "", "")
    if p:
        old = matched.get(p["peneliti_id"])
        if not old or float(r["sitasi"] or 0) > float(old[0]["sitasi"] or 0): matched[p["peneliti_id"]] = (r, dasar)   # satu orang, beberapa profil OA: ambil yang terbesar
tinjau = []
for r in oa:
    if r["status"]: continue
    k = key(r["nama"]); cand = [p for p in pk.get(k, []) if p["peneliti_id"] not in matched]
    if ntok(k) >= 2 and pk.get(k) and not cand:
        r["status"] = "duplikat_profil"                    # orang itu sudah cocok lewat ID dengan profil OA lain
    elif len(cand) == 1 and len(ok_[k]) == 1:
        r["status"], r["peneliti_id"], r["dasar"] = "cocok", cand[0]["peneliti_id"], "nama"; matched[cand[0]["peneliti_id"]] = (r, "nama")
    elif cand:
        r["status"] = "tinjau"; tinjau += [dict(openalex_author=r["openalex_author"], nama_openalex=r["nama"], karya=r["karya"], sitasi=r["sitasi"], kandidat_id=p["peneliti_id"], kandidat_nama=p["nama"], kandidat_trg=p["trg_slugs"]) for p in cand]
    elif int(r["karya"] or 0) >= a.min_karya: r["status"] = "belum_di_trg"
    else: r["status"] = "belum_di_trg_karya_sedikit"

def write(path, head, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=head, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
write(f"{a.oa}/pakar_openalex.csv", list(oa[0].keys()) if oa else [], oa)
write(f"{a.oa}/tinjau.csv", ["openalex_author", "nama_openalex", "karya", "sitasi", "kandidat_id", "kandidat_nama", "kandidat_trg"], tinjau)

num = lambda x: int(float(x)) if str(x).strip() not in ("", "None") else 0
bid = lambda r: [b for b in r["bidang"].split(" | ") if b]
lain = lambda r: [i for i in r["institusi_terakhir"].split(" | ") if i and "hasanuddin" not in i.lower()]     # afiliasi selain Unhas (kolaborator asing sering berafiliasi ganda)
metrik = {pid: dict(oa=r["openalex_author"], h=num(r["h_index"]), s=num(r["sitasi"]), k=num(r["karya"]), b=bid(r)[:3], d=d) for pid, (r, d) in matched.items()}
luar = sorted((r for r in oa if r["status"] == "belum_di_trg"), key=lambda r: (-num(r["h_index"]), -num(r["sitasi"])))
fields = C.defaultdict(lambda: dict(n_penulis=0, sitasi=0, di_trg=0, luar_trg=0))
for r in oa:
    if r["status"] in ("duplikat_profil", "belum_di_trg_karya_sedikit"): continue
    for b in bid(r)[:1]:                                     # satu bidang utama per orang agar tidak dihitung ganda
        f = fields[b]; f["n_penulis"] += 1; f["sitasi"] += num(r["sitasi"]); f["di_trg" if r["status"] == "cocok" else "luar_trg"] += 1
out = dict(dibuat=datetime.date.today().isoformat(), sumber="OpenAlex (CC0)", institusi="Universitas Hasanuddin (I98301867)",
           n_penulis=len(oa), n_cocok=len(metrik), n_tinjau=len({t["openalex_author"] for t in tinjau}), n_luar_trg=len(luar),
           metrik=metrik, luar_trg=[dict(oa=r["openalex_author"], nama=r["nama"], orcid=r["orcid"], h=num(r["h_index"]), s=num(r["sitasi"]), k=num(r["karya"]), b=bid(r)[:3], t=r["topik"].split(" | ")[:4], x=lain(r)[:3], u=int(not lain(r))) for r in luar[:a.maks_luar]],
           bidang=sorted(([dict(nama=k, **v) for k, v in fields.items()]), key=lambda x: -x["sitasi"]))
os.makedirs(a.site, exist_ok=True)
json.dump(out, open(f"{a.site}/openalex.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
st = C.Counter(r["status"] for r in oa)
print(f"penulis OpenAlex {len(oa)} | cocok {len(metrik)} dari {len(people)} peneliti TRG ({round(100 * len(metrik) / max(1, len(people)))}%) | dasar {dict(C.Counter(d for _, d in matched.values()))} | status {dict(st)}")
