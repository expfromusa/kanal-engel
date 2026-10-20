// TizenTube Cobalt bu dosyayÄ± orijinal userScript.js yerine yÃ¼kler (APK'daki adres buraya Ã§evrildi).
// Ã–nce orijinal TizenTube'u, ardÄ±ndan kanal engelleme eklentisini yÃ¼kler.
(function () {
  var BASE = 'https://cdn.jsdelivr.net/gh/expfromusa/kanal-engel@main/';
  var UPSTREAM = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js';
  var parent = document.head || document.documentElement;
  var v = Date.now();

  // YouTube TV Trusted Types istiyor; uygulama bunu uygulamÄ±yorsa politika zararsÄ±zdÄ±r.
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
    add(BASE + 'engel.js?v=' + Math.floor(v / 3600000));
  });
})();
