# SchoolHub v2.1 — Catatan rilis

Tanggal build: 25 Oktober 2026.

## Perubahan v2.0 → v2.1
- Administrasi: snapshot hingga 20 konfigurasi sebelum disimpan, daftar revisi, pemulihan satu klik dengan konfirmasi, audit (maks. 250 entri; tampil 15 terakhir di UI).
- Keandalan: *optimistic concurrency* SHA-256. Jika dua browser menulis bersamaan, penulis kedua memperoleh HTTP 409 alih-alih menimpa perubahan pertama.
- Diagnostik: admin dapat menguji respons hingga 36 URL terdaftar dengan HTTP HEAD, HTTPS port 443, DNS tervalidasi dan IP pinned (IPv4 publik), tanpa redirect; 30 detik cooldown; tidak ada pemindaian otomatis.
- Tidak ada perubahan schema `data/site.json`; akun `data/auth.json` tetap.

## Status pengujian
Jalankan `npm test`. Test membahas autentikasi, CSRF, revisi, konflik update, restore, audit, diagnostik dan larangan SSRF ke alamat jaringan khusus.

## Bukan cakupan rilis ini
- Tidak ada SSO guru/siswa, autentikasi silang Laravel, MFA admin bawaan, atau reverse proxy/proteksi domain tujuan.
- Tidak ada pemantauan terjadwal dan status publik uptime.
- Tidak ada migrasi database TU/LMS/Inventaris/Perpustakaan/Magang/Absensi.

## Target berikutnya
Implementasi OIDC / provider identitas sekolah, gateway deny-by-default, role mapping di tiap backend, dan pemantauan produksi terpisah. Lakukan audit sebelum mengekspos proyek di internet.
