#!/usr/bin/env python3
"""Uji logika penggabungan kuartil SJR (sintetis; tanpa jaringan). Pemakaian: python3 scripts/tests/test_kuartil.py"""
import importlib.util, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location("k", os.path.join(HERE, "..", "trg_kuartil.py")); K = importlib.util.module_from_spec(sp); sp.loader.exec_module(K)
tmp = tempfile.mkdtemp(); f23 = os.path.join(tmp, "s23.csv"); f25 = os.path.join(tmp, "s25.csv")
open(f23, "w", encoding="utf-8-sig").write('Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile\n1;1;A;journal;"12345678, 87654321";1;Q1\n2;2;B;journal;"11112222";1;Q3\n')
open(f25, "w", encoding="utf-8-sig").write('Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile\n1;1;A;journal;"12345678";1;Q2\n3;3;C;journal;"-";1;-\n')
sjr = {2023: K.load_sjr(f23), 2025: K.load_sjr(f25)}
assert sjr[2023]["87654321"] == "Q1" and sjr[2023]["11112222"] == "Q3" and "-" not in sjr[2025], sjr
issns = {"SA": {"12345678"}, "SB": {"11112222"}, "SC": {"99990000"}, "SD": {"87654321"}}
rows = [(2023, "SA", "A", 10), (2023, "SB", "B", 5), (2023, "SC", "C", 2), (2024, "SA", "A", 4), (2025, "SA", "A", 6), (2022, "SD", "D", 3), (2025, "SD", "D", 1)]
cnt, miss = K.quartiles(rows, issns, sjr)
assert cnt[2023]["Q1"] == 10 and cnt[2023]["Q3"] == 5 and cnt[2023]["-"] == 2, dict(cnt[2023])
assert cnt[2024]["Q1"] == 4, "2024 tanpa berkas -> tahun terdekat sebelumnya (2023)"
assert cnt[2025]["Q2"] == 6 and cnt[2025]["-"] == 1, dict(cnt[2025])      # SD hanya ada di SJR 2023: tidak dipinjam ke 2025
assert cnt[2022]["Q1"] == 3, "2022 tanpa berkas sebelumnya -> berkas paling awal"
assert dict(miss)[("SC", "C")] == 2
print("OK | pilih berkas SJR per tahun, ISSN ganda, kuartil '-' diabaikan, jurnal tanpa kuartil dilaporkan")
