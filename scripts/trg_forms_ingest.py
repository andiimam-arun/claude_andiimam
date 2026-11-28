#!/usr/bin/env python3
"""Pengolah isian profil TRG: satu pintu untuk formulir xlsx dan JSON dari portal web.

Pemakaian:
  python3 scripts/trg_forms_ingest.py INPUT [INPUT ...] [--forms-dir data/forms] [--overrides data/overrides] [--data data/trg]
INPUT = berkas .xlsx (Formulir_TRG_<slug>.xlsx yang sudah diisi), berkas .json (satu profil atau daftar profil sesuai
schemas/profil_trg.schema.json), atau folder berisi keduanya.

Alur:
  1. Ubah xlsx menjadi isian JSON, lalu validasi semuanya terhadap skema. Yang gagal masuk data/forms/ditolak.csv dengan alasannya.
  2. Tambahkan yang valid ke data/forms/riwayat.jsonl (hanya menambah; isian identik tidak digandakan).
  3. Ambil isian terbaru tiap TRG -> data/forms/terbaru.json, tabel mitra/riset_unggulan/pendanaan/konsorsium, dan data/trg/verifikasi_trg.csv.
  4. Tulis ulang berkas *.form.csv di data/overrides (ketua, profil_orang, tema_trg). Koreksi manual (*.csv) tetap menang atas isian formulir.
"""
import argparse, csv, datetime, glob, hashlib, json, os, sys
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py")); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


FS = _load("trg_formspec")
PERAN_MAP = {"leader": "Leader", "lecturer": "Lecturer", "lecturers": "Lecturer", "researcher": "Researcher", "researchers": "Researcher", "member": "Member",
             "external": "External collaborator", "external collaborator": "External collaborator", "external collaborators": "External collaborator",
             "student": "Student", "students": "Student"}


def cell(v):
    return "" if v is None else str(v).strip()


def num(v):
    s = cell(v).replace(".", "").replace(",", "").replace("Rp", "").strip()
    return int(s) if s.isdigit() else None


def digits(v):
    s = cell(v)
    return str(int(float(s))) if s.replace(".", "", 1).isdigit() else s


def xlsx_to_payload(path, tag_by_name, slug_hint=None):
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)
    base = os.path.basename(path)
    slug = slug_hint or base.replace("Formulir_TRG_", "").rsplit(".", 1)[0]
    wa, wt = wb["Anggota"], wb["TRG & Riset"]
    pengisi = cell(wt["B44"].value) or "(tidak diisi pada formulir)"
    anggota, warn = [], []
    for r in wa.iter_rows(min_row=5, values_only=True):
        if not cell(r[1]):
            continue
        a = {"nama": cell(r[1])}
        pr = PERAN_MAP.get(cell(r[2]).lower())
        if pr: a["peran"] = pr
        if cell(r[3]): a["afiliasi"] = cell(r[3])
        tema = []
        for x in r[5:8]:
            if cell(x):
                if cell(x) in tag_by_name: tema.append(tag_by_name[cell(x)])
                else: warn.append(f"tema '{cell(x)}' tidak dikenal ({a['nama']})")
        if tema: a["keahlian_tema"] = list(dict.fromkeys(tema))
        if cell(r[8]): a["kata_kunci"] = [k.strip() for k in cell(r[8]).replace(";", ",").split(",") if k.strip()]
        if cell(r[9]): a["orcid"] = FS.clean_orcid(r[9]) or cell(r[9])          # nilai tak valid sengaja diteruskan agar ditolak validator
        if cell(r[10]): a["sinta_id"] = digits(r[10])
        if cell(r[11]): a["scopus_id"] = digits(r[11])
        if cell(r[12]) in FS.STATUS: a["status"] = cell(r[12])
        anggota.append(a)
    trg = {}
    tema = [tag_by_name[cell(wt[f"B{i}"].value)] for i in (5, 6, 7) if cell(wt[f"B{i}"].value) in tag_by_name]
    if tema: trg["tema"] = list(dict.fromkeys(tema))
    if cell(wt["B9"].value): trg["kata_kunci"] = [k.strip() for k in cell(wt["B9"].value).replace(";", ",").split(",") if k.strip()]
    if cell(wt["B10"].value): trg["deskripsi"] = cell(wt["B10"].value)[:600]
    mitra = []
    for r in wt.iter_rows(min_row=14, max_row=18, max_col=4, values_only=True):
        if cell(r[0]):
            m = {"nama": cell(r[0])}
            if cell(r[1]) in FS.JENIS_MITRA: m["jenis"] = cell(r[1])
            if cell(r[2]): m["bentuk"] = cell(r[2])
            if num(r[3]): m["tahun_mulai"] = num(r[3])
            mitra.append(m)
    riset = []
    for r in wt.iter_rows(min_row=22, max_row=24, max_col=7, values_only=True):
        if cell(r[0]):
            x = {"judul": cell(r[0])}
            if cell(r[1]): x["sumber_dana"] = cell(r[1])
            if cell(r[2]): x["mitra"] = cell(r[2])
            if num(r[3]): x["tahun"] = num(r[3])
            if num(r[4]): x["tkt"] = num(r[4])
            if cell(r[5]) in FS.LUARAN: x["luaran"] = cell(r[5])
            if cell(r[6]): x["tautan"] = cell(r[6])
            riset.append(x)
    dana = []
    for r in wt.iter_rows(min_row=30, max_row=39, max_col=4, values_only=True):
        if cell(r[0]) and num(r[1]):
            d = {"sumber": cell(r[0]), "tahun": num(r[1])}
            if num(r[2]) is not None: d["jumlah_rupiah"] = num(r[2])
            if cell(r[3]) in FS.PERAN_DANA: d["peran"] = cell(r[3])
            dana.append(d)
    p = {"versi": FS.VERSI, "trg_slug": slug, "dikirim_pada": datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc).isoformat(timespec="seconds"),
         "dikirim_oleh": {"nama": pengisi}, "anggota": anggota}
    if trg: p["trg"] = trg
    if mitra: p["mitra"] = mitra
    if riset: p["riset_unggulan"] = riset
    if dana: p["pendanaan"] = dana
    if cell(wt["B41"].value) in FS.KONSORSIUM: p["kesediaan_konsorsium"] = cell(wt["B41"].value)
    if cell(wt["B42"].value): p["catatan"] = cell(wt["B42"].value)[:1000]
    return p, warn


