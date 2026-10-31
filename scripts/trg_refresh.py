#!/usr/bin/env python3
"""Satu perintah pembaruan data Peta Riset: sumber otomatis -> isian formulir -> koreksi manusia -> data situs -> laporan perubahan.

Pemakaian:
  python3 scripts/trg_refresh.py --cache CACHE_DIR [--skip-crawl] [--enrich] [--forms-xlsx] [--no-snapshot]

Urutan:
  1. crawl halaman TRG                     (dilewati dengan --skip-crawl)
  2. olah isian formulir di data/forms/masuk (xlsx/JSON dari portal atau kiriman email)
  3. pengayaan OpenAlex/Crossref/ORCID     (hanya dengan --enrich; perlu jaringan dan BIBLIO_MAILTO)
  4. dedup + koreksi manusia, tema, laporan kelengkapan
  5. data situs (tanpa mahasiswa), wawasan, uji kontrak API
  6. laporan perubahan terhadap putaran sebelumnya -> data/perubahan/AAAA-MM-HH.md, dan snapshot ringkas data/snapshots/AAAA-MM-HH/
Berhenti bila uji kontrak gagal, agar data rusak tidak sampai ke situs.
"""
import argparse, csv, datetime, glob, gzip, os, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
D = os.environ.get("TRG_DATA", os.path.join(ROOT, "data", "trg"))
SITE = os.path.join(ROOT, "site", "peta-riset", "data")


def run(*args, ok_codes=(0,)):
    print("\n$", " ".join(os.path.relpath(a, ROOT) if os.path.isabs(a) else a for a in args), flush=True)
    r = subprocess.run([sys.executable, "-I", *args], cwd=ROOT)
    if r.returncode not in ok_codes:
        sys.exit(f"GAGAL ({r.returncode}): {' '.join(args)}")


def read(path):
    return list(csv.DictReader(open(path, encoding="utf-8"))) if os.path.exists(path) else []


def state():
    """Ringkasan keadaan data untuk dibandingkan antar-putaran."""
    people = read(f"{D}/peneliti_unik.csv"); trg = read(f"{D}/trg.csv")
    lead = {}
    for p in people:
        for s in [x for x in p["ketua_slugs"].split(";") if x]:
            lead.setdefault(s, set()).add(p["nama_norm"])
    return dict(orang={p["nama_norm"] for p in people if p["nama_norm"]}, trg={t["slug"]: t["nama"] for t in trg}, ketua=lead,
                n_artikel={t["slug"]: int(t["n_publikasi"]) for t in trg}, n_peneliti={t["slug"]: int(t["n_peneliti"]) for t in trg},
                tanpa_ketua={t["slug"] for t in trg if t["slug"] not in lead})


def lst(items, n=40):
    items = sorted(items)
    return "".join(f"- {x}\n" for x in items[:n]) + (f"- … dan {len(items) - n} lainnya\n" if len(items) > n else "")


