<p align="center">
  <img src="logo.png" alt="SambasKu" width="320" />
</p>

# SambasKu-API

Backend API Kamus Digital Sambas-Indonesia.

Stack & konvensi mengikuti `docs/api/api-base-stack.md` — Hono + Drizzle ORM +
**Turso (libSQL / SQLite)**, clean architecture feature-based
(`src/modules/<fitur>/`). Dokumentasi API interaktif di `GET /docs` (Scalar)
saat server jalan. Keputusan migrasi Neon → Turso: `docs/api/ADR-turso.md`.

## Database (tanpa Docker)

Lokal & CI memakai **file SQLite**. Staging/production memakai **Turso Cloud**.

| Environment        | `DATABASE_URL`              | Token                         |
| ------------------ | --------------------------- | ----------------------------- |
| Development        | `file:./local.db`           | kosong                        |
| Test (integration) | `file:./test.db`            | kosong                        |
| Staging / Prod     | `libsql://….turso.io`       | `DATABASE_AUTH_TOKEN` (wajib) |

Tidak perlu Colima/Docker Postgres. File `*.db` di-gitignore.

## Setup Pertama Kali

```bash
pnpm install

# 1. Environment
cp .env.example .env
#    Pastikan: DATABASE_URL=file:./local.db
#              DATABASE_AUTH_TOKEN=

# 2. Generate JWT keypair dev (RS256)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_private.pem
openssl pkey -in jwt_private.pem -pubout -out jwt_public.pem
#    Salin isi kedua file ke .env (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY,
#    bungkus dengan tanda kutip dua), lalu hapus file key-nya

# 3. Apply migration → membuat/mengisi local.db
pnpm db:migrate

# 4. Seed (lokal): akun default + referensi/user sistem
pnpm seed
#    Atau terpisah: pnpm seed:accounts | pnpm seed:reference

# 5. Jalankan API (Hono + Node)
pnpm dev                    # http://localhost:3000 — docs di /docs
#    Health: GET /health  →  { "status": "ok", "database": "up" }
```

### Database test (integration & e2e)

```bash
cp .env.test.example .env.test
#    DATABASE_URL=file:./test.db + JWT key (sama pola .env)

DATABASE_URL=file:./test.db pnpm db:migrate
pnpm test
```

## Command Sehari-hari

| Command                                                | Fungsi                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm dev`                                             | Jalankan API (watch mode, Node + file SQLite)          |
| `pnpm dev:worker`                                      | Jalankan via wrangler (paritas Cloudflare Workers)     |
| `pnpm deploy` / `pnpm deploy:staging`                  | Deploy ke Cloudflare Workers                           |
| `pnpm test`                                            | Semua test (unit + integration + e2e)                  |
| `pnpm test:unit` / `test:integration` / `test:e2e`   | Test per lapisan                                       |
| `pnpm typecheck`                                       | `tsc --noEmit`                                         |
| `pnpm seed`                                            | Lokal: accounts + reference                            |
| `pnpm seed:accounts`                                   | Akun default saja (menimpa password → pass1234)        |
| `pnpm seed:reference`                                  | Referensi + user sistem (insert-if-missing)            |
| `pnpm drizzle-kit generate --name=…`                   | Generate migration SQL dari perubahan schema           |
| `pnpm db:migrate`                                      | Apply migration (libsql; error terlihat di CI)         |
| `pnpm drizzle-kit studio`                              | GUI browser untuk lihat isi database                   |

## Cloudflare Workers (deploy)

Dua runtime berbagi satu composition root: `main.ts` (Node, default dev)
dan `worker.ts` (Workers — env dari bindings, DB via `@libsql/client/web`
singleton HTTP ke Turso, email via Resend).

Migration **tetap dari CI Node** (`pnpm db:migrate`), bukan dari Workers.

### Secret Worker (staging) — sekali

```bash
npx wrangler secret put DATABASE_URL --env staging
# paste: libsql://sambasku-staging-….turso.io

npx wrangler secret put DATABASE_AUTH_TOKEN --env staging
# paste: token dari `turso db tokens create sambasku-staging`

