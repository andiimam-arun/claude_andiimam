# Koreksi manusia (override)

Berkas di folder ini **selalu menang atas data otomatis** dan bertahan setiap kali crawl diulang. Sunting dengan Excel atau editor teks
(CSV UTF-8, satu baris per koreksi). Isi selalu kolom `alasan`, `oleh`, dan `tanggal` (AAAA-BB-HH) agar jejaknya bisa diaudit.
Setelah menjalankan pipa, `data/trg/override_laporan.txt` menyebut baris mana yang berlaku dan mana yang tidak cocok dengan data.

| Berkas | Kolom khusus | Fungsi |
|---|---|---|
| `ketua.csv` | `trg_slug`, `nama`, `aksi` = `jadikan_ketua` / `bukan_ketua` / `konfirmasi` | Tetapkan, cabut, atau konfirmasi ketua TRG (termasuk 16 ketua yang diduga di `ketua_diduga.csv`) |
| `orang_gabung.csv` | `nama_a`, `nama_b` | Paksa dua penulisan nama menjadi satu orang |
| `orang_pisah.csv` | `nama`, `trg_slug_a`, `trg_slug_b` | Jangan gabungkan dua orang bernama sama di dua TRG ini |
| `tema_trg.csv` | `trg_slug`, `tag_ids` (dipisah `;`, mis. `C06;C07`) | Ganti tema Tingkat 1 sebuah TRG |
| `kata_kunci.csv` | `istilah`, `aksi` = `buang` / `padanan`, `padanan_id` | Buang kata dari awan kata kunci atau tambah padanan Indonesia |
| `profil_orang.csv` | `nama`, `trg_slug` (boleh kosong), `kolom`, `nilai`, `sumber` | Timpa keahlian, ORCID, SINTA, Scopus, afiliasi, atau peran seseorang |

Nama dicocokkan setelah gelar dibuang, jadi "Prof. Dr. Ahmad, M.Si." sama dengan "Ahmad".
Contoh baris `ketua.csv`: `afdays,Nama Lengkap,jadikan_ketua,"Konfirmasi telepon dengan TRG",admin.glori,2026-11-02`
