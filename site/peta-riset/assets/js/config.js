// Pengaturan halaman Peta Riset. Ubah di sini tanpa menyentuh app.js.
window.PETA_CONFIG = {
  homeUrl: "https://glori.unhas.ac.id/",      // tautan "kembali" di bilah atas
  trgSiteUrl: "https://trg.unhas.ac.id/",     // sumber data (ditampilkan di catatan kaki)
  contactEmail: "",                           // isi alamat email GloRI untuk koreksi data; kosongkan untuk menyembunyikan
  defaultLang: "id",                          // "id" atau "en"
  // Tab "Cari publikasi" memanggil API OpenAlex dari peramban pengunjung. Tanpa kunci, kuota gratis OpenAlex dibagi per alamat IP,
  // jadi jaringan kampus yang ramai dapat kehabisan. Untuk produksi, arahkan ke proxy peladen yang memasang kunci (lihat docs/PROXY_OPENALEX.md).
  // JANGAN menaruh kunci API di berkas ini: halaman ini publik.
  openalexBase: "https://api.openalex.org",
  openalexMailto: ""                          // opsional: email kontak GloRI untuk "polite pool" OpenAlex (jangan isi email pribadi)
};