# JWT, Resend, ImageKit, OAuth, FCM — sama seperti sebelumnya
# Audio pelafalan (lihat bagian "Audio pelafalan" di bawah):
#   npx wrangler secret put PRONUNCIACION_GITHUB_TOKEN --env staging
```

### Deploy otomatis dari GitHub (CI/CD)

Push ke branch **`staging`** →
[.github/workflows/deploy-staging.yml](.github/workflows/deploy-staging.yml):
test (file SQLite) → migrate Turso → `wrangler deploy --env staging`.

| Secret                        | Nilai                                              |
| ----------------------------- | -------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`        | CF → API Tokens → Edit Cloudflare Workers          |
| `CLOUDFLARE_ACCOUNT_ID`       | `547e27ab971bbd809dfd57626049a131`                 |
| `TURSO_STAGING_DATABASE_URL`  | `libsql://…` staging                               |
| `TURSO_STAGING_AUTH_TOKEN`    | token Turso staging                                |

Secret Worker (JWT, dll.) tidak ikut CI — `wrangler deploy` mempertahankan
secret yang sudah terpasang. Seed manual (staging):

```bash
# Aman diulang — Anonim, Pengimpor Data CSV, bahasa/dialek/kelas/kategori
gh workflow run seed-reference-staging.yml --ref staging

# Hanya jika perlu reset password akun default → pass1234
gh workflow run seed-account-staging.yml --ref staging -f confirm=true
```

Production: `seed-reference-production.yml` / `seed-account-production.yml` (`--ref main`).

## Audio pelafalan (GitHub asset repo)

