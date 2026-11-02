#!/usr/bin/env python3
"""Tulis schemas/profil_trg.schema.json dari data tema dan konstanta kontrak (agar pilihan selalu sinkron).
Pemakaian: python3 scripts/trg_schema.py"""
import csv, json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
import importlib.util
sp = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "trg_formspec.py")); S = importlib.util.module_from_spec(sp); sp.loader.exec_module(S)
tags = list(csv.DictReader(open(os.path.join(ROOT, "data", "trg", "tag_tier1.csv"), encoding="utf-8")))
tag_ids = [t["tag_id"] for t in tags]
ORCID = r"^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$"
orang = {
    "type": "object", "additionalProperties": False, "required": ["nama"],
    "properties": {
        "nama": {"type": "string", "minLength": 2, "description": "Nama lengkap dengan gelar, sebagaimana ditulis di situs TRG"},
        "peran": {"enum": S.PERAN}, "afiliasi": {"type": "string"},
        "keahlian_tema": {"type": "array", "maxItems": 3, "uniqueItems": True, "items": {"enum": tag_ids}, "description": "Maksimal 3 kode tema Tingkat 1 (tag_tier1.csv)"},
        "kata_kunci": {"type": "array", "maxItems": 10, "items": {"type": "string", "minLength": 2}},
        "orcid": {"type": "string", "pattern": ORCID}, "sinta_id": {"type": "string", "pattern": r"^\d{3,12}$"}, "scopus_id": {"type": "string", "pattern": r"^\d{6,14}$"},
        "status": {"enum": S.STATUS}}}
schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://glori.unhas.ac.id/schemas/profil_trg.schema.json",
    "title": "Profil TRG (isian berkelanjutan)", "description": "Satu pengiriman = profil lengkap satu TRG. Pengiriman terbaru menggantikan yang lama; riwayat disimpan.",
    "type": "object", "additionalProperties": False, "required": ["versi", "trg_slug", "dikirim_pada", "dikirim_oleh", "anggota"],
    "properties": {
        "versi": {"const": S.VERSI}, "trg_slug": {"type": "string", "pattern": r"^[A-Za-z0-9][A-Za-z0-9_-]*$"},
        "dikirim_pada": {"type": "string", "format": "date-time"},
        "dikirim_oleh": {"type": "object", "additionalProperties": False, "required": ["nama"], "properties": {"nama": {"type": "string", "minLength": 2}, "akun": {"type": "string", "description": "ID akun portal, bukan email"}}},
        "anggota": {"type": "array", "minItems": 1, "items": orang},
        "trg": {"type": "object", "additionalProperties": False, "properties": {
            "tema": {"type": "array", "maxItems": 3, "uniqueItems": True, "items": {"enum": tag_ids}},
            "kata_kunci": {"type": "array", "maxItems": 10, "items": {"type": "string"}}, "deskripsi": {"type": "string", "maxLength": 600}}},
        "mitra": {"type": "array", "maxItems": 10, "items": {"type": "object", "additionalProperties": False, "required": ["nama"], "properties": {
            "nama": {"type": "string"}, "jenis": {"enum": S.JENIS_MITRA}, "bentuk": {"type": "string"}, "tahun_mulai": {"type": "integer", "minimum": 1990, "maximum": 2100}}}},
        "riset_unggulan": {"type": "array", "maxItems": 5, "items": {"type": "object", "additionalProperties": False, "required": ["judul"], "properties": {
            "judul": {"type": "string"}, "tahun": {"type": "integer", "minimum": 1990, "maximum": 2100}, "sumber_dana": {"type": "string"}, "mitra": {"type": "string"},
            "tkt": {"type": "integer", "minimum": 1, "maximum": 9}, "luaran": {"enum": S.LUARAN}, "tautan": {"type": "string"}}}},
        "pendanaan": {"type": "array", "maxItems": 10, "description": "Pendanaan riset 5 tahun terakhir; dasar penilaian kelayakan konsorsium/institut", "items": {
            "type": "object", "additionalProperties": False, "required": ["sumber", "tahun"], "properties": {
                "sumber": {"type": "string", "description": "Pemberi dana atau skema"}, "tahun": {"type": "integer", "minimum": 2015, "maximum": 2100},
                "jumlah_rupiah": {"type": "integer", "minimum": 0}, "peran": {"enum": S.PERAN_DANA}}}},
        "kesediaan_konsorsium": {"enum": S.KONSORSIUM}, "catatan": {"type": "string", "maxLength": 1000}}}
