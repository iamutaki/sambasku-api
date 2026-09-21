// NOTE: file ini TIDAK lagi memuat dotenv - .env hanya relevan di runtime
// Node (main.ts + script CLI yang meng-import 'dotenv/config' sendiri).
// Di Cloudflare Workers, entry src/worker.ts mengisi process.env dari
// bindings SEBELUM modul aplikasi di-import (lazy import).
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.url(),

  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TOKEN_TTL: z.coerce.number().default(900), // 15 menit
  JWT_REFRESH_TOKEN_TTL: z.coerce.number().default(2592000), // 30 hari

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // Email HTTP (Resend) - jalur utama di Cloudflare Workers (SMTP = TCP,
  // tidak tersedia). Kalau di-set, dipakai LEBIH DULU daripada SMTP
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // resend | smtp. Kosong: Resend jika RESEND_API_KEY, else SMTP/log.
  MAIL_PROVIDER: z.string().optional(),

  CORS_ALLOWED_ORIGINS: z.string(), // comma-separated

  // Image provider - dipilih via IMAGE_PROVIDER (default 'imagekit',
  // lihat modules/image/infrastructure/image-storage.factory.ts).
  // Kredensial tetap per-provider: IMAGEKIT_* (bentuk kredensial tiap
  // provider memang beda - jangan dipaksa generik).
  // Tanpa kredensial: endpoint upload-token membalas 503
  // IMAGE_UPLOAD_UNAVAILABLE.
  IMAGE_PROVIDER: z.string().optional(),
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_URL_ENDPOINT: z.string().optional(), // mis. https://ik.imagekit.io/akun

  // KBBI lemma lookup (docs/api/13-api-kbbi-lemma-definition.md).
  // Pola sama IMAGE_PROVIDER + IMAGEKIT_*: pilih provider, kredensial/URL
  // spesifik per vendor. Default provider = raf555.
  // KBBI_PROVIDER=none (atau kosong) → 503 LEMMA_DEFINITION_PROVIDER_UNAVAILABLE.
  KBBI_PROVIDER: z.string().optional(),
  RAF555_BASE_URL: z.string().optional(), // default https://kbbi.raf555.dev di factory
  LEMMA_DEFINITION_CACHE_TTL_SECONDS: z.coerce.number().default(3600),

  // Unsplash — latar kartu share (docs/backlogs/SHARE.md). Tanpa key →
  // GET /api/v1/share/backgrounds mengembalikan items [].
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  PIXABAY_API_KEY: z.string().optional(),
  // Wikimedia Commons — User-Agent deskriptif (bukan secret). Kosong = default SambasKu.
  WIKIMEDIA_USER_AGENT: z.string().optional(),
  SHARE_BACKGROUNDS_CACHE_TTL_SECONDS: z.coerce.number().default(86_400),

  // Firebase Cloud Messaging (opsional). Tanpa ketiganya → push no-op.
  // Private key PEM: di Workers lewat `wrangler secret put FIREBASE_PRIVATE_KEY`
  // (boleh pakai \\n untuk newline).
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  APP_URL: z.url().default('http://localhost:5173'), // basis link reset password
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  CORS_ALLOWED_ORIGINS: parsed.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
};

// Aplikasi CRASH saat start kalau ada env wajib yang hilang/salah format
// - lebih baik gagal cepat di awal daripada error tak jelas di production.
// Dilarang akses `process.env` langsung di file manapun selain file ini.
