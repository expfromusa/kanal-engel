"""TizenTube Cobalt APK'sındaki userscript adresini kendi loader adresimizle değiştirir.

Kullanım: python patch_apk.py <girdi.apk> <çıktı-imzasız.apk> <yeni-url>
Yeni URL eski adresle aynı uzunlukta olmalı (ikili dosyada yerinde değiştirilir).
Çıktı imzasızdır; ardından zipalign + apksigner gerekir.
"""
import sys
import zipfile

OLD = b"https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js"
LIB = "lib/armeabi-v7a/libchrobalt.so"


def main(src, dst, new_url):
    new = new_url.encode("ascii")
    if len(new) != len(OLD):
        sys.exit(f"Yeni URL {len(new)} karakter, {len(OLD)} olmalı.")

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            # Eski imza dosyaları atılır; yeniden imzalanacak.
            if info.filename.startswith("META-INF/") and info.filename.rsplit(".", 1)[-1] in ("SF", "RSA", "DSA", "EC", "MF"):
                continue
            data = zin.read(info.filename)
            if info.filename == LIB:
                count = data.count(OLD)
                if count != 2:
                    sys.exit(f"Beklenen 2 adres yerine {count} bulundu; APK sürümü farklı olabilir.")
                data = data.replace(OLD, new)
                print(f"{LIB}: {count} adres değiştirildi")
            out = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            out.compress_type = info.compress_type
            out.external_attr = info.external_attr
            zout.writestr(out, data)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