def write(path, head, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(head); w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+"); ap.add_argument("--forms-dir", default="data/forms"); ap.add_argument("--overrides", default="data/overrides"); ap.add_argument("--data", default="data/trg")
    a = ap.parse_args()
    import jsonschema
    schema = json.load(open(os.path.join(HERE, "..", "schemas", "profil_trg.schema.json"), encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    tags = list(csv.DictReader(open(f"{a.data}/tag_tier1.csv", encoding="utf-8")))
    tag_by_name, tag_name = {t["nama_id"]: t["tag_id"] for t in tags}, {t["tag_id"]: t["nama_id"] for t in tags}
    slugs = {t["slug"] for t in csv.DictReader(open(f"{a.data}/trg.csv", encoding="utf-8"))}
    os.makedirs(a.forms_dir, exist_ok=True); os.makedirs(a.overrides, exist_ok=True)

    files = []
    for i in a.inputs:
        files += sorted(glob.glob(os.path.join(i, "*"))) if os.path.isdir(i) else [i]
    cand, rejected = [], []
    for f in files:
        ext = f.lower().rsplit(".", 1)[-1]
        try:
            if ext == "xlsx" and not os.path.basename(f).startswith("~$"):
                p, warn = xlsx_to_payload(f, tag_by_name)
                cand.append((f, p)); rejected += [(os.path.basename(f), "peringatan: " + w) for w in warn]
            elif ext == "json":
                d = json.load(open(f, encoding="utf-8")); cand += [(f, x) for x in (d if isinstance(d, list) else [d])]
        except Exception as e:                                           # berkas rusak tidak boleh menghentikan yang lain
            rejected.append((os.path.basename(f), f"tidak terbaca: {e}"))
    hist_path = f"{a.forms_dir}/riwayat.jsonl"
    seen = {json.loads(l)["sha"] for l in open(hist_path, encoding="utf-8")} if os.path.exists(hist_path) else set()
    accepted = 0
    with open(hist_path, "a", encoding="utf-8") as hist:
        for f, p in cand:
            errs = [f"{'/'.join(map(str, e.path)) or '(isi)'}: {e.message}" for e in validator.iter_errors(p)]
            if not errs and p.get("trg_slug") not in slugs:
                errs.append(f"trg_slug '{p.get('trg_slug')}' tidak dikenal")
            if errs:
                rejected += [(os.path.basename(f), e) for e in errs]; continue
            sha = hashlib.sha1(json.dumps(p, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if sha in seen:
                continue
            hist.write(json.dumps({"diterima": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "sha": sha, "sumber": os.path.basename(f), "payload": p}, ensure_ascii=False) + "\n")
            seen.add(sha); accepted += 1
    write(f"{a.forms_dir}/ditolak.csv", ["berkas", "alasan"], rejected)

    latest = {}
    for l in open(hist_path, encoding="utf-8"):
        r = json.loads(l); p = r["payload"]
        t = datetime.datetime.fromisoformat(p["dikirim_pada"].replace("Z", "+00:00"))
        if t.tzinfo is None: t = t.replace(tzinfo=datetime.timezone.utc)
        if p["trg_slug"] not in latest or t >= latest[p["trg_slug"]][0]:
            latest[p["trg_slug"]] = (t, p)
    terbaru = {s: p for s, (t, p) in sorted(latest.items())}
    json.dump(terbaru, open(f"{a.forms_dir}/terbaru.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    OV = _load("trg_overrides")
    prof, ket, tem, mit, ris, dan, kon, ver = [], [], [], [], [], [], [], []
    for s, p in terbaru.items():
        tgl, oleh = p["dikirim_pada"][:10], p["dikirim_oleh"]["nama"]
        for o in p["anggota"]:
            if o.get("peran") == "Leader":
                ket.append([s, o["nama"], "jadikan_ketua", "isian formulir", oleh, tgl])
            kunci = [tag_name[t] for t in o.get("keahlian_tema", [])] + o.get("kata_kunci", [])
            rows = [("keahlian", "; ".join(kunci))] + [(c, o.get(c, "")) for c in ("orcid", "sinta_id", "scopus_id", "afiliasi", "peran")]
            for kol, val in rows:
                if val: prof.append([o["nama"], s, kol, val, "form", "isian formulir", oleh, tgl])
        if p.get("trg", {}).get("tema"):
            tem.append([s, ";".join(p["trg"]["tema"]), "isian formulir", oleh, tgl])
        for m in p.get("mitra", []): mit.append([s, m["nama"], m.get("jenis", ""), m.get("bentuk", ""), m.get("tahun_mulai", ""), tgl])
        for r in p.get("riset_unggulan", []): ris.append([s, r["judul"], r.get("tahun", ""), r.get("sumber_dana", ""), r.get("mitra", ""), r.get("tkt", ""), r.get("luaran", ""), r.get("tautan", ""), tgl])
        for d in p.get("pendanaan", []): dan.append([s, d["sumber"], d["tahun"], d.get("jumlah_rupiah", ""), d.get("peran", ""), tgl])
        kon.append([s, p.get("kesediaan_konsorsium", ""), p.get("catatan", ""), oleh, tgl])
        ver.append([s, tgl, oleh, p["versi"]])
    S = OV.SPEC
    write(f"{a.overrides}/ketua.form.csv", S["ketua"], ket)
    write(f"{a.overrides}/profil_orang.form.csv", S["profil_orang"], prof)
    write(f"{a.overrides}/tema_trg.form.csv", S["tema_trg"], tem)
    write(f"{a.forms_dir}/mitra.csv", ["trg_slug", "nama", "jenis", "bentuk", "tahun_mulai", "tanggal"], mit)
    write(f"{a.forms_dir}/riset_unggulan.csv", ["trg_slug", "judul", "tahun", "sumber_dana", "mitra", "tkt", "luaran", "tautan", "tanggal"], ris)
    write(f"{a.forms_dir}/pendanaan.csv", ["trg_slug", "sumber", "tahun", "jumlah_rupiah", "peran", "tanggal"], dan)
    write(f"{a.forms_dir}/konsorsium.csv", ["trg_slug", "kesediaan", "catatan", "oleh", "tanggal"], kon)
    write(f"{a.data}/verifikasi_trg.csv", ["trg_slug", "tanggal", "oleh", "versi"], ver)
    print(f"diterima {accepted} isian baru | ditolak/peringatan {len(rejected)} | TRG terverifikasi {len(terbaru)} | override: ketua {len(ket)}, profil {len(prof)}, tema {len(tem)}")


if __name__ == "__main__":
    main()
