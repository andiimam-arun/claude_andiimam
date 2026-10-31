#!/usr/bin/env python3
"""Server API rujukan Peta Riset Unhas (hanya pustaka standar Python).

Mengimplementasikan docs/api/openapi.yaml di atas berkas data situs. Tujuannya dua: (1) membuktikan kontrak dapat dijalankan dan diuji,
(2) menjadi acuan perilaku bagi tim yang membangun versi produksi (mis. Laravel). Bukan untuk produksi publik: tanpa pembatasan laju dan TLS.

Pemakaian:
  TRG_API_TOKEN=rahasia python3 scripts/trg_api_server.py [--port 8780] [--site-data site/peta-riset/data] [--data data/trg] [--forms data/forms]
Jalur tulis (POST profil) dan baca profil memerlukan header  Authorization: Bearer <TRG_API_TOKEN>. Tanpa token terpasang, jalur itu mati (503).
Isian yang diterima disimpan di <forms>/masuk/*.json dan diolah oleh scripts/trg_forms_ingest.py.
"""
import argparse, csv, datetime, hmac, json, os, re, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()
MAX_BODY = 1_000_000


def _fs():
    spec = importlib.util.spec_from_file_location("trg_formspec", os.path.join(HERE, "trg_formspec.py")); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


class App:
    def __init__(self, site_data, data, forms, token):
        self.token, self.data_dir, self.forms = token, data, forms
        J = lambda n: json.load(open(os.path.join(site_data, n + ".json"), encoding="utf-8"))
        self.peneliti, self.trg, self.tag, self.meta, self.ins = J("peneliti"), J("trg"), J("tag"), J("meta"), J("insights")
        self.by_id = {p["id"]: p for p in self.peneliti}; self.by_slug = {t["slug"]: t for t in self.trg}
        self.hay = {p["id"]: norm(" ".join([p["nama"], p["ketua_di"], p["keahlian"], p["trg"], p["tag"]])) for p in self.peneliti}
        import jsonschema
        self.schema = json.load(open(os.path.join(ROOT, "schemas", "profil_trg.schema.json"), encoding="utf-8"))
        self.validator = jsonschema.Draft202012Validator(self.schema)
        os.makedirs(os.path.join(forms, "masuk"), exist_ok=True)

    # ---- baca ----
    @staticmethod
    def page(rows, qs):
        try:
            n = max(1, int(qs.get("halaman", ["1"])[0])); per = min(100, max(1, int(qs.get("per_halaman", ["20"])[0])))
        except ValueError:
            return None
        return {"data": rows[(n - 1) * per: n * per], "meta": {"halaman": n, "per_halaman": per, "total": len(rows)}}

    def list_peneliti(self, qs):
        q = norm(qs.get("q", [""])[0]).split(); rows = []
        for p in self.peneliti:
            if qs.get("klaster") and qs["klaster"][0] not in p["klaster"].split(" · "): continue
            if qs.get("tema") and qs["tema"][0] not in p["tag_ids"].split(";"): continue
            if qs.get("trg") and qs["trg"][0] not in p["trg_slugs"].split(";"): continue
            if qs.get("ketua", [""])[0] == "1" and not p["ketua_di"]: continue
            if qs.get("punya_id", [""])[0] == "1" and not (p["orcid"] or p["sinta_id"] or p["scopus_id"]): continue
            h = self.hay[p["id"]]
            if all(w in h for w in q): rows.append(p)
        return self.page(rows, qs)

    def list_trg(self, qs):
        q = norm(qs.get("q", [""])[0]).split(); rows = []
        for t in self.trg:
            if qs.get("klaster") and t["klaster"] != qs["klaster"][0]: continue
            if qs.get("terverifikasi", [""])[0] == "1" and not t["terverifikasi"]: continue
            if qs.get("terverifikasi", [""])[0] == "0" and t["terverifikasi"]: continue
            h = norm(" ".join([t["nama"], t["fakultas"], t["ketua"], t["tag"]]))
            if all(w in h for w in q): rows.append(t)
        return self.page(rows, qs)

    def profil_prefill(self, slug):
        """Profil awal untuk formulir web: isian terbaru bila ada, kalau tidak dibentuk dari data situs."""
        p = os.path.join(self.forms, "terbaru.json")
        if os.path.exists(p):
            got = json.load(open(p, encoding="utf-8")).get(slug)
            if got: return {"sumber": "isian_terbaru", "profil": got}
        FS = _fs(); t = self.by_slug[slug]
        rows = [r for r in csv.DictReader(open(os.path.join(self.data_dir, "peneliti.csv"), encoding="utf-8")) if r["trg_slug"] == slug]
        peran = {"leader": "Leader", "lecturer": "Lecturer", "lecturers": "Lecturer", "researcher": "Researcher", "researchers": "Researcher", "student": "Student", "students": "Student",
                 "external collaborator": "External collaborator", "external collaborators": "External collaborator", "member": "Member"}
        ang = []
        for r in rows:
            a = {"nama": r["nama"]}
            if peran.get(r["peran"].lower()): a["peran"] = peran[r["peran"].lower()]
            if r["afiliasi"]: a["afiliasi"] = r["afiliasi"]
            if FS.clean_orcid(r["orcid"]): a["orcid"] = FS.clean_orcid(r["orcid"])
            if re.fullmatch(r"\d{3,12}", r["sinta_id"] or ""): a["sinta_id"] = r["sinta_id"]
            if re.fullmatch(r"\d{6,14}", r["scopus_id"] or ""): a["scopus_id"] = r["scopus_id"]
            ang.append(a)
        prof = {"versi": FS.VERSI, "trg_slug": slug, "dikirim_pada": "", "dikirim_oleh": {"nama": ""}, "anggota": ang}
        if t["tag_ids"]: prof["trg"] = {"tema": [x for x in t["tag_ids"].split(";") if x][:3]}
        return {"sumber": "data_situs", "profil": prof}

    def save_profil(self, slug, body):
        errs = [{"jalur": "/".join(map(str, e.path)) or "(isi)", "pesan": e.message} for e in self.validator.iter_errors(body)]
        if body.get("trg_slug") != slug: errs.append({"jalur": "trg_slug", "pesan": "harus sama dengan slug pada alamat"})
        if errs: return 422, {"galat": errs}
        name = f"{slug}_{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.json"
        json.dump(body, open(os.path.join(self.forms, "masuk", name), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return 202, {"diterima": True, "berkas": name}


def make_handler(app):
    class H(BaseHTTPRequestHandler):
        server_version = "TRGApi/1"
        def log_message(self, *a): pass

        def out(self, code, obj, cors=True):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body)))
            if cors: self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers(); self.wfile.write(body)

        def authed(self):
            if not app.token: self.out(503, {"galat": "jalur tulis dimatikan: TRG_API_TOKEN belum dipasang"}, False); return False
            got = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
            if not hmac.compare_digest(got.encode(), app.token.encode()): self.out(401, {"galat": "token tidak valid"}, False); return False
            return True

        def do_GET(self):
            u = urllib.parse.urlparse(self.path); qs = urllib.parse.parse_qs(u.query); parts = [p for p in u.path.split("/") if p]
            if parts[:2] != ["api", "v1"]: return self.out(404, {"galat": "tidak ada"})
            r = parts[2:]
            if r == ["meta"]: return self.out(200, app.meta)
            if r == ["tema"]: return self.out(200, app.tag)
            if r == ["wawasan"]: return self.out(200, app.ins)
            if r == ["skema", "profil-trg"]: return self.out(200, app.schema)
            if r == ["peneliti"]:
                res = app.list_peneliti(qs); return self.out(200, res) if res else self.out(400, {"galat": "halaman/per_halaman tidak valid"})
            if len(r) == 2 and r[0] == "peneliti":
                p = app.by_id.get(r[1]); return self.out(200, p) if p else self.out(404, {"galat": "peneliti tidak ditemukan"})
            if r == ["trg"]:
                res = app.list_trg(qs); return self.out(200, res) if res else self.out(400, {"galat": "halaman/per_halaman tidak valid"})
            if len(r) >= 2 and r[0] == "trg":
                if not SLUG.match(r[1]) or r[1] not in app.by_slug: return self.out(404, {"galat": "TRG tidak ditemukan"})
                if len(r) == 2:
                    t = dict(app.by_slug[r[1]]); t["anggota"] = [p for p in app.peneliti if r[1] in p["trg_slugs"].split(";")]; return self.out(200, t)
                if len(r) == 3 and r[2] == "profil":
                    if not self.authed(): return
                    return self.out(200, app.profil_prefill(r[1]), False)
            self.out(404, {"galat": "tidak ada"})

        def do_POST(self):
            parts = [p for p in urllib.parse.urlparse(self.path).path.split("/") if p]
            if not (len(parts) == 5 and parts[:3] == ["api", "v1", "trg"] and parts[4] == "profil"):
                return self.out(404, {"galat": "tidak ada"})
            if not self.authed(): return
            slug = parts[3]
            if not SLUG.match(slug) or slug not in app.by_slug: return self.out(404, {"galat": "TRG tidak ditemukan"}, False)
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY: return self.out(413, {"galat": "isian terlalu besar"}, False)
            if "json" not in (self.headers.get("Content-Type") or ""): return self.out(415, {"galat": "gunakan application/json"}, False)
            try: body = json.loads(self.rfile.read(n).decode("utf-8"))
            except Exception: return self.out(400, {"galat": "JSON tidak terbaca"}, False)
            code, res = app.save_profil(slug, body); self.out(code, res, False)
    return H


def make_server(port, site_data, data, forms, token):
    app = App(site_data, data, forms, token)
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(app)), app


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8780)
    ap.add_argument("--site-data", default=os.path.join(ROOT, "site", "peta-riset", "data")); ap.add_argument("--data", default=os.path.join(ROOT, "data", "trg")); ap.add_argument("--forms", default=os.path.join(ROOT, "data", "forms"))
    a = ap.parse_args(); srv, _ = make_server(a.port, a.site_data, a.data, a.forms, os.environ.get("TRG_API_TOKEN", ""))
    print(f"API di http://127.0.0.1:{a.port}/api/v1/  (tulis: {'aktif' if os.environ.get('TRG_API_TOKEN') else 'mati; pasang TRG_API_TOKEN'})"); srv.serve_forever()