os.makedirs(os.path.join(ROOT, "schemas"), exist_ok=True)
json.dump(schema, open(os.path.join(ROOT, "schemas", "profil_trg.schema.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
example = {"versi": S.VERSI, "trg_slug": "ocnrg", "dikirim_pada": "2026-11-02T09:30:00+08:00", "dikirim_oleh": {"nama": "Nama Ketua TRG", "akun": "u-001"},
           "anggota": [{"nama": "Dr. Contoh Nama, S.Gz., MPH", "peran": "Leader", "afiliasi": "Fakultas Kesehatan Masyarakat, Unhas",
                        "keahlian_tema": ["D03", "D04"], "kata_kunci": ["obesitas anak", "mikrobioma usus"], "orcid": "0000-0002-1825-0097", "sinta_id": "6012345", "status": "Aktif"}],
           "trg": {"tema": ["D03"], "kata_kunci": ["gizi anak", "obesitas"], "deskripsi": "Riset pencegahan obesitas anak berbasis komunitas."},
           "mitra": [{"nama": "Contoh University", "jenis": "Perguruan tinggi/lembaga luar negeri", "bentuk": "riset bersama", "tahun_mulai": 2023}],
           "riset_unggulan": [{"judul": "Contoh judul riset", "tahun": 2025, "sumber_dana": "Hibah contoh", "tkt": 4, "luaran": "Artikel jurnal"}],
           "pendanaan": [{"sumber": "Hibah contoh", "tahun": 2025, "jumlah_rupiah": 250000000, "peran": "Ketua"}], "kesediaan_konsorsium": "Ya", "catatan": "Contoh pengisian; hapus sebelum dipakai."}
json.dump(example, open(os.path.join(ROOT, "schemas", "profil_trg.contoh.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("skema:", len(tag_ids), "tema;", "versi", S.VERSI)


# ---------- skema model baca (kontrak API untuk situs) ----------
def save(name, obj):
    json.dump(obj, open(os.path.join(ROOT, "schemas", name), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
STR, INT = {"type": "string"}, {"type": "integer", "minimum": 0}
def arr(item): return {"type": "array", "items": item}
def obj(props, req): return {"type": "object", "additionalProperties": False, "required": req, "properties": props}
D2020 = "https://json-schema.org/draft/2020-12/schema"
save("peneliti.schema.json", {"$schema": D2020, "title": "Peneliti unik", **arr(obj({
    "id": {"type": "string", "pattern": "^P\\d{5}$"}, "nama": STR, "peran": STR, "ketua_di": {**STR, "description": "Nama TRG yang dipimpin, dipisah ' · '"},
    "trg_slugs": {**STR, "description": "Slug TRG dipisah ';' (kunci ke trg.json)"}, "trg": STR, "trg_n": INT, "klaster": STR, "tag_ids": {**STR, "description": "Kode tema dipisah ';'"},
    "tag": STR, "keahlian": STR, "id_peneliti": STR, "orcid": STR, "sinta_id": STR, "scopus_id": STR},
    ["id", "nama", "peran", "ketua_di", "trg_slugs", "klaster", "tag_ids", "keahlian", "orcid", "sinta_id", "scopus_id"]))})
save("trg.schema.json", {"$schema": D2020, "title": "Daftar TRG", **arr(obj({
    "slug": STR, "nama": STR, "fakultas": STR, "klaster": STR, "tag": STR, "tag_ids": STR, "n_peneliti": INT, "pct_keahlian": INT, "pct_id": INT,
    "n_publikasi": INT, "n_buku": INT, "n_paten": INT, "n_proyek": INT, "masalah": STR, "url": STR, "ketua": STR,
    "terverifikasi": {**STR, "description": "Tanggal isian terakhir yang dikonfirmasi ketua (AAAA-BB-HH), kosong bila belum"}},
    ["slug", "nama", "fakultas", "klaster", "tag_ids", "n_peneliti", "n_publikasi", "url", "ketua", "terverifikasi"]))})
save("tag.schema.json", {"$schema": D2020, "title": "Tema Tingkat 1", **arr(obj({
    "tag_id": {"type": "string", "pattern": "^[A-D]\\d{2}$"}, "nama": STR, "name_en": STR, "klaster": STR, "n_trg": INT, "n_peneliti": INT, "n_publikasi": INT},
    ["tag_id", "nama", "name_en", "klaster", "n_trg", "n_peneliti"]))})
save("meta.schema.json", {"$schema": D2020, "title": "Meta", **obj({"dibuat": STR, "sumber": STR, "n_trg": INT, "n_peneliti": INT, "n_ketua": INT, "n_trg_ketua": INT, "n_artikel": INT},
    ["dibuat", "n_trg", "n_peneliti", "n_artikel"])})
kual = obj({"n_cocok": INT, "cakupan": INT, "sitasi_rata": {"type": ["number", "null"]}, "fwci_median": {"type": ["number", "null"]}, "top10_pct": INT, "oa_pct": INT},
           ["n_cocok", "cakupan", "top10_pct", "oa_pct"])
save("insights.schema.json", {"$schema": D2020, "title": "Wawasan", **obj({
    "diperkaya": {"type": "boolean"}, "n_artikel_cocok": INT, "n_artikel_unik": INT, "n_dengan_tahun": INT, "tahun_min": INT, "tahun_maks": INT,
    "tema": arr(obj({"id": STR, "n_artikel": INT, "kualitas": kual}, ["id", "n_artikel"])),
    "edges": arr({"type": "array", "prefixItems": [STR, STR, INT], "minItems": 3, "maxItems": 3}),
    "keywords": arr(obj({"t": STR, "id": STR, "n": INT, "n_trg": INT, "klaster": STR, "slugs": arr(STR), "tema": arr(STR)}, ["t", "n", "n_trg", "klaster", "slugs"]))},
    ["n_artikel_unik", "tema", "edges", "keywords"])})
metr = obj({"oa": STR, "h": INT, "s": INT, "k": INT, "b": arr(STR), "d": {"enum": ["orcid", "scopus", "nama"]}}, ["oa", "h", "s", "k", "d"])
luar = obj({"oa": STR, "nama": STR, "orcid": STR, "h": INT, "s": INT, "k": INT, "b": arr(STR), "t": arr(STR), "x": arr(STR), "u": INT}, ["oa", "nama", "h", "s", "k"])
save("openalex.schema.json", {"$schema": D2020, "title": "Pengayaan OpenAlex (opsional)", **obj({
    "dibuat": STR, "sumber": STR, "institusi": STR, "n_penulis": INT, "n_peneliti_trg": INT, "n_cocok": INT, "n_tinjau": INT, "n_luar_trg": INT,
    "metrik": {"type": "object", "description": "id peneliti situs -> metrik OpenAlex", "additionalProperties": metr}, "luar_trg": arr(luar),
    "bidang": arr(obj({"nama": STR, "n_penulis": INT, "sitasi": INT, "di_trg": INT, "luar_trg": INT}, ["nama", "n_penulis", "sitasi", "di_trg", "luar_trg"]))},
    ["dibuat", "sumber", "n_penulis", "n_cocok", "n_luar_trg", "metrik", "luar_trg", "bidang"])})
save("kuartil.schema.json", {"$schema": D2020, "title": "Artikel Q1-Q4 per TRG (opsional)", **obj({
    "dibuat": STR, "sumber": STR, "sjr_tahun": arr(INT), "dari": INT,
    "total": obj({k: INT for k in ("artikel", "tercocok", "bertindeks", "Q1", "Q2", "Q3", "Q4", "Q12")}, ["artikel", "tercocok", "bertindeks", "Q1", "Q2", "Q12"]),
    "trg": {"type": "object", "description": "slug TRG -> hitungan", "additionalProperties": obj({"n": INT, "c": INT, "i": INT, "q1": INT, "q2": INT, "q3": INT, "q4": INT}, ["n", "c", "i", "q1", "q2", "q3", "q4"])}},
    ["dibuat", "sumber", "sjr_tahun", "dari", "total", "trg"])})
print("skema model baca: peneliti, trg, tag, meta, insights, openalex, kuartil")
