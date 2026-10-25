# SchoolHub v2.1 — Portal 6 Sistem Sekolah

SchoolHub adalah **landing page resmi jika telah disahkan oleh sekolah**, katalog layanan, dan panel pengelola dengan autentikasi sendiri. **SchoolHub bukan reverse proxy, SSO, firewall, atau mekanisme pembatas akses di enam aplikasi lain.**

## Fitur

- Direktori 6 layanan: Tata Usaha, LMS, Perpustakaan, Inventaris, SIM Magang/PKL, Absensi Digital.
- Pencarian/filter kategori, detail aplikasi, tampilan mobile dan desktop.
- Panel admin untuk identitas sekolah, alamat layanan HTTPS, deskripsi, persyaratan, visibilitas.
- Login admin (scrypt), session HttpOnly, CSRF, cek Origin, rate-limit percobaan, CSP.
- **v2.1:** audit login/perubahan/restorasi/pemeriksaan URL (hingga 250 entri lokal).
- **v2.1:** snapshot konfigurasi sebelum perubahan (hingga 20 revisi), satu tombol restore.
- **v2.1:** mencegah *lost update*: perubahan dari tab lama ditolak HTTP 409.
- **v2.1:** pemeriksaan respons URL aplikasi saat admin menekan tombol (maksimal 1x/30 detik); SSRF guard menolak IP privat atau literal, hanya HTTPS publik:443. Tidak menganggap login berhasil, tidak otomatis mempublikasikan status.
- **v2.1:** paket upgrade aman dari v2.0, backup berada dalam `data/.schoolhub-upgrades/`, konfigurasi/admin password tidak ditimpa.

## Instal baru — Windows (Node.js 20+)

1. Ekstrak ZIP `SchoolHub-v2.1` di lokasi Anda.
2. Buka `SETUP-ADMIN-WINDOWS.bat` sekali; tentukan password minimal 12 karakter.
3. Buka `START-WINDOWS.bat` untuk menjalankan server.
4. Kunjungi `http://127.0.0.1:3000` (publik lokal) dan `http://127.0.0.1:3000/admin` (admin).
5. Dari panel admin, isi profil sekolah dan URL HTTPS asli 6 sistem; **Simpan konfigurasi**.

Tidak ada instalasi paket npm. Versi Node.js 20 atau lebih tinggi dibutuhkan.

## Instal baru — Debian/Linux

```sh
cd SchoolHub-v2.1
chmod +x *.sh
./SETUP-ADMIN-LINUX.sh
./START-LINUX.sh
# opsional: npm test
```

## Upgrade proyek v2.0 yang sudah ada

**Gunakan ZIP terpisah `SchoolHub-Upgrade-v2.0-to-v2.1.zip`, jangan ekstrak ZIP full di atas instalasi lama.**

1. Hentikan SchoolHub v2.0 yang sedang aktif.
2. Tempatkan folder patch `SchoolHub-v2.1-UPGRADER` **sejajar** folder `SchoolHub-v2` Anda.
3. Double-click `UPGRADE-WINDOWS.bat` lalu tekan Enter sekali, atau jalankan Linux `./UPGRADE-LINUX.sh`.
4. Upgrader mengonfirmasi versi dan hash file kode v2.0, **menolak patch saat kode lama sudah diubah** dan tidak mengubah `data/site.json` atau `data/auth.json`.
5. Setelah berhasil, jalankan kembali `START-WINDOWS.bat`, login ke `/admin`, lalu `npm test`.
6. Backup versi kode lama otomatis berada di `SchoolHub-v2/data/.schoolhub-upgrades/`. Untuk rollback, lihat petunjuk di ZIP patch.

Jika nama/path proyek bukan `SchoolHub-v2`, jalankan dari terminal:

```sh
node scripts/upgrade.mjs "C:\\path\\ke\\proyek"
```

Perintah ini dijalankan **dari folder patch**, bukan dari folder proyek. Backup konfigurasi tambahan secara pribadi sebelum upgrade produksi.

## Konfigurasi environment

| Environment | Default | Catatan |
|---|---|---|
| `HOST` | `127.0.0.1` | Aman untuk akses lokal / reverse proxy |
| `PORT` | `3000` | Port server Node |
| `DATA_DIR` | `./data` proyek | Lokasi konfigurasi dan auth |
| `APP_ENV` | `development` | Set `production` untuk URL HTTPS wajib |
| `COOKIE_SECURE` | `0` | Wajib `1` di HTTPS produksi |

```sh
APP_ENV=production COOKIE_SECURE=1 HOST=127.0.0.1 PORT=3000 node server/server.mjs
```

## Domain aplikasi (contoh, belum aktif)

- `https://tu.sekolah.sch.id`
- `https://lms.sekolah.sch.id`
- `https://perpustakaan.sekolah.sch.id`
- `https://inventaris.sekolah.sch.id`
- `https://magang.sekolah.sch.id`
- `https://absensi.sekolah.sch.id`

Ini **contoh domain**, bukan URL yang sudah dimiliki atau dikonfirmasi. URL yang kosong tampil sebagai “Belum terhubung”. Status `Tautan tersedia` di publik artinya *URL telah diatur*, bukan server dinyatakan online.

## Batas pengamanan penting

1. Portal tidak menyembunyikan URL tujuan; akses langsung ke sistem TU/LMS tetap mungkin. **Masing-masing backend wajib punya authentication dan authorization/RBAC.**
2. Jangan masukkan password, token, NIS rahasia, maupun URL dengan kredensial ke katalog.
3. Monitoring hanya melakukan request HEAD ke HTTPS publik:443 setelah pengecekan DNS IPv4; layanan internal/IPv6-only tidak dipantau oleh fitur ini. Hasil `Server merespons` tidak berarti aman atau fungsinya sehat.
4. Audit di file lokal `data/audit.json` bersifat *best-effort*, dapat diubah oleh siapa pun yang menguasai filesystem server; **bukan audit immutable**. Gunakan SIEM/log terpisah bila perlu pembuktian formal.
5. Snapshot di `data/revisions/` hanya untuk **konfigurasi portal**, bukan backup database aplikasi sekolah. Snapshot maksimal 20; backup eksternal tetap penting.
6. Default loopback-only. Untuk publik pasang HTTPS reverse proxy (contoh di `deploy/`), firewall, MFA di depan `/admin`, VPN/IP allowlist bila perlu, log dan backup terenkripsi.
7. SSO belum dibangun; integrasi IdP/OIDC dan pemeriksaan izin server aplikasi merupakan fase berikutnya.

## Struktur data yang dipertahankan saat upgrade

```text
data/site.json                     Identitas portal dan katalog aplikasi
data/auth.json                     Hash password pengelola
data/audit.json                    Catatan aktivitas admin (baru)
data/revisions/*.json              Snapshot konfigurasi (baru)
data/.schoolhub-upgrades/*         Backup kode patch in-place (baru)
```

Uji otomatis: `npm test`. Lihat `SECURITY.md` dan `RELEASE-NOTES-v2.1.md`.
# schoolhub-land
