import 'dotenv/config';
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

  CORS_ALLOWED_ORIGINS: z.string(), // comma-separated

  // Image provider (ImageKit) — opsional; tanpa ini endpoint upload-token
  // membalas 503 IMAGE_UPLOAD_UNAVAILABLE (lihat modules/image/)
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_URL_ENDPOINT: z.string().optional(), // mis. https://ik.imagekit.io/akun

  APP_URL: z.url().default('http://localhost:5173'), // basis link reset password
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  CORS_ALLOWED_ORIGINS: parsed.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
};

// Aplikasi CRASH saat start kalau ada env wajib yang hilang/salah format
// — lebih baik gagal cepat di awal daripada error tak jelas di production.
// Dilarang akses `process.env` langsung di file manapun selain file ini.
