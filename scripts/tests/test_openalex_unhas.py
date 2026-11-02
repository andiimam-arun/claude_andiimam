#!/usr/bin/env python3
"""Uji penarikan penulis institusi + pencocokan ke peneliti TRG terhadap server tiruan. Pemakaian: python3 scripts/tests/test_openalex_unhas.py"""
import csv, importlib.util, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(HERE, "..")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


mock = load("mock_biblio", os.path.join(HERE, "mock_biblio.py")); srv = mock.serve(0); base = f"http://127.0.0.1:{srv.server_address[1]}"
env = dict(os.environ, OPENALEX_BASE=base, BIBLIO_MAILTO="t@example.org", BIBLIO_DELAY="0", OPENALEX_API_KEY="kunci-uji")
tmp = tempfile.mkdtemp(); cache, oa, data, site = (os.path.join(tmp, x) for x in ("cache", "oa", "data", "site")); os.makedirs(data); os.makedirs(site)
run = lambda *a: subprocess.run([sys.executable, "-I", *a], env=env, capture_output=True, text=True)

r = run(os.path.join(S, "trg_openalex_unhas.py"), "--cache", cache, "--out", oa)
assert r.returncode == 0, r.stderr + r.stdout
rows = list(csv.DictReader(open(f"{oa}/penulis_unhas.csv", encoding="utf-8")))
assert len(rows) == mock.N_INST, len(rows)                                       # 3 halaman (200+200+50), tanpa duplikat
assert rows[0]["bidang"] and rows[0]["scopus_id"].startswith("7"), rows[0]
r2 = run(os.path.join(S, "trg_openalex_unhas.py"), "--cache", cache, "--out", oa)
assert "http 0" not in r2.stdout and r2.returncode == 0
log = list(csv.DictReader(open(f"{oa}/penarikan_log.csv", encoding="utf-8")))[-1]; assert log["http"] == "0" and log["lengkap"] == "1", log   # putaran ulang dari cache

# peneliti TRG: ORCID (i=1), Scopus (i=3, tanpa ORCID), nama (i=5), nama ambigu (i=7 -> dua orang), orang sudah cocok ID + profil OA ganda (i=2)
H = ["peneliti_id", "nama", "nama_norm", "n_trg", "trg_slugs", "orcid", "scopus_id", "sinta_id"]
ppl = [("P00001", "Dr. A", "x1", mock.mk_orcid(1), ""), ("P00002", "Dr. B", "y2", "", "7" + f"{3:010d}"), ("P00003", "Unhas Author5 Mock", "unhas author5 mock", "", ""),
       ("P00004", "Mock Author7 Unhas", "mock author7 unhas", "", ""), ("P00005", "Unhas Mock Author7", "unhas mock author7", "", ""), ("P00006", "Prof. C", "mock author2 unhas", mock.mk_orcid(2), "")]
with open(f"{data}/peneliti_unik.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh); w.writerow(H)
    for pid, nm, nn, orc, sc in ppl: w.writerow([pid, nm, nn, 1, "slug-x", orc, sc, ""])
r = run(os.path.join(S, "trg_openalex_match.py"), "--oa", oa, "--data", data, "--site", site)
assert r.returncode == 0, r.stderr + r.stdout
j = json.load(open(f"{site}/openalex.json", encoding="utf-8")); m = j["metrik"]
assert m["P00001"]["d"] == "orcid" and m["P00002"]["d"] == "scopus" and m["P00003"]["d"] == "nama" and m["P00006"]["d"] == "orcid", {k: v["d"] for k, v in m.items()}
assert "P00004" not in m and "P00005" not in m, "nama ambigu tidak boleh dipakai"
tj = list(csv.DictReader(open(f"{oa}/tinjau.csv", encoding="utf-8"))); assert {t["kandidat_id"] for t in tj} == {"P00004", "P00005"}, tj
allr = {x["nama"]: x for x in csv.DictReader(open(f"{oa}/pakar_openalex.csv", encoding="utf-8"))}
assert allr["Mock Author7 Unhas"]["status"] == "tinjau"
assert j["n_luar_trg"] > 100 and all(x["k"] >= 5 for x in j["luar_trg"]) and j["luar_trg"][0]["h"] >= j["luar_trg"][-1]["h"], "daftar di luar TRG salah"
assert not ({"P00001", "P00002"} & {x["oa"] for x in j["luar_trg"]}) and len(j["bidang"]) == 3
print("OK | penulis", j["n_penulis"], "| cocok", j["n_cocok"], "| ambigu", j["n_tinjau"], "| di luar TRG", j["n_luar_trg"], "| putaran 2: 0 HTTP")