def report(old, new, today):
    out = [f"# Laporan perubahan data TRG — {today}\n"]
    if old is None:
        out.append("Ini putaran pertama; tidak ada pembanding.\n"); return "".join(out)
    added, removed = new["orang"] - old["orang"], old["orang"] - new["orang"]
    out.append(f"| | Sebelum | Sesudah |\n|---|---|---|\n| TRG | {len(old['trg'])} | {len(new['trg'])} |\n| Orang unik | {len(old['orang'])} | {len(new['orang'])} |\n"
               f"| TRG dengan ketua terbaca | {len(old['trg']) - len(old['tanpa_ketua'])} | {len(new['trg']) - len(new['tanpa_ketua'])} |\n"
               f"| Artikel tercatat (baris) | {sum(old['n_artikel'].values())} | {sum(new['n_artikel'].values())} |\n\n")
    if not (added or removed) and old["ketua"] == new["ketua"] and old["trg"] == new["trg"]:
        out.append("Tidak ada perubahan pada daftar orang, ketua, atau TRG.\n"); return "".join(out)
    if old["trg"] != new["trg"]:
        out.append("## TRG berubah\n" + lst([f"+ {new['trg'][s]} ({s})" for s in new["trg"].keys() - old["trg"].keys()] + [f"− {old['trg'][s]} ({s})" for s in old["trg"].keys() - new["trg"].keys()]) + "\n")
    changed = [f"{new['trg'].get(s, old['trg'].get(s))}: {', '.join(sorted(old['ketua'].get(s, {'(tidak ada)'})))} → {', '.join(sorted(new['ketua'].get(s, {'(tidak ada)'})))}"
               for s in sorted(set(old["ketua"]) | set(new["ketua"])) if old["ketua"].get(s) != new["ketua"].get(s)]
    if changed:
        out.append("## Ketua berubah (periksa; bisa karena perbaikan parser atau pergantian nyata)\n" + lst(changed) + "\n")
    if added: out.append(f"## Orang baru ({len(added)})\n" + lst(added) + "\n")
    if removed: out.append(f"## Orang hilang ({len(removed)}) — mungkin nama diubah atau digabung\n" + lst(removed) + "\n")
    drop = [f"{new['trg'][s]}: {old['n_peneliti'][s]} → {new['n_peneliti'][s]} anggota" for s in new["trg"] if s in old["n_peneliti"] and new["n_peneliti"][s] < old["n_peneliti"][s] * 0.7 and old["n_peneliti"][s] >= 5]
    if drop: out.append("## Peringatan: jumlah anggota turun tajam (kemungkinan halaman TRG berubah atau parser gagal)\n" + lst(drop) + "\n")
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache"); ap.add_argument("--skip-crawl", action="store_true"); ap.add_argument("--enrich", action="store_true")
    ap.add_argument("--forms-xlsx", action="store_true", help="buat ulang formulir xlsx berisi data terbaru"); ap.add_argument("--no-snapshot", action="store_true")
    a = ap.parse_args()
    if not a.skip_crawl and not a.cache:
        sys.exit("--cache wajib bila crawl dijalankan (atau gunakan --skip-crawl)")
    today = datetime.date.today().isoformat()
    old = state() if os.path.exists(f"{D}/peneliti_unik.csv") else None
    if not a.skip_crawl:
        run("scripts/trg_crawl.py", "--out", D, "--cache", a.cache)
    intake = os.path.join(ROOT, "data", "forms", "masuk")
    if os.path.isdir(intake) and os.listdir(intake):
        run("scripts/trg_forms_ingest.py", intake)
    if a.enrich:
        if not os.environ.get("BIBLIO_MAILTO"):
            print("PERINGATAN: BIBLIO_MAILTO belum diisi; pengayaan berjalan lebih lambat dan bisa dibatasi.")
        run("scripts/trg_dedup_tags.py")                               # peneliti_unik (ber-ID) dibutuhkan pengayaan
        run("scripts/trg_enrich.py", "--cache", os.path.join(a.cache or ROOT, "biblio"), "--out", D, "--data", D)
    run("scripts/trg_dedup_tags.py"); run("scripts/trg_tag_tier1.py"); run("scripts/trg_report.py")
    run("scripts/trg_dashboard_data.py", SITE, "--tanpa-mahasiswa"); run("scripts/trg_insights.py")
    run("scripts/trg_api_check.py", SITE)
    if a.forms_xlsx:
        shutil.rmtree(os.path.join(ROOT, "forms", "trg"), ignore_errors=True); run("scripts/trg_forms.py")
    new = state()
    os.makedirs(os.path.join(ROOT, "data", "perubahan"), exist_ok=True)
    rp = os.path.join(ROOT, "data", "perubahan", f"{today}.md")
    open(rp, "w", encoding="utf-8").write(report(old, new, today))
    if not a.no_snapshot:
        sd = os.path.join(ROOT, "data", "snapshots", today); os.makedirs(sd, exist_ok=True)
        for f in ("peneliti_unik", "trg", "laporan_kelengkapan"):
            with open(f"{D}/{f}.csv", "rb") as src, gzip.open(os.path.join(sd, f + ".csv.gz"), "wb") as dst:
                shutil.copyfileobj(src, dst)
    print(f"\nSELESAI. Laporan perubahan: {os.path.relpath(rp, ROOT)}")
    print(open(rp, encoding="utf-8").read()[:1500])


if __name__ == "__main__":
    main()
