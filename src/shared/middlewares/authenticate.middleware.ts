import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { AppError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';

export interface AccessTokenPayload {
  user_id: string; // ULID
  role: string;
}

type VerifyFn = (token: string) => Promise<AccessTokenPayload>;

function unauthorized(c: Context, error_code: string, message: string) {
  return c.json({ success: false as const, error_code, message, details: null }, 401);
}

// Factory: verify function di-inject dari composition root (main.ts), supaya
// shared/ tidak import internal modul auth — arah dependency tetap ke dalam.
export function createAuthenticateMiddleware(verifyAccessToken: VerifyFn) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      return unauthorized(c, 'UNAUTHORIZED', 'Token tidak disertakan');
    }

    try {
      const payload = await verifyAccessToken(token);
      c.set('user', { user_id: payload.user_id, role: payload.role });
      await next();
    } catch (err) {
      const code = err instanceof AppError && err.errorCode === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
      return unauthorized(c, code, 'Token tidak valid atau kadaluarsa');
    }
  });
}
