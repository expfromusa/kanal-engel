# Kanal Engel

TizenTube Cobalt (Android TV) için kanal engelleme eklentisi.

- Bir videoda OK'a basılı tutun → **Kanalı engelle**. O kanalın videoları ana sayfa, arama ve önerilerden kaybolur; doğrudan açılsa da oynatılmaz.
- **Engelli kanallar (ebeveyn)** → 4 haneli PIN ile engelleri kaldırma ve PIN değiştirme. PIN ilk açılışta belirlenir.
- Engel listesi ve PIN (SHA-256 özeti) yalnızca TV'de, uygulamanın yerel deposunda tutulur.

## Nasıl çalışır

TizenTube Cobalt her açılışta `cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js` dosyasını yükler.
Yamalı APK'da bu adres aynı uzunluktaki `cdn.jsdelivr.net/gh/expfromusa/kanal-engel@main/loader1.js` ile değiştirilmiştir.
`loader1.js` önce orijinal TizenTube'u, ardından `engel.js`'i yükler; böylece TizenTube güncellemeleri gelmeye devam eder.

`engel.js`, TizenTube'un `JSON.parse` ve `resolveCommand` sarmalayıcılarının dışına bir katman ekler:
gelen YouTube yanıtlarından engelli kanalların öğelerini siler, menülere düğme ekler ve oynatıcı yanıtını engeller.

## APK'yı yamalamak

```
python patch_apk.py tizentube.apk yamali-imzasiz.apk https://cdn.jsdelivr.net/gh/expfromusa/kanal-engel@main/loader1.js
zipalign -p -f 4 yamali-imzasiz.apk yamali-hizali.apk
apksigner sign --ks anahtar.jks --out yamali.apk yamali-hizali.apk
```

Yeni TizenTube sürümünde aynı adımlar tekrarlanır; aynı imza anahtarı kullanılırsa uygulama verisi korunur.
