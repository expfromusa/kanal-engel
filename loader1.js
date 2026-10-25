// TizenTube Cobalt bu dosyayı orijinal userScript.js yerine yükler (APK'daki adres buraya çevrildi).
// Önce orijinal TizenTube'u, ardından kanal engelleme eklentisini yükler.
(function () {
  var BASE = 'https://cdn.jsdelivr.net/gh/expfromusa/kanal-engel@main/';
  var UPSTREAM = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js';
  var parent = document.head || document.documentElement;
  var v = Date.now();

  // YouTube TV Trusted Types istiyor; uygulama bunu uygulamıyorsa politika zararsızdır.
  var policy = null;
  try {
    if (window.trustedTypes && trustedTypes.createPolicy) {
      policy = trustedTypes.createPolicy('kanalEngel', { createScriptURL: function (u) { return u; } });
    }
  } catch (e) { }

  function add(src, done) {
    var s = document.createElement('script');
    s.src = policy ? policy.createScriptURL(src) : src;
    s.onload = s.onerror = done || null;
    parent.appendChild(s);
  }

  add(UPSTREAM + '?v=' + v, function () {
    // Önbellek anahtarı 10 dakikada bir değişir; güncellemeler en geç 10 dakikada TV'ye ulaşır.
    add(BASE + 'engel.js?v=' + Math.floor(v / 600000));
  });
})();