File audio **tidak** disimpan di Turso. Backend menulis file ke repo publik
[sambasku/audios](https://github.com/sambasku/audios),
lalu menyimpan **record metadata + URL** di tabel `word_audios`.

README asset (asal audio, struktur path, URL raw):
[`pronunciation/README.md`](../pronunciation/README.md) ·
[raw di GitHub](https://github.com/sambasku/audios/blob/main/README.md).

Kontrak API lengkap: `docs/api/29-api-pronunciation-audio.md`.

### Env (lokal / Workers)

```env
PRONUNCIACION_PROVIDER=github
PRONUNCIACION_GITHUB_URL=https://github.com/sambasku/audios
PRONUNCIACION_GITHUB_TOKEN=          # PAT Contents RW — secret, jangan commit
```

Staging: `PRONUNCIACION_PROVIDER` + `PRONUNCIACION_GITHUB_URL` di
`wrangler.toml` `[env.staging.vars]`; token via
`npx wrangler secret put PRONUNCIACION_GITHUB_TOKEN --env staging`.

Tanpa token/URL → upload balas **503** `PRONUNCIACION_UPLOAD_UNAVAILABLE`.

### Alur record (DB + asset)

```text
Client (admin / mobile)
  → POST /api/v1/words/:wordId/pronunciations/audio  (multipart)
  → API validasi MIME/ukuran
  → GitHub Contents API PUT  assets/audio/<dialect|umum>/<lemma-slug>/<ulid>.<ext>
  → INSERT word_audios  (url = cdn.jsdelivr.net/gh/…@main/<path>, …)
```

| Field di `word_audios` (inti) | Arti |
| ----------------------------- | ---- |
| `url` | Link asset publik (jsDelivr CDN) |
| `path` / path di storage | Path relatif di repo pronunciation |
| `word_id` | Lemma induk |
| `example_id` | `null` = audio lemma; terisi = audio contoh kalimat |
| `dialect_id` | Dialek opsional |
| `mime_type` / `file_size` / `duration_ms` | Metadata file |
| `speaker_name` | Nama penutur (opsional) |
| `is_primary` | Take pertama per target (lemma / per-example) |
| `status` | `pending_review` (contributor) / `published` (admin, …) |

Contoh URL asset setelah upload:

```text
https://cdn.jsdelivr.net/gh/sambasku/audios@main/assets/audio/umum/makatn/<ulid>.m4a
```

(jsDelivr CDN di depan repo GitHub publik; path file immutable / ULID.)

Baca di word detail: `audios[]` (lemma) dan
`meanings[].examples[].audios[]` (contoh).

### Endpoint ringkas

| Method | Path | Keterangan |
| ------ | ---- | ---------- |
| `POST` | `/api/v1/words/:wordId/pronunciations/audio` | Upload + buat record |
| `DELETE` | `/api/v1/words/:wordId/pronunciations/audio/:audioId` | Soft-delete DB + hapus file (best-effort) |

## Gambar publik (GitHub asset repo)

File gambar kata dan avatar **tidak** disimpan di Turso. Backend menulis
file ke repo publik
[sambasku/images](https://github.com/sambasku/images), lalu
menyimpan **URL + path** di database.

README asset (asal gambar, struktur path, URL CDN):
[`images/README.md`](../images/README.md) ·
[raw di GitHub](https://github.com/sambasku/images/blob/main/README.md).

Pola yang sama dengan audio pelafalan di atas. Bedanya: gambar kata tidak
punya slug lemma (ULID dibuat sebelum kata tersimpan), dan tampilan client
membungkus URL jsDelivr dengan wsrv.nl.

### Env (lokal / Workers)

```env
PUBLIC_IMAGE_PROVIDER=github
PUBLIC_IMAGE_GITHUB_URL=https://github.com/sambasku/images
PUBLIC_IMAGE_GITHUB_TOKEN=          # PAT Contents RW, secret, jangan commit
```

Lokal: isi ketiga variabel di `.env` (lihat `.env.example`).
Di Workers, provider + URL jadi vars; token lewat
`npx wrangler secret put PUBLIC_IMAGE_GITHUB_TOKEN`.

Tanpa token/URL → upload balas **503** `PUBLIC_IMAGE_UPLOAD_UNAVAILABLE`.

Bukti verifikator dan lampiran laporan bug **tetap ImageKit**
(`IMAGE_PROVIDER` / `IMAGEKIT_*`). Jangan campur ke repo ini.

### Alur record (DB + asset)

```text
Client (admin / mobile)
  → POST /api/v1/images?purpose=word          (gambar kata)
     atau POST /api/v1/users/me/avatar        (avatar)
  → API validasi MIME/ukuran (jpeg, png, webp, maks 5 MB)
  → GitHub Contents API PUT
       assets/words/<ulid>.<ext>
       assets/avatars/<userId>/<ulid>.<ext>
  → Client mengirim url + provider_file_id (+ sha) saat menyimpan kata
     atau API langsung menulis users.avatar_url
```

| Field | Arti |
| ----- | ---- |
| `word_images.url` / `users.avatar_url` | Link aset publik (jsDelivr) |
| `provider` | `github` |
| `provider_file_id` | Path relatif di repo images |
| `sha` | Blob SHA, dipakai saat hapus |

Contoh URL aset setelah upload:

```text
https://cdn.jsdelivr.net/gh/sambasku/images@main/assets/words/<ulid>.webp
```

### Endpoint ringkas

| Method | Path | Keterangan |
| ------ | ---- | ---------- |
| `POST` | `/api/v1/images?purpose=word` | Upload gambar kata ke GitHub |
| `POST` | `/api/v1/words/:wordId/images` | Simpan referensi ke `word_images` |
| `POST` | `/api/v1/users/me/avatar` | Upload avatar + update user |
| `DELETE` | `/api/v1/users/me/avatar` | Hapus avatar (file best-effort) |

## Akses Database

**Lokal**

```bash
# CLI sqlite (kalau terpasang)
sqlite3 local.db

# Atau Drizzle Studio
DATABASE_URL=file:./local.db pnpm drizzle-kit studio
```

**Turso Cloud**

```bash
turso db shell sambasku-staging
# atau dashboard: https://turso.tech
```

## Struktur Singkat

```text
src/
├── modules/auth/          # fitur auth (domain → application → infrastructure → presentation/v1)
├── shared/                # lintas modul: db (libSQL), middlewares, errors, config, logging
├── scripts/seed.ts            # orkestrasi lokal (accounts + reference)
├── scripts/seed-accounts.ts   # akun default (reset password)
├── scripts/seed-reference.ts  # referensi + user sistem (insert-if-missing)
├── app.ts                 # composition root (dibagi 2 runtime)
└── main.ts / worker.ts    # entry Node (@hono/node-server) / Cloudflare Workers
```

Migrasi Postgres lama (arsip, jangan di-apply):  
`src/shared/database/drizzle/migrations-pg-archive/`.  
Lineage aktif: `migrations/0000_init-turso.sql`.

Detail lengkap: `docs/api/api-base-stack.md` · `docs/api/ADR-turso.md`.
