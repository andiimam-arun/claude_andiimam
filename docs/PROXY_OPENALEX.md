# Tab "Cari publikasi": memakai proxy peladen untuk OpenAlex

Tab "Cari publikasi" memanggil `https://api.openalex.org` langsung dari peramban pengunjung (OpenAlex mengizinkan CORS). Ini berfungsi tanpa peladen, tetapi:

- OpenAlex kini membatasi permintaan **tanpa kunci** dengan kuota harian gratis yang **dibagi per alamat IP**. Pengunjung di rumah atau seluler biasanya aman; jaringan kampus yang
  banyak penggunanya di balik satu alamat IP dapat menghabiskan kuota itu, dan pencarian akan menampilkan pesan batas serta daftar tersimpan.
- **Jangan menaruh kunci API di `config.js` atau di JavaScript halaman.** Halaman ini publik; kunci yang tertanam bisa disalin siapa saja dan dipakai habis.

Untuk produksi (glori.unhas.ac.id), pasang proxy di peladen yang menambahkan kunci, lalu arahkan halaman ke proxy itu:

```js
// site/peta-riset/assets/js/config.js
openalexBase: "https://glori.unhas.ac.id/oa",
```

Contoh nginx (kunci diambil dari variabel lingkungan peladen, tidak pernah dikirim ke pengunjung; sertakan juga cache dan pembatasan laju):

```nginx
proxy_cache_path /var/cache/nginx/oa levels=1:2 keys_zone=oa:10m max_size=200m inactive=1d;
limit_req_zone $binary_remote_addr zone=oa_rl:10m rate=5r/s;

location /oa/ {
    limit_req zone=oa_rl burst=20 nodelay;
    proxy_pass https://api.openalex.org/;
    proxy_set_header Host api.openalex.org;
    proxy_set_header Authorization "Bearer ${OPENALEX_API_KEY}";   # diisi saat peladen dimulai (mis. lewat envsubst); bukan di repo
    proxy_ssl_server_name on;
    proxy_cache oa; proxy_cache_valid 200 1h; proxy_cache_key "$request_uri";
    add_header Access-Control-Allow-Origin "https://glori.unhas.ac.id" always;
}
```

Pada Laravel (codeinspira), rute yang meneruskan `GET /oa/works` ke OpenAlex dengan header yang sama, dengan cache beberapa menit dan `throttle`, setara. Pastikan proxy hanya meneruskan jalur `/works`
dan menolak parameter yang tidak dikenal, agar tidak menjadi proxy terbuka ke seluruh API.

Data awal tab (daftar tersimpan dan peta ISSN ke kuartil) dibuat oleh `scripts/trg_publikasi_awal.py` dan ikut diperbarui oleh `trg_refresh.py --openalex`.
