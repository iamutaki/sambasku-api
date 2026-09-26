import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { env } from '@/shared/config/env';
import { getAllCookieValues } from './parse-cookie-values';

export { getAllCookieValues };

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Scope cookie yang sedang dipakai (path + Domain opsional). */
export function currentRefreshCookieScope() {
  return {
    path: REFRESH_COOKIE_PATH,
    domain: env.REFRESH_COOKIE_DOMAIN,
  } as const;
}

/**
 * Hapus semua varian scope yang pernah dipakai: host-only lama + Domain
 * failover. Browser cocokkan name+path+domain; hapus satu scope tidak
 * menyentuh yang lain.
 */
export function clearRefreshCookieVariants(c: Context): void {
  const path = REFRESH_COOKIE_PATH;
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path });
  if (env.REFRESH_COOKIE_DOMAIN) {
    deleteCookie(c, REFRESH_TOKEN_COOKIE, { path, domain: env.REFRESH_COOKIE_DOMAIN });
  }
}

export function setRefreshTokenCookie(c: Context, token: string): void {
  clearRefreshCookieVariants(c);
  setCookie(c, REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Strict tetap aman: console./api./deno./render. satu registrable domain.
    sameSite: 'Strict',
    ...currentRefreshCookieScope(),
    maxAge: env.JWT_REFRESH_TOKEN_TTL,
  });
}
