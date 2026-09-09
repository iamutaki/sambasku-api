# Katalog Error Code

Dokumen hidup — wajib diupdate tiap ada `errorCode` baru di PR yang sama
(api-base-stack.md Section 13).

| error_code | HTTP Status | Contoh Kapan Muncul |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body request tidak lolos Zod schema |
| `INVALID_CREDENTIALS` | 401 | Login gagal (email tidak ada / password salah) |
| `UNAUTHORIZED` | 401 | Token tidak ada/invalid, atau refresh token tidak valid |
| `TOKEN_EXPIRED` | 401 | Access token kadaluarsa |
| `RESET_TOKEN_INVALID` | 401 | Token reset password tidak valid, kadaluarsa, atau sudah dipakai |
| `FORBIDDEN` | 403 | Role tidak diizinkan akses endpoint |
| `NOT_FOUND` | 404 | Route/endpoint tidak ditemukan (via `app.notFound`) |
| `WORD_NOT_FOUND` | 404 | Kata tidak ditemukan by id (modul word — belum implement) |
| `EMAIL_ALREADY_EXISTS` | 409 | Registrasi dengan email yang sudah dipakai |
| `USERNAME_ALREADY_EXISTS` | 409 | Registrasi dengan username yang sudah dipakai |
| `RATE_LIMITED` | 429 | Terlalu banyak percobaan (lihat tabel limit di api-base-stack.md Section 15) |
| `INTERNAL_ERROR` | 500 | Error tak terduga (bug, koneksi DB putus, dst) |
