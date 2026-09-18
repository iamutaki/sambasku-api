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
function clientIpKey(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
}

export function rateLimit(opts: RateLimitOpts) {
  const limiter = new RateLimiterMemory({ points: opts.points, duration: opts.duration });

  return createMiddleware(async (c, next) => {
    const key = opts.keyFn ? opts.keyFn(c) : clientIpKey(c);
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
