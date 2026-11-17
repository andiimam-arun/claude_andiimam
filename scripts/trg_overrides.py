#!/usr/bin/env python3
"""Lapis koreksi manusia (override) untuk pipa data TRG.

Berkas CSV di data/overrides/ (atau TRG_OVERRIDES) selalu menang atas data otomatis dan bertahan lintas crawl.
Setiap baris mencatat alasan, pemberi koreksi, dan tanggal. Baris yang tidak cocok dengan data dilaporkan, bukan diabaikan diam-diam.

Berkas:
  ketua.csv         trg_slug, nama, aksi (jadikan_ketua | bukan_ketua | konfirmasi)
  orang_gabung.csv  nama_a, nama_b                     paksa dua nama menjadi satu orang
  orang_pisah.csv   nama, trg_slug_a, trg_slug_b       jangan gabungkan baris bernama sama di dua TRG ini
  tema_trg.csv      trg_slug, tag_ids (dipisah ;)       ganti tema Tingkat 1 sebuah TRG
  kata_kunci.csv    istilah, aksi (buang | padanan), padanan_id   atur awan kata kunci
  profil_orang.csv  nama, trg_slug, kolom, nilai, sumber   timpa isian orang (keahlian, orcid, sinta_id, scopus_id, afiliasi, peran)
"""
import csv, os

DIR = os.environ.get("TRG_OVERRIDES", "data/overrides")
COMMON = ["alasan", "oleh", "tanggal"]
SPEC = {
    "ketua": ["trg_slug", "nama", "aksi"] + COMMON,
    "orang_gabung": ["nama_a", "nama_b"] + COMMON,
    "orang_pisah": ["nama", "trg_slug_a", "trg_slug_b"] + COMMON,
    "tema_trg": ["trg_slug", "tag_ids"] + COMMON,
    "kata_kunci": ["istilah", "aksi", "padanan_id"] + COMMON,
    "profil_orang": ["nama", "trg_slug", "kolom", "nilai", "sumber"] + COMMON,
}
PROFIL_KOLOM = {"keahlian", "orcid", "sinta_id", "scopus_id", "afiliasi", "peran"}


class Report:
    def __init__(self):
        self.applied, self.problems = [], []

    def ok(self, msg): self.applied.append(msg)
    def bad(self, msg): self.problems.append(msg)

    def write(self, path):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"Override diterapkan: {len(self.applied)} | bermasalah: {len(self.problems)}\n\n")
            fh.write("BERMASALAH (periksa; baris ini tidak berefek):\n" + "".join(f"- {m}\n" for m in self.problems) + "\nDITERAPKAN:\n" + "".join(f"- {m}\n" for m in self.applied))


def init(directory=None):
    """Buat berkas kosong berkepala bila belum ada (agar tim tahu formatnya)."""
    d = directory or DIR
    os.makedirs(d, exist_ok=True)
    for name, cols in SPEC.items():
        p = os.path.join(d, name + ".csv")
        if not os.path.exists(p):
            with open(p, "w", newline="", encoding="utf-8") as fh:
                csv.writer(fh).writerow(cols)


def load(name):
    """Baca <nama>.form.csv (dibuat otomatis dari formulir) lalu <nama>.csv (koreksi manual): urutan ini membuat koreksi manual menang."""
    rows = []
    for suffix in (".form.csv", ".csv"):
        p = os.path.join(DIR, name + suffix)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            rd = csv.DictReader(fh)
            missing = [c for c in SPEC[name] if c not in (rd.fieldnames or [])]
            if missing:
                raise SystemExit(f"{p}: kolom hilang {missing}; harus {SPEC[name]}")
            for r in rd:
                if not any((v or "").strip() for v in r.values()) or (r.get(SPEC[name][0]) or "").lstrip().startswith("#"):
                    continue
                rows.append({k: (v or "").strip() for k, v in r.items()})
    return rows


