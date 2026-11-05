"""Konstanta kontrak isian profil TRG, dipakai bersama oleh formulir xlsx, skema JSON, dan pengolah isian."""
import importlib.util, os

VERSI = 2
JENIS_MITRA = ["Pemerintah pusat", "Pemerintah daerah", "Industri/swasta", "LSM/komunitas", "Perguruan tinggi dalam negeri",
               "Perguruan tinggi/lembaga luar negeri", "Lembaga riset (BRIN dll.)", "Rumah sakit/fasilitas kesehatan", "Lainnya"]
STATUS = ["Aktif", "Tidak aktif lagi"]
TKT = [str(i) for i in range(1, 10)]
LUARAN = ["Artikel jurnal", "Buku/bab buku", "HKI/paten", "Produk/prototipe", "Kebijakan/rekomendasi", "Pelatihan/pendampingan", "Lainnya"]
PERAN = ["Leader", "Lecturer", "Researcher", "Member", "External collaborator", "Student"]
PERAN_DANA = ["Ketua", "Anggota"]
KONSORSIUM = ["Ya", "Mungkin", "Tidak"]


def load_module(name):
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), name + ".py")
    spec = importlib.util.spec_from_file_location(name, p); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


import re
ORCID_RX = re.compile(r"(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])", re.I)


def orcid_ok(o):
    d = o.replace("-", "").upper()
    if len(d) != 16:
        return False
    t = 0
    for c in d[:15]:
        t = (t + int(c)) * 2
    r = (12 - t % 11) % 11
    return d[15] == ("X" if r == 10 else str(r))


def clean_orcid(raw):
    """ORCID baku xxxx-xxxx-xxxx-xxxx dari teks isian, atau '' bila tidak ada / checksum salah."""
    m = ORCID_RX.search(str(raw or ""))
    if not m:
        return ""
    o = "-".join(m.groups()).upper()
    return o if orcid_ok(o) else ""
