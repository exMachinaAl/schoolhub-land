# SchoolHub — Batas Keamanan dan Rencana Deployment

## Ringkasan tegas

**SchoolHub v2 = katalog publik + panel admin pengelola. BUKAN security gateway.** Menyembunyikan alamat aplikasi atau memaksakan klik via portal **tidak mengamankan backend**. Karena data TU/rapor/inventaris mengandung data administrasi yang penting, setiap aplikasi tetap harus memvalidasi login dan hak akses.

## Threat model singkat

| Risiko | Kontrol SchoolHub v2 | Kontrol tambahan yang WAJIB di aplikasi/infrastruktur |
|---|---|---|
| Perubahan URL portal oleh anon | Endpoint simpan diproteksi sesi admin + CSRF | HTTPS, MFA/SSO pengelola, audit log produksi |
| Tebak password admin | scrypt + limit 7 upaya per IP dalam 15 menit | Reverse proxy WAF/rate-limit, autentikasi kuat dan MFA |
| Tautan `javascript:` / HTTP tidak aman | Validasi URL backend dan frontend | Keamanan DNS/domain, TLS dan sertifikat resmi |
| Percobaan akses tanpa lewat portal | Tidak ditangani SchoolHub | Autentikasi backend, role/permission, RBAC dan record-level policies |
| Bocor file data/admin hash | Route file statis allowlist | Firewall, hak akses file, backup privat |
| Kecurian cookie saat HTTP | Local development tanpa Secure flag | HTTPS reverse proxy, `COOKIE_SECURE=1`, HSTS, tidak membuka port 3000 publik |
| CSRF edit data katalog | Token CSRF + Origin check + SameSite | Audit, monitoring dan revocation sesi saat kompromi |
| SQLi/akses nilai/surat orang lain | Tidak diproses SchoolHub | Laravel Gates/Policies, validasi input, query terparameter dan audit setiap aplikasi |

## Arsitektur produksi yang disarankan

```text
Internet/pengguna sekolah
        |
  DNS domain resmi
        |
  HTTPS reverse proxy (Caddy/Nginx)
        |
  portal.sekolah.sch.id --> SchoolHub Node (127.0.0.1:3000)
        |
  Tombol akses/link ke aplikasi dengan subdomain terpisah
        +---- tu.sekolah.sch.id     --> Gatekeeper --> TU Laravel --> TU RBAC
        +---- lms.sekolah.sch.id    --> Gatekeeper --> LMS Laravel --> kelas/role
        +---- perpustakaan...       --> Gatekeeper bila fitur privat --> izin pinjam
        +---- inventaris...         --> Gatekeeper --> Laravel --> izin aset
        +---- magang...             --> Gatekeeper --> Laravel --> role/PKL
        +---- absensi...            --> Gatekeeper --> Laravel --> izin siswa/kelas

 Gatekeeper (fase terpisah): identity provider OIDC / MFA atau Access Proxy.
```

Jika IdP/Auth Proxy (contoh Authentik, Keycloak, Cloudflare Access) telah siap, *barulah* hubungkan seluruh aplikasi melalui standar seperti OIDC. Jangan terapkan login semu di frontend. Backend setiap aplikasi harus memvalidasi token/sesi dan **izin per objek**, karena gateway hanya tahu siapa pengguna; tidak otomatis tahu surat atau kelas mana yang boleh dibuka.

## Deployment minimum

1. Ganti identitas dan kontak sekolah dengan yang benar; jangan mengklaim "situs resmi" jika domain belum disetujui lembaga.
2. Gunakan domain HTTPS resmi untuk portal dan setiap aplikasi. Pilih salah satu contoh di `deploy/` dan pasang TLS otomatis yang sah.
3. Jalankan Node dengan akun non-root, `HOST=127.0.0.1`, `APP_ENV=production`, `COOKIE_SECURE=1`; firewall port internal.
4. Password admin minimal 12 karakter dibuat lokal dengan `npm run setup-admin`. Aktifkan tambahan MFA melalui access proxy khusus panel admin jika perlu. Panel `/admin` dapat dibatasi akses IP/VPN di reverse proxy.
5. Jaga `data/auth.json` tidak masuk repo, tidak terakses publik, izin file hanya bagi akun server. Backup terenkripsi dan uji restore.
6. Laravel aplikasi tujuan: nonaktifkan debug (`APP_DEBUG=false`), cek route API, Policies/Gates, middleware auth, hak unduhan arsip dan kelas, audit akses langsung per URL.
7. Pertimbangkan regulasi privasi/data sekolah, logging, dan retensi. Jangan simpan NIS/password/PII di konfigurasi portal publik.
8. Jangan menjadikan `Referer`, `Origin`, URL, atau header yang bisa dibuat user sebagai bukti login aplikasi. Header tepercaya dari gateway hanya aman bila origin app tidak bisa diakses langsung dan header klien dibersihkan.
9. Untuk multi-server, gunakan session store dan rate-limit terdistribusi; memori proses di versi ini hanya cocok satu instance.
10. Uji pemulihan dan lakukan penilaian keamanan sebelum produksi.

## Batasan spesifik implementasi v2

- Session hanya disimpan di memori selama maksimal 8 jam, tidak survive restart, belum mendukung remote revocation selain restart server.
- Setup mengubah hash admin di file; restart server setelah rotasi untuk menjamin sesi lama terputus.
- Tidak ada audit log permanen untuk edit katalog. Untuk skala produksi, tambahkan audit immutable.
- Tidak ada identitas guru/staf/siswa yang diimpor dari database aplikasi lain.
- Tidak ada pemeriksaan apakah URL aplikasi live; label "Tautan tersedia" hanya menandakan URL terisi.
- Akses admin perlu dibatasi lagi di layer HTTPS proxy dan sebaiknya ditambah MFA.

## Referensi keamanan

- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Perubahan pengamanan v2.1

- **Konfigurasi tidak mudah tertimpa antar tab:** frontend menyertakan `_baseRevision` SHA-256. Backend membandingkan dengan versi konfigurasi saat menulis dalam antrean operasi; konflik menghasilkan HTTP 409.
- **Snapshot versi katalog:** sebelum pengubahan/pemulihan, konfigurasi lama disalin ke `data/revisions/` (maksimal 20 file). Restore melakukan validasi ulang; setiap pemulihan juga membackup versi yang sedang aktif. Ini bukan cadangan database sistem tujuan.
- **Audit lokal:** file `data/audit.json` merekam login sukses, logout, simpan katalog, restore, dan pemeriksaan URL. Retensi 250 entri. Karena file lokal dapat diubah oleh pemilik server, ini **bukan** WORM/immutable logging.
- **Cek tautan saat diminta:** hanya admin dengan sesi dan CSRF. Probe hanya HTTP HEAD ke HTTPS port 443 menggunakan alamat IPv4 publik yang tervalidasi dan dipasang sebagai target koneksi; redirect tidak diikuti. Menolak akses ke localhost, alamat literal, IP privat, special-use ranges, serta domain yang tidak mempunyai IPv4 publik. Batas 1x setiap 30 detik per proses. Kegagalan pemeriksaan bukan bukti backend mati, khususnya jaringan privat dan layanan IPv6-only.
- Tidak ada klaim bahwa diagnostik port/web menjamin keamanan aplikasi. Jangan gunakan status cek sebagai pengganti RBAC, SIEM, readiness probes atau login.
