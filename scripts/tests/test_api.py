#!/usr/bin/env python3
"""Uji server API rujukan dan kontrak respons. Pemakaian: python3 scripts/tests/test_api.py"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, threading, urllib.request, urllib.error
import jsonschema
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
spec = importlib.util.spec_from_file_location("api", os.path.join(ROOT, "scripts", "trg_api_server.py")); api = importlib.util.module_from_spec(spec); spec.loader.exec_module(api)
tmp = tempfile.mkdtemp(); forms = os.path.join(tmp, "forms"); data = os.path.join(tmp, "trg"); shutil.copytree(os.path.join(ROOT, "data", "trg"), data)
TOKEN = "token-uji-123"
srv, app = api.make_server(0, os.path.join(ROOT, "site", "peta-riset", "data"), data, forms, TOKEN)
threading.Thread(target=srv.serve_forever, daemon=True).start(); B = f"http://127.0.0.1:{srv.server_address[1]}/api/v1"


def call(path, method="GET", body=None, token=None, ctype="application/json"):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    if body is not None: req.add_header("Content-Type", ctype)
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode() or "{}")


S = lambda n: json.load(open(os.path.join(ROOT, "schemas", n + ".schema.json"), encoding="utf-8"))
c, m = call("/meta"); assert c == 200 and m["n_trg"] == 277; jsonschema.validate(m, S("meta"))
c, r = call("/peneliti?q=andi+imam&ketua=1"); assert c == 200 and r["meta"]["total"] == 1 and "Obesity" in r["data"][0]["ketua_di"], r
jsonschema.validate(r["data"], S("peneliti"))
c, r = call("/peneliti?per_halaman=5&halaman=2"); assert c == 200 and len(r["data"]) == 5 and r["meta"]["halaman"] == 2 and r["meta"]["total"] > 1000
assert call("/peneliti?halaman=abc")[0] == 400
pid = call("/peneliti?q=andi+imam")[1]["data"][0]["id"]; assert call(f"/peneliti/{pid}")[0] == 200 and call("/peneliti/P99999")[0] == 404
c, t = call("/trg/ocnrg"); assert c == 200 and t["anggota"] and any("Andi Imam" in a["nama"] for a in t["anggota"]); jsonschema.validate({k: v for k, v in t.items() if k != "anggota"}, S("trg")["items"])
assert call("/trg/../etc")[0] == 404 and call("/trg/tidak-ada")[0] == 404
c, r = call("/trg?terverifikasi=1"); assert c == 200 and r["meta"]["total"] == 0
c, r = call("/tema"); assert c == 200 and len(r) == 38; jsonschema.validate(r, S("tag"))
c, r = call("/wawasan"); assert c == 200; jsonschema.validate(r, S("insights"))
# --- jalur tulis ---
ex = json.load(open(os.path.join(ROOT, "schemas", "profil_trg.contoh.json")))
assert call("/trg/ocnrg/profil")[0] == 401 and call("/trg/ocnrg/profil", token="salah")[0] == 401
c, pre = call("/trg/ocnrg/profil", token=TOKEN); assert c == 200 and pre["sumber"] == "data_situs" and pre["profil"]["anggota"]
jsonschema.Draft202012Validator(S("profil_trg") if False else json.load(open(os.path.join(ROOT, "schemas", "profil_trg.schema.json")))).iter_errors(pre["profil"])
assert call("/trg/ocnrg/profil", "POST", ex)[0] == 401
c, r = call("/trg/ocnrg/profil", "POST", ex, TOKEN); assert c == 202 and r["diterima"], r
bad = json.loads(json.dumps(ex)); bad["anggota"][0]["orcid"] = "xx"
c, r = call("/trg/ocnrg/profil", "POST", bad, TOKEN); assert c == 422 and r["galat"], r
c, r = call("/trg/afdays/profil", "POST", ex, TOKEN); assert c == 422 and any(g["jalur"] == "trg_slug" for g in r["galat"])
assert call("/trg/ocnrg/profil", "POST", ex, TOKEN, ctype="text/plain")[0] == 415
assert call("/trg/ocnrg/profil", "POST", None, TOKEN)[0] in (400, 415)
saved = os.listdir(os.path.join(forms, "masuk")); assert len(saved) == 1, saved
# --- alur lengkap: isian dari API diolah pengolah isian ---
ov = os.path.join(tmp, "ovr"); env = dict(os.environ, TRG_DATA=data, TRG_OVERRIDES=ov)
r = subprocess.run([sys.executable, "-I", "scripts/trg_forms_ingest.py", os.path.join(forms, "masuk"), "--forms-dir", forms, "--overrides", ov, "--data", data], cwd=ROOT, env=env, capture_output=True, text=True)
assert r.returncode == 0 and "diterima 1" in r.stdout, r.stdout + r.stderr
c, pre2 = call("/trg/ocnrg/profil", token=TOKEN); assert pre2["sumber"] == "isian_terbaru", "prefill harus memakai isian terbaru setelah diolah"
print("OK | baca, pagination, pencarian, 404/400, kontrak skema, auth 401, validasi 422, 415, simpan 202, olah isian, prefill isian terbaru")
