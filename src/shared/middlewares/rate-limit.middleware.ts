import { createMiddleware } from 'hono/factory';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Context } from 'hono';
// ponytail: in-memory, satu instance - ganti ke RateLimiterRedis saat multi-instance

interface RateLimitOpts {
  points: number;
  duration: number; // detik
  keyFn?: (c: Context) => string;
}

// Key default per-IP: Cloudflare Workers menyediakan cf-connecting-ip
// (x-forwarded-for TIDAK diset di sana) - tanpa ini semua klien anonim
// berbagi satu bucket "unknown" dan saling mengunci (Section 15).
export function clientIpKey(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
}

/** Header X-Device-Id: trim, panjang 8-64. Di luar itu diabaikan (06-api). */
export function normalizedDeviceId(c: Context): string | null {
  const raw = (c.req.header('x-device-id') ?? '').trim();
  if (raw.length < 8 || raw.length > 64) return null;
  return raw;
}

export function rateLimit(opts: RateLimitOpts) {
  const limiter = new RateLimiterMemory({ points: opts.points, duration: opts.duration });

  return createMiddleware(async (c, next) => {
    const key = opts.keyFn ? opts.keyFn(c) : clientIpKey(c);
    // key kosong = lewati consume (header device absen → bucket IP saja)
    if (!key) {
      await next();
      return;
    }
    try {
      await limiter.consume(key);
      await next();
    } catch {
      c.header('Retry-After', String(opts.duration));
      return c.json(
        {
          success: false as const,
          error_code: 'RATE_LIMITED',
          message: 'Terlalu banyak percobaan, coba lagi nanti',
          details: null,
        },
        429,
      );
    }
  });
}