def apply_people(pen, norm_name, rep):
    """Terapkan profil_orang dan ketua langsung pada baris peneliti mentah (sebelum dedup)."""
    fields = list(pen[0].keys()) if pen else []
    keyed = lambda r: norm_name(r["nama"])
    for o in load("profil_orang"):
        if o["kolom"] not in PROFIL_KOLOM:
            rep.bad(f"profil_orang: kolom '{o['kolom']}' tidak dikenal ({o['nama']})"); continue
        hit = [r for r in pen if keyed(r) == norm_name(o["nama"]) and (not o["trg_slug"] or r["trg_slug"] == o["trg_slug"])]
        if not hit and o["trg_slug"]:      # orang baru dari formulir: tambahkan sebagai anggota TRG tersebut
            new = {f: "" for f in fields}; new.update(trg_slug=o["trg_slug"], peran="Member", nama=o["nama"]); pen.append(new); hit = [new]
            rep.ok(f"profil_orang: anggota baru '{o['nama']}' di {o['trg_slug']}")
        if not hit:
            rep.bad(f"profil_orang: tidak ada baris untuk '{o['nama']}' {o['trg_slug']}"); continue
        for r in hit:
            r[o["kolom"]] = o["nilai"]
        rep.ok(f"profil_orang: {o['nama']} {o['kolom']} -> {o['nilai'][:40]} ({len(hit)} baris, sumber {o['sumber'] or '-'})")
    for o in load("ketua"):
        key = norm_name(o["nama"]); hit = [r for r in pen if r["trg_slug"] == o["trg_slug"] and keyed(r) == key]
        if o["aksi"] == "konfirmasi":
            rep.ok(f"ketua: {o['nama']} dikonfirmasi di {o['trg_slug']}" + ("" if hit else " (nama tidak ditemukan)")); continue
        if o["aksi"] == "jadikan_ketua":
            if hit:
                for r in hit: r["peran"] = "Leader"
            else:
                new = {f: "" for f in fields}; new.update(trg_slug=o["trg_slug"], peran="Leader", nama=o["nama"]); pen.append(new)
            rep.ok(f"ketua: {o['nama']} jadi ketua {o['trg_slug']}" + ("" if hit else " (baris baru ditambahkan)"))
        elif o["aksi"] == "bukan_ketua":
            if not hit:
                rep.bad(f"ketua: '{o['nama']}' tidak ada di {o['trg_slug']}"); continue
            for r in hit:
                if r["peran"] == "Leader": r["peran"] = "Researcher"
            rep.ok(f"ketua: {o['nama']} bukan ketua {o['trg_slug']}")
        else:
            rep.bad(f"ketua: aksi '{o['aksi']}' tidak dikenal")


def forced_merges(norm_name):
    return [(norm_name(o["nama_a"]), norm_name(o["nama_b"])) for o in load("orang_gabung")]


def separations(norm_name):
    out = set()
    for o in load("orang_pisah"):
        k = norm_name(o["nama"]); out.add((k, o["trg_slug_a"], o["trg_slug_b"])); out.add((k, o["trg_slug_b"], o["trg_slug_a"]))
    return out


def tema(valid_tags, valid_slugs, rep):
    out = {}
    for o in load("tema_trg"):
        ids = [x for x in o["tag_ids"].replace(",", ";").split(";") if x.strip()]
        bad = [x for x in ids if x not in valid_tags]
        if o["trg_slug"] not in valid_slugs:
            rep.bad(f"tema_trg: slug '{o['trg_slug']}' tidak ada"); continue
        if bad or not ids:
            rep.bad(f"tema_trg: {o['trg_slug']} berisi kode tema tidak dikenal {bad}"); continue
        out[o["trg_slug"]] = [x.strip() for x in ids]; rep.ok(f"tema_trg: {o['trg_slug']} -> {';'.join(ids)}")
    return out


def keywords(rep):
    drop, alias = set(), {}
    for o in load("kata_kunci"):
        if o["aksi"] == "buang":
            drop.add(o["istilah"].lower()); rep.ok(f"kata_kunci: buang '{o['istilah']}'")
        elif o["aksi"] == "padanan" and o["padanan_id"]:
            alias[o["istilah"].lower()] = o["padanan_id"]; rep.ok(f"kata_kunci: '{o['istilah']}' = '{o['padanan_id']}'")
        else:
            rep.bad(f"kata_kunci: baris tidak valid ({o['istilah']}, {o['aksi']})")
    return drop, alias


if __name__ == "__main__":
    init(); print("berkas override siap di", DIR)
