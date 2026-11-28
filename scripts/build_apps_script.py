#!/usr/bin/env python3
"""Bangun paket Google Apps Script (Aplikasi Web) dari site/peta-riset.

Pemakaian:
  python3 scripts/build_apps_script.py --out DIR [--preview DIR/pratinjau.html]
Hasil di DIR: Code.gs, appsscript.json (dari deploy/apps-script/), Index.html, Css.html, Config.html, Data.html, App.html.
Apps Script hanya menerima berkas .gs dan .html, jadi CSS dan JavaScript dimasukkan sebagai HTML lalu disisipkan ke Index lewat include().
--preview menulis satu berkas HTML utuh yang meniru rakitan HtmlService, untuk diuji di peramban lokal.
"""
import argparse, base64, os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SITE = os.path.join(ROOT, "site", "peta-riset")
SRC = os.path.join(ROOT, "deploy", "apps-script")
rd = lambda p: open(p, encoding="utf-8").read()


def must(s, old, new, n=1):
    if s.count(old) != n:
        sys.exit(f"build gagal: '{old[:60]}' ditemukan {s.count(old)} kali, seharusnya {n}")
    return s.replace(old, new)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--preview", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    idx = rd(f"{SITE}/index.html")
    idx = re.sub(r'<link rel="icon"[^>]*>\n?', "", idx)
    idx = re.sub(r'<link rel="stylesheet" href="assets/css/peta\.css[^"]*">', "<style><?!= include('Css') ?></style>", idx)
    logo = "data:image/png;base64," + base64.b64encode(open(f"{SITE}/assets/img/logo-glori.png", "rb").read()).decode()
    idx = must(idx, 'src="assets/img/logo-glori.png"', f'src="{logo}"')
    scripts = re.findall(r'<script src="[^"]+"></script>', idx)
    if len(scripts) != 3:
        sys.exit(f"build gagal: diharapkan 3 tag script, ada {len(scripts)}")
    idx = idx.replace("\n".join(scripts), "<script>window.PETA_QS = <?!= JSON.stringify(qs) ?>;</script>\n<script><?!= include('Config') ?></script>\n<script><?!= include('Data') ?></script>\n<script><?!= include('App') ?></script>")
    app = rd(f"{SITE}/assets/js/app.js")
    app = must(app, "new URLSearchParams(location.search)", "new URLSearchParams(window.PETA_QS != null ? window.PETA_QS : location.search)", 2)   # alamat dari parameter web app, bukan dari iframe
    files = {"Index.html": idx, "Css.html": rd(f"{SITE}/assets/css/peta.css"), "Config.html": rd(f"{SITE}/assets/js/config.js"), "Data.html": rd(f"{SITE}/data/peta-data.js"), "App.html": app}
    for name, txt in files.items():
        if name != "Index.html" and re.search(r"</script|<\?|\?>", txt):
            sys.exit(f"build gagal: {name} memuat urutan yang akan merusak templat ('</script', '<?' atau '?>')")
        open(os.path.join(a.out, name), "w", encoding="utf-8").write(txt)
    for f in ("Code.gs", "appsscript.json"):
        shutil.copy(os.path.join(SRC, f), os.path.join(a.out, f))
    shutil.copy(os.path.join(SRC, ".clasp.json.contoh"), os.path.join(a.out, ".clasp.json.contoh")); shutil.copy(os.path.join(SRC, "README.md"), os.path.join(a.out, "README.md"))
    if a.preview:                                                  # tiruan HtmlService: include() + JSON.stringify(qs)
        qs = os.environ.get("PREVIEW_QS", "")
        html = re.sub(r"<\?!= include\('(\w+)'\) \?>", lambda m: files[m.group(1) + ".html"], idx)
        html = html.replace("<?!= JSON.stringify(qs) ?>", '"' + qs.replace('"', "") + '"')
        open(a.preview, "w", encoding="utf-8").write(html)
    tot = sum(len(v.encode()) for v in files.values())
    print("dibuat di", a.out, "|", {k: len(v.encode()) for k, v in files.items()}, "| total", tot, "bytes")


if __name__ == "__main__":
    main()
