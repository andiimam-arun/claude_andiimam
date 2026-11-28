#!/usr/bin/env python3
"""Uji lapis override pada salinan data (tidak menyentuh data/ asli). Pemakaian: python3 scripts/tests/test_overrides.py"""
import csv, json, os, shutil, subprocess, sys, tempfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tmp = tempfile.mkdtemp(); data = os.path.join(tmp, "trg"); ovr = os.path.join(tmp, "ovr"); site = os.path.join(tmp, "site")
shutil.copytree(os.path.join(ROOT, "data", "trg"), data); os.makedirs(site)
env = dict(os.environ, TRG_DATA=data, TRG_OVERRIDES=ovr)
run = lambda *a: subprocess.run([sys.executable, "-I", *a], cwd=ROOT, env=env, check=True, capture_output=True, text=True).stdout
R = lambda f: list(csv.DictReader(open(os.path.join(data, f + ".csv"), encoding="utf-8")))
subprocess.run([sys.executable, "-I", "scripts/trg_overrides.py"], cwd=ROOT, env=env, check=True, capture_output=True)

run("scripts/trg_dedup_tags.py"); run("scripts/trg_tag_tier1.py")
base_unik = R("peneliti_unik"); base_n = len(base_unik)
pen = R("peneliti")
# --- pilih kasus nyata dari data ---
afd = next(p for p in pen if p["trg_slug"] == "afdays" and p["nama"].strip())
leader_aisrg = next(p for p in pen if p["trg_slug"] == "aisrg" and p["peran"] == "Leader")
singles = [u for u in base_unik if u["dasar_penggabungan"] == "tunggal" and len(u["trg_slugs"].split(";")) == 1]
a, b = singles[10], singles[200]
merged_by_name = next(u for u in base_unik if u["dasar_penggabungan"] == "nama" and len(u["trg_slugs"].split(";")) == 2 and not u["orcid"] and not u["sinta_id"] and not u["scopus_id"])
s1, s2 = merged_by_name["trg_slugs"].split(";")
target = next(u for u in singles if u["keahlian_bersih"])
w = lambda name, rows: csv.writer(open(os.path.join(ovr, name + ".csv"), "a", newline="", encoding="utf-8")).writerows(rows)
w("ketua", [[ "afdays", afd["nama"], "jadikan_ketua", "uji", "tes", "2026-11-02"], ["aisrg", leader_aisrg["nama"], "bukan_ketua", "uji", "tes", "2026-11-02"],
            ["afdays", "Orang Yang Tidak Ada", "bukan_ketua", "uji", "tes", "2026-11-02"]])
w("orang_gabung", [[a["nama"], b["nama"], "uji", "tes", "2026-11-02"]])
w("orang_pisah", [[merged_by_name["nama"], s1, s2, "uji", "tes", "2026-11-02"]])
w("tema_trg", [["afdays", "C06;C07", "uji", "tes", "2026-11-02"], ["tidak-ada", "C01", "uji", "tes", "2026-11-02"]])
w("profil_orang", [[target["nama"], "", "keahlian", "Bidang Uji Override", "form", "uji", "tes", "2026-11-02"]])

run("scripts/trg_dedup_tags.py"); run("scripts/trg_tag_tier1.py")
unik = R("peneliti_unik")
# 1. ketua
assert any("afdays" in u["ketua_slugs"].split(";") and u["nama"].strip() for u in unik), "jadikan_ketua gagal"
assert not any("aisrg" in u["ketua_slugs"].split(";") for u in unik), "bukan_ketua gagal"
# 2. gabung dan pisah: -1 dari gabung, +1 dari pisah
assert len(unik) == base_n - 1 + 1, f"jumlah orang unik {len(unik)}; harapan {base_n}"
assert any(a["trg_slugs"].split(";")[0] in u["trg_slugs"] and b["trg_slugs"].split(";")[0] in u["trg_slugs"] for u in unik), "orang_gabung gagal"
# 3. tema
tt = {r["slug"]: r for r in R("trg_tag_tier1")}
assert tt["afdays"]["tag_ids"] == "C06;C07" and tt["afdays"]["perlu_review"] == "override", "tema_trg gagal"
# 4. profil
assert any("Bidang Uji Override" in u["keahlian_bersih"] for u in unik), "profil_orang gagal"
# 5. laporan memuat baris bermasalah
rep = open(os.path.join(data, "override_laporan.txt"), encoding="utf-8").read()
assert "Orang Yang Tidak Ada" in rep, "baris tak cocok tidak dilaporkan"
rep2 = open(os.path.join(data, "override_laporan_tema.txt"), encoding="utf-8").read()
assert "tidak-ada" in rep2, "slug tak dikenal tidak dilaporkan"
# 6. kata kunci
run("scripts/trg_dashboard_data.py", site, "--tanpa-mahasiswa")
run("scripts/trg_insights.py", site)
kw0 = [k["t"] for k in json.load(open(os.path.join(site, "insights.json")))["keywords"]]
w("kata_kunci", [[kw0[0], "buang", "", "uji", "tes", "2026-11-02"]])
run("scripts/trg_insights.py", site)
kw1 = [k["t"] for k in json.load(open(os.path.join(site, "insights.json")))["keywords"]]
assert kw0[0] not in kw1, f"kata '{kw0[0]}' masih ada setelah dibuang"
print("OK | ketua, gabung, pisah, tema, profil, laporan bermasalah, kata kunci semuanya berlaku;", "orang unik", base_n, "->", len(unik))
