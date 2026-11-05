#!/usr/bin/env python3
"""Uji alur formulir: buat xlsx -> isi -> olah -> override -> dedup. Tidak menyentuh data/ asli. Pemakaian: python3 scripts/tests/test_forms.py"""
import csv, json, os, shutil, subprocess, sys, tempfile
from openpyxl import load_workbook
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tmp = tempfile.mkdtemp(); data = os.path.join(tmp, "trg"); ovr = os.path.join(tmp, "ovr"); forms = os.path.join(tmp, "forms"); out = os.path.join(tmp, "xlsx", "trg"); site = os.path.join(tmp, "site")
shutil.copytree(os.path.join(ROOT, "data", "trg"), data); os.makedirs(out); os.makedirs(site)
env = dict(os.environ, TRG_DATA=data, TRG_OVERRIDES=ovr)
run = lambda *a, **k: subprocess.run([sys.executable, "-I", *a], cwd=ROOT, env=env, capture_output=True, text=True, **k)
R = lambda f: list(csv.DictReader(open(os.path.join(data, f + ".csv"), encoding="utf-8")))
assert run("scripts/trg_overrides.py").returncode == 0
r = run("scripts/trg_forms.py", "--out", out); assert r.returncode == 0, r.stderr
# --- isi formulir ocnrg ---
path = os.path.join(out, "Formulir_TRG_ocnrg.xlsx"); wb = load_workbook(path); wa, wt = wb["Anggota"], wb["TRG & Riset"]
assert wb["Petunjuk"]["D1"].value == 2, "penanda versi formulir tidak ada"
first = wa["B5"].value; n = sum(1 for r in range(5, 40) if wa.cell(row=r, column=2).value)
wa["F5"] = "Kesehatan ibu, anak & gizi"; wa["I5"] = "obesitas anak, mikrobioma usus"
new_row = 5 + n; wa.cell(row=new_row, column=2, value="Dr. Anggota Baru Uji, S.Gz."); wa.cell(row=new_row, column=3, value="Researcher")
wa.cell(row=new_row, column=6, value="Penyakit tidak menular & metabolik"); wa.cell(row=new_row, column=10, value="0000-0002-1825-0097"); wa.cell(row=new_row, column=11, value=6012345)
wt["B5"] = "Kesehatan ibu, anak & gizi"; wt["B9"] = "gizi anak, obesitas"; wt["A14"] = "Contoh University"; wt["B14"] = "Perguruan tinggi/lembaga luar negeri"; wt["D14"] = 2023
wt["A30"] = "Hibah contoh"; wt["B30"] = 2025; wt["C30"] = 250000000; wt["D30"] = "Ketua"; wt["B41"] = "Ya"; wt["B44"] = "Pengisi Uji"
wb.save(path)
old = json.load(open(os.path.join(ROOT, "schemas", "profil_trg.contoh.json"))); old["dikirim_pada"] = "2020-01-01T00:00:00+00:00"
bad = json.loads(json.dumps(old)); bad["anggota"][0]["orcid"] = "1234"; bad["anggota"][0]["keahlian_tema"] = ["D01", "D02", "D03", "D04"]; bad["trg_slug"] = "ocnrg"
nm = lambda s: json.dump(s, open(os.path.join(tmp, "in_" + str(id(s)) + ".json"), "w"))
os.makedirs(os.path.join(tmp, "in")); json.dump(old, open(os.path.join(tmp, "in", "lama.json"), "w")); json.dump(bad, open(os.path.join(tmp, "in", "salah.json"), "w"))
shutil.copy(path, os.path.join(tmp, "in", "Formulir_TRG_ocnrg.xlsx"))
args = ["scripts/trg_forms_ingest.py", os.path.join(tmp, "in"), "--forms-dir", forms, "--overrides", ovr, "--data", data]
r = run(*args); assert r.returncode == 0, r.stdout + r.stderr; print(r.stdout.strip())
hist = [json.loads(l) for l in open(os.path.join(forms, "riwayat.jsonl"), encoding="utf-8")]
assert len(hist) == 2, f"riwayat harus 2 isian valid (xlsx + lama), dapat {len(hist)}"
rej = open(os.path.join(forms, "ditolak.csv"), encoding="utf-8").read()
assert "orcid" in rej and "too long" in rej, "isian salah tidak ditolak dengan alasan:\n" + rej
terbaru = json.load(open(os.path.join(forms, "terbaru.json"), encoding="utf-8"))["ocnrg"]
assert terbaru["dikirim_oleh"]["nama"] == "Pengisi Uji" and terbaru["kesediaan_konsorsium"] == "Ya" and terbaru["pendanaan"][0]["jumlah_rupiah"] == 250000000, "isian terbaru salah"
assert any(a["nama"].startswith("Dr. Anggota Baru Uji") and a["orcid"] == "0000-0002-1825-0097" and a["sinta_id"] == "6012345" for a in terbaru["anggota"])
ver = list(csv.DictReader(open(os.path.join(data, "verifikasi_trg.csv"), encoding="utf-8"))); assert ver and ver[0]["trg_slug"] == "ocnrg"
# idempotensi: isian yang sama tidak digandakan
r2 = run(*args); assert "diterima 0" in r2.stdout, r2.stdout
# --- alirkan ke dedup: anggota baru dan keahlian harus muncul ---
r = run("scripts/trg_dedup_tags.py"); assert r.returncode == 0, r.stderr
unik = R("peneliti_unik")
nu = [u for u in unik if "Anggota Baru Uji" in u["nama"]]; assert nu and nu[0]["trg_slugs"] == "ocnrg" and nu[0]["orcid"] == "0000-0002-1825-0097", "anggota baru tidak masuk"
assert any("gizi anak" in u["keahlian_bersih"].lower() or "obesitas anak" in u["keahlian_bersih"].lower() for u in unik if "ocnrg" in u["trg_slugs"]), "keahlian formulir tidak berlaku"
rep = open(os.path.join(data, "override_laporan.txt"), encoding="utf-8").read(); assert "anggota baru" in rep
assert run("scripts/trg_tag_tier1.py").returncode == 0
assert run("scripts/trg_dashboard_data.py", site, "--tanpa-mahasiswa").returncode == 0
trg = {t["slug"]: t for t in json.load(open(os.path.join(site, "trg.json")))}
assert trg["ocnrg"]["terverifikasi"] == terbaru["dikirim_pada"][:10] and trg["afdays"]["terverifikasi"] == "", "penanda terverifikasi salah"
print("OK | xlsx diolah, JSON lama masuk riwayat, isian salah ditolak, idempoten, anggota baru dan keahlian masuk dedup, TRG ditandai terverifikasi")
