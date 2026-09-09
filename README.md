# sambasku-api

Backend API Kamus Digital Sambas-Indonesia.

Stack & konvensi mengikuti `docs/api/api-base-stack.md` — Hono + Drizzle ORM +
PostgreSQL, clean architecture feature-based (`src/modules/<fitur>/`).
Dokumentasi API interaktif tersedia di `GET /docs` (Scalar) saat server jalan.

## Menjalankan Database (Docker)

Prasyarat: Docker daemon jalan — di mesin ini pakai [colima](https://github.com/abiosoft/colima):

```bash
colima start                # sekali per sesi (kalau daemon Docker belum jalan)
docker compose up -d        # naikkan 2 container:
                            #   postgres      → DB dev  (localhost:5432, db_sambasku)
                            #   postgres-test → DB test (localhost:5433, db_sambasku_test)
```

> Kalau ada PostgreSQL lain yang memakai port 5432 (mis. Homebrew),
> matikan dulu: `brew services stop postgresql@14`.

## Setup Pertama Kali

```bash
pnpm install

# 1. Environment — copy template lalu isi
cp .env.example .env

# 2. Generate JWT keypair dev (RS256)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_private.pem
openssl pkey -in jwt_private.pem -pubout -out jwt_public.pem
#    Salin isi kedua file ke .env (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY,
#    bungkus dengan tanda kutip dua), lalu hapus file key-nya

# 3. Apply migration ke DB dev
pnpm drizzle-kit migrate

# 4. Seed user awal (admin@email.com / root@email.com, password: pass1234)
pnpm seed

# 5. Jalankan API
pnpm dev                    # http://localhost:3000 — docs di /docs
```

### Database test (untuk integration & e2e test)

```bash
cp .env.test.example .env.test     # arahkan ke port 5433 + isi JWT key
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/db_sambasku_test \
  pnpm drizzle-kit migrate
```

## Command Sehari-hari

| Command | Fungsi |
| --- | --- |
| `pnpm dev` | Jalankan API (watch mode) |
| `pnpm test` | Semua test (unit + integration + e2e) |
| `pnpm test:unit` / `test:integration` / `test:e2e` | Test per lapisan |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm seed` | Seeder user admin & root (idempoten) |
| `pnpm drizzle-kit generate` | Generate migration SQL dari perubahan schema |
| `pnpm drizzle-kit migrate` | Apply migration ke database |
| `pnpm drizzle-kit studio` | GUI browser untuk lihat isi database |

## Akses Database

```bash
docker compose exec postgres psql -U postgres -d db_sambasku
```

Atau dari GUI client (TablePlus/DBeaver): `localhost:5432`, db `db_sambasku`,
user `postgres`, password `postgres`.

## Struktur Singkat

```text
src/
├── modules/auth/          # fitur auth (domain → application → infrastructure → presentation/v1)
├── shared/                # lintas modul: db, middlewares, errors, config, logging
├── scripts/seed.ts        # seeder CLI
└── app.ts / main.ts       # composition root + server
```

Detail lengkap: `docs/api/api-base-stack.md`.
