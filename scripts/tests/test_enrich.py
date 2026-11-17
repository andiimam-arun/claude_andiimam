#!/usr/bin/env python3
"""Uji pipa pengayaan terhadap server tiruan. Pemakaian: python3 scripts/tests/test_enrich.py"""
import csv, importlib.util, os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


mock = load("mock_biblio", os.path.join(HERE, "mock_biblio.py"))
srv = mock.serve(0); base = f"http://127.0.0.1:{srv.server_address[1]}"
os.environ.update(OPENALEX_BASE=base, CROSSREF_BASE=base, ORCID_BASE=base, BIBLIO_MAILTO="test@example.org", BIBLIO_DELAY="0")
enrich_path = os.path.join(HERE, "..", "trg_enrich.py")
tmp = tempfile.mkdtemp(); cache = os.path.join(tmp, "cache"); out = os.path.join(tmp, "out")


def run():
    m = load("trg_enrich", enrich_path); m.STATS.update(http=0, cache=0)
    sys.argv = ["x", "--cache", cache, "--out", out, "--limit", "120", "--orcid-verify"]
    m.main(); return dict(m.STATS)


s1 = run()
arts = list(csv.DictReader(open(f"{out}/artikel_metrik.csv", encoding="utf-8")))
peo = list(csv.DictReader(open(f"{out}/peneliti_metrik.csv", encoding="utf-8")))
log = list(csv.DictReader(open(f"{out}/enrich_log.csv", encoding="utf-8")))[0]
ways = {a["dasar_kecocokan"] for a in arts}
assert arts and {"doi"} <= ways, ways
assert all(a["kunci_judul"] and a["sitasi"] != "" for a in arts), "baris tanpa kunci/sitasi"
assert len({a["kunci_judul"] for a in arts}) == len(arts), "duplikat artikel"
assert peo and all(p["nama_orcid"] for p in peo), "metrik peneliti/ORCID kosong"
assert s1["http"] > 0
s2 = run()
assert s2["http"] == 0, f"putaran ulang seharusnya hanya dari cache, tetapi {s2['http']} permintaan HTTP"
print("OK | cara cocok:", sorted(ways), "| artikel", len(arts), "| peneliti", len(peo), "| cakupan", log["cakupan_pct"], "% | putaran 2: 0 HTTP")
