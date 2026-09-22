# Katalog Error Code

Dokumen hidup - wajib diupdate tiap ada `errorCode` baru di PR yang sama
(api-base-stack.md Section 13).

| error_code | HTTP Status | Contoh Kapan Muncul |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body request tidak lolos Zod schema |
| `INVALID_CREDENTIALS` | 401 | Login gagal (email tidak ada / password salah) |
| `EMAIL_NOT_VERIFIED` | 403 | Login password benar, email belum diverifikasi OTP |
| `INVALID_OTP` | 401 | Kode OTP salah / user tidak cocok |
| `OTP_EXPIRED` | 401 | OTP kadaluarsa atau percobaan habis |
| `UNAUTHORIZED` | 401 | Token tidak ada/invalid, atau refresh token tidak valid |
| `TOKEN_EXPIRED` | 401 | Access token kadaluarsa |
| `RESET_TOKEN_INVALID` | 401 | Token reset password tidak valid, kadaluarsa, atau sudah dipakai |
| `OAUTH_NO_PASSWORD` | 400 | Ubah password pada akun tanpa password (OAuth-only) - arahkan ke lupa password |
| `INVALID_GOOGLE_TOKEN` | 401 | ID token Google gagal verifikasi / akun Google tidak bisa dipakai |
| `INVALID_FACEBOOK_TOKEN` | 401 | Access token Facebook gagal verifikasi / akun Facebook tidak bisa dipakai |
| `FORBIDDEN` | 403 | Role tidak diizinkan akses endpoint |
| `NOT_FOUND` | 404 | Route/endpoint tidak ditemukan (via `app.notFound`) |
| `USER_NOT_FOUND` | 404 | User tidak ditemukan (profil publik by username; akun soft-deleted / nonaktif; update role admin; user id tidak ada) |
| `WORD_NOT_FOUND` | 404 | Kata tidak ditemukan by id (modul word - belum implement; toggle bookmark kata tidak ada / sudah dihapus) |
| `MEANING_NOT_FOUND` | 404 | Makna tidak ditemukan by id (kontribusi contoh kalimat) |
| `CONTRIBUTION_NOT_FOUND` | 404 | Kontribusi tidak ditemukan by id (antrean review) |
| `SEARCH_MISS_NOT_FOUND` | 404 | Pencarian kosong tidak ditemukan by id (dismiss / create-from-miss / update / resolve) |
| `SEARCH_MISS_TERM_MISMATCH` | 400 | Body create kata tidak cocok term miss (soft-check provenance 12-api) |
| `SEARCH_MISS_TERM_CONFLICT` | 409 | Koreksi term bentrok unique (term, direction) dengan miss lain (14-api) |
| `WORD_VARIANT_CONFLICT` | 409 | Resolve-as-variant: form sudah ada pada kata target |
| `WORD_LEMMA_CONFLICT` | 409 | Resolve-as-synonym: lemma miss sudah dipakai kata lain |
| `TRANSLATION_CONFLICT` | 409 | Resolve-as-translation: teks terjemahan sudah ada pada makna |
| `VOTE_TARGET_NOT_FOUND` | 404 | Target vote tidak ditemukan / sudah di-soft-delete (word, makna, contoh, pelafalan, gambar, komentar) |
| `COMMENT_NOT_FOUND` | 404 | Komentar tidak ditemukan by id (hapus / moderasi) |
| `COMMENT_ALREADY_MODERATED` | 409 | Komentar sudah di-takedown / bukan published (race takedown) |
| `WORD_NOT_PUBLISHED` | 409 | Komentar pada kata yang bukan `published` |
| `WORD_NOT_REPORTABLE` | 409 | Laporan entri pada kata yang bukan `published` |
| `WORD_REPORT_ALREADY_OPEN` | 409 | Pelapor yang sama masih punya laporan terbuka pada kata itu |
| `WORD_REPORT_NOT_FOUND` | 404 | Laporan entri tidak ditemukan |
| `WORD_REPORT_ALREADY_RESOLVED` | 409 | Laporan entri sudah ditutup |
| `WORD_ALREADY_MODERATED` | 409 | Takedown pada kata bukan published, atau restore pada kata bukan taken_down |
| `COMMENT_NOT_CENSORED` | 400 | Uncensor dipanggil tapi komentar tidak punya body_original |
| `BLOCKLIST_WORD_EXISTS` | 409 | Kata blocklist sudah ada (aktif) |
| `BLOCKLIST_WORD_NOT_FOUND` | 404 | Entry blocklist tidak ditemukan |
| `EMAIL_ALREADY_EXISTS` | 409 | Registrasi dengan email yang sudah dipakai |
| `USERNAME_ALREADY_EXISTS` | 409 | Registrasi dengan nama (username) yang sudah dipakai |
| `PHONE_ALREADY_EXISTS` | 409 | Registrasi / pengajuan verifikator dengan nomor HP yang sudah dipakai user lain |
| `BUG_REPORT_NOT_FOUND` | 404 | Laporan masalah tidak ditemukan / sudah selesai (resolve admin) |
| `VERIFIER_APPLICATION_NOT_FOUND` | 404 | Pengajuan verifikator tidak ada (GET me belum apply; detail admin id tidak dikenal) |
| `VERIFIER_APPLICATION_NOT_REJECTED` | 409 | PATCH me hanya boleh jika status rejected |
| `ALREADY_VERIFIER` | 403 | POST/PATCH pengajuan oleh user yang role-nya bukan contributor; juga approve jika pemohon sudah bukan contributor |
| `APPLICATION_ALREADY_EXISTS` | 409 | POST pengajuan padahal user sudah punya baris verifier_applications |
| `APPLICATION_ALREADY_REVIEWED` | 409 | Approve/reject pengajuan yang statusnya bukan pending |
| `CONTRIBUTION_ALREADY_REVIEWED` | 409 | Kontribusi sudah punya keputusan (approve/reject/correct) |
| `SUGGESTION_NOT_FOUND` | 404 | Usulan perubahan kata tidak ditemukan |
| `SUGGESTION_ALREADY_REVIEWED` | 400/409 | Usulan sudah punya keputusan (approve/reject/correct) |
| `WORD_NOT_PUBLISHED` | 400 | Usul edit hanya untuk kata berstatus published |
| `CANNOT_SUGGEST_OWN_WORD` | 403 | Kontributor tidak boleh mengusulkan edit pada kata buatannya sendiri |
| `INVALID_SUGGESTION_CHANGES` | 400 | proposed_changes kosong / tidak valid |
| `RATE_LIMITED` | 429 | Terlalu banyak percobaan (lihat tabel limit di api-base-stack.md Section 15). Resend OTP: 1/2 menit per IP, dan cooldown 2 menit per email |
| `INTERNAL_ERROR` | 500 | Error tak terduga (bug, koneksi DB putus, dst) |
| `IMAGE_UPLOAD_UNAVAILABLE` | 503 | Provider penyimpanan gambar belum dikonfigurasi (env `IMAGEKIT_*`) |
| `PRONUNCIACION_UPLOAD_UNAVAILABLE` | 503 | Provider audio pelafalan belum dikonfigurasi / token GitHub invalid (`PRONUNCIACION_GITHUB_*`) |
| `PRONUNCIACION_UPLOAD_FAILED` | 502 | Upload ke GitHub Contents API gagal (network / 5xx) |
| `WORD_AUDIO_NOT_FOUND` | 404 | Audio pelafalan tidak ditemukan / sudah soft-deleted |
| `EXAMPLE_NOT_FOUND` | 404 | Contoh kalimat tidak ditemukan pada kata (upload audio example) |
| `DIALECT_NOT_FOUND` | 404 | Dialek tidak ditemukan (upload audio) |
| `INVALID_AUDIO_MIME` | 400 | MIME audio tidak didukung |
| `INVALID_AUDIO_FILENAME` | 400 | Nama file audio mengandung karakter terlarang |
| `EMPTY_AUDIO_FILE` | 400 | File audio 0 byte |
| `AUDIO_TOO_LARGE` | 400 | File audio > 5 MB |
| `INVALID_AUDIO_CONTENT` | 400 | Magic-byte tidak cocok dengan MIME yang diklaim |
| `GOOGLE_AUTH_UNAVAILABLE` | 503 | `GOOGLE_CLIENT_ID` belum di-set; masuk dengan Google dimatikan |
| `FACEBOOK_AUTH_UNAVAILABLE` | 503 | `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` belum di-set; masuk dengan Facebook dimatikan |
| `LEMMA_DEFINITION_PROVIDER_ERROR` | 502 | Provider KBBI gagal (timeout, non-OK, payload tak terparse) |
| `LEMMA_DEFINITION_PROVIDER_UNAVAILABLE` | 503 | Provider KBBI dinonaktifkan (`KBBI_PROVIDER=none` / `RAF555_BASE_URL=""`) |
| `SHARE_BACKGROUND_PROVIDER_ERROR` | 502 | Unsplash gagal (timeout / non-OK / payload); endpoint share biasanya swallow → items [] |
| `SHARE_BACKGROUND_PROVIDER_UNAVAILABLE` | 503 | `UNSPLASH_ACCESS_KEY` kosong (provider internal); endpoint publik tetap 200 + items [] |
