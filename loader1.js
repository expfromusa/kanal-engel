// GEÇİCİ TEST: eklenti kapalı, yalnızca TizenTube yükleniyor (yorum butonu karşılaştırması).
(function () {
  var UPSTREAM = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js';
  var parent = document.head || document.documentElement;
  var policy = null;
  try {
    if (window.trustedTypes && trustedTypes.createPolicy) {
      policy = trustedTypes.createPolicy('kanalEngel', { createScriptURL: function (u) { return u; } });
    }
  } catch (e) { }
  var s = document.createElement('script');
  var src = UPSTREAM + '?v=' + Date.now();
  s.src = policy ? policy.createScriptURL(src) : src;
  parent.appendChild(s);
})();
