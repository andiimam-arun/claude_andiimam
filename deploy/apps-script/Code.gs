/**
 * Peta Riset Unhas sebagai Aplikasi Web Google Apps Script.
 * File HTML (Index, Css, Config, Data, App) dibuat oleh scripts/build_apps_script.py dari folder site/peta-riset;
 * jangan disunting manual, bangun ulang setiap data berubah.
 */
function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('Index');
  tpl.qs = queryString_(e && e.parameter);
  return tpl.evaluate()
    .setTitle('Peta Riset Unhas | GloRI Universitas Hasanuddin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // boleh disematkan (iframe) di situs GloRI
}

/** Menyisipkan isi berkas HTML lain ke dalam Index (dipanggil dari templat). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Parameter alamat (?tab=dunia&lang=en) diteruskan ke halaman; hanya kunci yang dikenal, dan nilainya di-encode. */
function queryString_(params) {
  var allowed = ['lang', 'tab', 'q', 'k', 't', 'l', 'i', 'kw', 'embed'];
  var out = [];
  Object.keys(params || {}).forEach(function (k) {
    if (allowed.indexOf(k) >= 0) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]).slice(0, 200)));
  });
  return out.join('&');
}
