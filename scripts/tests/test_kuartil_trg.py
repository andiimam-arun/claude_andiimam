#!/usr/bin/env python3
"""Uji Q1-Q4 per TRG (sintetis, tanpa jaringan). Pemakaian: python3 scripts/tests/test_kuartil_trg.py"""
import csv, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); tmp = tempfile.mkdtemp(); d = os.path.join(tmp, "d"); site = os.path.join(tmp, "s"); os.makedirs(d)
W = lambda p, head, rows: (lambda w: (w.writerow(head), [w.writerow(r) for r in rows]))(csv.writer(open(p, "w", newline="", encoding="utf-8")))
W(f"{d}/trg.csv", ["slug", "nama"], [("a", "TRG A"), ("b", "TRG B"), ("c", "TRG C")])
t1, t2, t3, t4, t5 = ("Judul artikel satu tentang kakao", "Judul artikel dua tentang malaria", "Judul artikel tiga tanpa metrik", "Judul artikel empat lama sekali", "Judul artikel lima jurnal lokal")
W(f"{d}/publikasi.csv", ["trg_slug", "judul", "tahun", "url"], [("a", t1, "2022", ""), ("a", t1, "2022", ""), ("a", t2, "2023", ""), ("a", t3, "2023", ""), ("b", t1, "2022", ""), ("b", t4, "2015", ""), ("b", t5, "2024", ""), ("c", t3, "", "")])
n = lambda t: " ".join(t.lower().split())
H = ["kunci_judul", "tahun", "jurnal", "issn", "issn_semua", "dasar_kecocokan"]
W(f"{d}/artikel_metrik.csv", H, [(n(t1), 2022, "J1", "11111111", "", "doi"), (n(t2), 2023, "J2", "22222222", "22222223", "doi"), (n(t4), 2015, "J1", "11111111", "", "doi"), (n(t5), 2024, "Lokal", "99999999", "", "judul")])
sj = os.path.join(tmp, "sjr.csv"); open(sj, "w", encoding="utf-8-sig").write('Rank;Title;Issn;SJR Best Quartile\n1;J1;"11111111";Q1\n2;J2;"22222223";Q2\n')
r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "..", "trg_kuartil_trg.py"), "--sjr", f"2025={sj}", "--data", d, "--site", site], capture_output=True, text=True); assert r.returncode == 0, r.stderr + r.stdout
rows = {x["slug"]: x for x in csv.DictReader(open(f"{d}/trg_kuartil.csv", encoding="utf-8"))}
a, b = rows["a"], rows["b"]
assert (a["artikel"], a["tercocok"], a["Q1"], a["Q2"], a["Q12"]) == ("3", "2", "1", "1", "2"), a          # duplikat judul dihitung sekali; ISSN kedua (22222223) cocok
assert (b["artikel"], b["tercocok"], b["bertindeks"], b["Q1"]) == ("2", "2", "1", "1"), b                  # 2015 di luar jendela 2020+; jurnal lokal tercocok tetapi tanpa kuartil
assert "c" not in rows, "TRG tanpa tahun tidak boleh dihitung"
j = json.load(open(f"{site}/kuartil.json", encoding="utf-8")); assert j["trg"]["a"]["q1"] == 1 and j["total"]["Q12"] == 3 and j["sjr_tahun"] == [2025], j
print("OK | duplikat, ISSN ganda, jendela tahun, jurnal tanpa kuartil, TRG tanpa tahun")
