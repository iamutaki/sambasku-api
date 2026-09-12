import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema, okNullResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { AuthController } from './auth.controller';
import {
  loginSchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshResponseSchema,
} from './validators/login.validator';
import { registerSchema, registerResponseSchema } from './validators/register.validator';
import { forgotPasswordSchema, forgotPasswordResponseSchema } from './validators/forgot-password.validator';
import { resetPasswordSchema, resetPasswordResponseSchema } from './validators/reset-password.validator';

export interface AuthRoutesDeps {
  controller: AuthController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAuthRoutes(deps: AuthRoutesDeps) {
  const authRoutes = createOpenApiApp();

  // Rate limiting per kategori (api-base-stack.md Section 15)
  authRoutes.use('/register', rateLimit({ points: 5, duration: 3600 })); // 5/jam per IP
  authRoutes.use('/login', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/forgot-password', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/logout-all-devices', deps.authenticate);

  // Generic supaya tipe schema tetap ter-infer oleh createRoute (c.req.valid tetap typed)
  const json = <T extends z.ZodType>(schema: T) => ({
    'application/json': { schema },
  });

  const registerRoute = createRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: 'Registrasi user baru (role default: contributor)',
    request: { body: { content: json(registerSchema) } },
    responses: {
      201: { description: 'Registrasi berhasil', content: json(registerResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      409: { description: 'Username/email sudah dipakai', content: json(errorResponseSchema) },
    },
  });

  const loginRoute = createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'Login — dapatkan access token + refresh token (httpOnly cookie)',
    request: { body: { content: json(loginSchema) } },
    responses: {
      200: { description: 'Login berhasil', content: json(loginResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Email atau password salah', content: json(errorResponseSchema) },
    },
  });

  const refreshRoute = createRoute({
    method: 'post',
    path: '/refresh',
    tags: ['Auth'],
    summary: 'Rotasi refresh token + access token baru (web: cookie, mobile: body)',
    request: { body: { content: json(refreshTokenBodySchema) } },
    responses: {
      200: { description: 'Access token baru', content: json(refreshResponseSchema) },
      401: { description: 'Refresh token tidak valid/kadaluarsa', content: json(errorResponseSchema) },
    },
  });

  const logoutRoute = createRoute({
    method: 'post',
    path: '/logout',
    tags: ['Auth'],
    summary: 'Logout — revoke refresh token perangkat ini (web: cookie, mobile: body)',
    request: { body: { content: json(refreshTokenBodySchema) } },
    responses: {
      200: { description: 'Logout berhasil', content: json(okNullResponseSchema) },
    },
  });

  const logoutAllRoute = createRoute({
    method: 'post',
    path: '/logout-all-devices',
    tags: ['Auth'],
    summary: 'Logout semua perangkat — revoke semua refresh token user',
    responses: {
      200: { description: 'Semua perangkat berhasil di-logout', content: json(okNullResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const forgotPasswordRoute = createRoute({
    method: 'post',
    path: '/forgot-password',
    tags: ['Auth'],
    summary: 'Minta link reset password (response selalu sama, cegah enumeration)',
    request: { body: { content: json(forgotPasswordSchema) } },
    responses: {
      200: { description: 'Link reset dikirim jika email terdaftar', content: json(forgotPasswordResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
    },
  });

  const resetPasswordRoute = createRoute({
    method: 'post',
    path: '/reset-password',
    tags: ['Auth'],
    summary: 'Reset password pakai token dari email',
    request: { body: { content: json(resetPasswordSchema) } },
    responses: {
      200: { description: 'Password berhasil direset', content: json(resetPasswordResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token reset tidak valid/kadaluarsa', content: json(errorResponseSchema) },
    },
  });

  // ponytail: cast `as never` — controller memakai Context generik (untuk cookie),
  // jadi status literal tidak ter-infer; bentuk response dicek e2e test + schema validator
  authRoutes.openapi(registerRoute, (c) => deps.controller.register(c, c.req.valid('json')) as never);
  authRoutes.openapi(loginRoute, (c) => deps.controller.login(c, c.req.valid('json')) as never);
  authRoutes.openapi(refreshRoute, (c) => deps.controller.refresh(c, c.req.valid('json')) as never);
  authRoutes.openapi(logoutRoute, (c) => deps.controller.logout(c, c.req.valid('json')) as never);
  authRoutes.openapi(logoutAllRoute, (c) => deps.controller.logoutAll(c) as never);
  authRoutes.openapi(forgotPasswordRoute, (c) => deps.controller.forgot(c, c.req.valid('json')) as never);
  authRoutes.openapi(resetPasswordRoute, (c) => deps.controller.reset(c, c.req.valid('json')) as never);

  return authRoutes;
}
