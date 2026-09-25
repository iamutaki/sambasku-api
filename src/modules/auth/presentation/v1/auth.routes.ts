import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema, okNullResponseSchema } from '@/shared/openapi/error-response.schema';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { AuthController } from './auth.controller';
import {
  loginSchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshResponseSchema,
} from './validators/login.validator';
import { registerSchema, registerResponseSchema } from './validators/register.validator';
import {
  verifyEmailSchema,
  verifyEmailResponseSchema,
  resendOtpSchema,
  resendOtpResponseSchema,
} from './validators/verify-email.validator';
import { forgotPasswordSchema, forgotPasswordResponseSchema } from './validators/forgot-password.validator';
import { resetPasswordSchema, resetPasswordResponseSchema } from './validators/reset-password.validator';
import { changePasswordSchema, changePasswordResponseSchema } from './validators/change-password.validator';
import { googleLoginSchema, googleLoginResponseSchema } from './validators/google-login.validator';
import {
  authProvidersResponseSchema,
  googleLinkResponseSchema,
  googleLinkSchema,
  unlinkGoogleResponseSchema,
} from './validators/google-link.validator';
import { facebookLoginSchema, facebookLoginResponseSchema } from './validators/facebook-login.validator';
import {
  accountDeletionMessageSchema,
  confirmAccountDeletionSchema,
  deleteOwnAccountSchema,
  requestAccountDeletionSchema,
} from './validators/account-deletion.validator';
import type { AccountDeletionUseCase } from '../../application/use-cases/account-deletion.use-case';

export interface AuthRoutesDeps {
  controller: AuthController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
  accountDeletion: AccountDeletionUseCase;
}

export function createAuthRoutes(deps: AuthRoutesDeps) {
  const authRoutes = createOpenApiApp();

  // Rate limiting per kategori (api-base-stack.md Section 15)
  authRoutes.use('/register', rateLimit({ points: 5, duration: 3600 })); // 5/jam per IP
  authRoutes.use('/login', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/google', rateLimit({ points: 5, duration: 900 })); // 5/15 menit per IP
  authRoutes.use('/facebook', rateLimit({ points: 5, duration: 900 })); // 5/15 menit per IP
  authRoutes.use('/verify-email', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/resend-otp', rateLimit({ points: 1, duration: 120 })); // 1/2 menit per IP
  authRoutes.use('/forgot-password', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/reset-password', rateLimit({ points: 5, duration: 900 })); // 5/15 menit
  authRoutes.use('/delete-account/request', rateLimit({ points: 5, duration: 900 }));
  authRoutes.use('/delete-account/confirm', rateLimit({ points: 5, duration: 900 }));
  authRoutes.use(
    '/account',
    deps.authenticate,
    rateLimit({ points: 5, duration: 900, keyFn: (c) => `delete-account:${c.get('user')?.user_id}` }),
  );
  authRoutes.use('/logout-all-devices', deps.authenticate);
  // authenticate HARUS duluan supaya c.get('user') terisi untuk keyFn
  // rate limit (10-api-ubah-password.md): 5/15 menit per user_id
  authRoutes.use(
    '/change-password',
    deps.authenticate,
    rateLimit({ points: 5, duration: 900, keyFn: (c) => `change-password:${c.get('user')?.user_id}` }),
  );
  authRoutes.use(
    '/providers',
    deps.authenticate,
    rateLimit({ points: 30, duration: 60, keyFn: (c) => `auth-providers:${c.get('user')?.user_id}` }),
  );
  authRoutes.use(
    '/google/link',
    deps.authenticate,
    rateLimit({ points: 5, duration: 900, keyFn: (c) => `google-link:${c.get('user')?.user_id}` }),
  );

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
      409: { description: 'Nama/email/HP sudah dipakai', content: json(errorResponseSchema) },
    },
  });

  const loginRoute = createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'Login - dapatkan access token + refresh token (httpOnly cookie)',
    request: { body: { content: json(loginSchema) } },
    responses: {
      200: { description: 'Login berhasil', content: json(loginResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Email atau password salah', content: json(errorResponseSchema) },
      403: { description: 'Email belum diverifikasi OTP', content: json(errorResponseSchema) },
    },
  });

  const googleLoginRoute = createRoute({
    method: 'post',
    path: '/google',
    tags: ['Auth'],
    summary: 'Masuk dengan Google (ID token)',
    request: { body: { content: json(googleLoginSchema) } },
    responses: {
      200: { description: 'Login berhasil', content: json(googleLoginResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'ID token Google tidak valid', content: json(errorResponseSchema) },
      409: { description: 'Email sudah terdaftar tanpa identitas Google', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (5/15 menit per IP)', content: json(errorResponseSchema) },
      503: { description: 'GOOGLE_CLIENT_ID belum di-set', content: json(errorResponseSchema) },
    },
  });

  const facebookLoginRoute = createRoute({
    method: 'post',
    path: '/facebook',
    tags: ['Auth'],
    summary: 'Masuk dengan Facebook (access token Graph)',
    request: { body: { content: json(facebookLoginSchema) } },
    responses: {
      200: { description: 'Login berhasil', content: json(facebookLoginResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Access token Facebook tidak valid', content: json(errorResponseSchema) },
      409: { description: 'Email sudah terdaftar tanpa identitas Facebook', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (5/15 menit per IP)', content: json(errorResponseSchema) },
      503: { description: 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET belum di-set', content: json(errorResponseSchema) },
    },
  });

  const verifyEmailRoute = createRoute({
    method: 'post',
    path: '/verify-email',
    tags: ['Auth'],
    summary: 'Verifikasi email dengan OTP 8 karakter 0-9A-Z, lalu terbitkan JWT seperti login',
    request: { body: { content: json(verifyEmailSchema) } },
    responses: {
      200: { description: 'Email terverifikasi + token', content: json(verifyEmailResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'OTP salah atau kadaluarsa', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (5/15 menit per IP)', content: json(errorResponseSchema) },
    },
  });

  const resendOtpRoute = createRoute({
    method: 'post',
    path: '/resend-otp',
    tags: ['Auth'],
    summary: 'Kirim ulang OTP (email tak dikenal tetap 200; cooldown 2 menit)',
    request: { body: { content: json(resendOtpSchema) } },
    responses: {
      200: { description: 'Kode baru dikirim jika email belum diverifikasi', content: json(resendOtpResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      429: { description: 'Kirim ulang terlalu cepat (1/2 menit per IP, dan 2 menit per email)', content: json(errorResponseSchema) },
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
    summary: 'Logout - revoke refresh token perangkat ini (web: cookie, mobile: body)',
    request: { body: { content: json(refreshTokenBodySchema) } },
    responses: {
      200: { description: 'Logout berhasil', content: json(okNullResponseSchema) },
    },
  });

  const logoutAllRoute = createRoute({
    method: 'post',
    path: '/logout-all-devices',
    tags: ['Auth'],
    summary: 'Logout semua perangkat - revoke semua refresh token user',
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

  const deleteOwnAccountRoute = createRoute({
    method: 'delete',
    path: '/account',
    tags: ['Auth'],
    summary: 'Hapus akun sendiri (soft delete + bersihkan data pribadi)',
    request: { body: { content: json(deleteOwnAccountSchema) } },
    responses: {
      200: { description: 'Akun dihapus', content: json(accountDeletionMessageSchema) },
      400: { description: 'Konfirmasi atau kata sandi tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Sesi tidak valid atau kata sandi salah', content: json(errorResponseSchema) },
    },
  });

  const requestAccountDeletionRoute = createRoute({
    method: 'post',
    path: '/delete-account/request',
    tags: ['Auth'],
    summary: 'Minta kode hapus akun lewat email (response selalu sama)',
    request: { body: { content: json(requestAccountDeletionSchema) } },
    responses: {
      200: { description: 'Kode dikirim jika email terdaftar', content: json(accountDeletionMessageSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
    },
  });

  const confirmAccountDeletionRoute = createRoute({
    method: 'post',
    path: '/delete-account/confirm',
    tags: ['Auth'],
    summary: 'Hapus akun dengan kode email',
    request: { body: { content: json(confirmAccountDeletionSchema) } },
    responses: {
      200: { description: 'Akun dihapus', content: json(accountDeletionMessageSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Kode tidak valid atau kedaluwarsa', content: json(errorResponseSchema) },
    },
  });

  const changePasswordRoute = createRoute({
    method: 'post',
    path: '/change-password',
    tags: ['Auth'],
    summary: 'Ubah password sendiri (login) - semua session direvoke, wajib login ulang',
    request: { body: { content: json(changePasswordSchema) } },
    responses: {
      200: { description: 'Password berhasil diubah', content: json(changePasswordResponseSchema) },
      400: {
        description: 'Body tidak valid / akun OAuth-only / password baru sama dengan lama',
        content: json(errorResponseSchema),
      },
      401: { description: 'Token tidak ada/invalid atau password lama salah', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (5/15 menit per user)', content: json(errorResponseSchema) },
    },
  });

  const listProvidersRoute = createRoute({
    method: 'get',
    path: '/providers',
    tags: ['Auth'],
    summary: 'Daftar provider OAuth yang terhubung ke akun',
    responses: {
      200: { description: 'Daftar provider', content: json(authProvidersResponseSchema) },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
    },
  });

  const linkGoogleRoute = createRoute({
    method: 'post',
    path: '/google/link',
    tags: ['Auth'],
    summary: 'Hubungkan akun Google ke user yang sedang login',
    request: { body: { content: json(googleLinkSchema) } },
    responses: {
      200: { description: 'Google terhubung', content: json(googleLinkResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token sesi / ID token Google tidak valid', content: json(errorResponseSchema) },
      409: { description: 'Google sudah terhubung ke akun lain', content: json(errorResponseSchema) },
      503: { description: 'GOOGLE_CLIENT_ID belum di-set', content: json(errorResponseSchema) },
    },
  });

  const unlinkGoogleRoute = createRoute({
    method: 'delete',
    path: '/google/link',
    tags: ['Auth'],
    summary: 'Lepas tautan akun Google',
    responses: {
      200: { description: 'Google dilepas', content: json(unlinkGoogleResponseSchema) },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
      404: { description: 'Google belum terhubung', content: json(errorResponseSchema) },
      409: { description: 'Metode login terakhir - setel password dulu', content: json(errorResponseSchema) },
    },
  });

  // ponytail: cast `as never` - controller memakai Context generik (untuk cookie),
  // jadi status literal tidak ter-infer; bentuk response dicek e2e test + schema validator
  authRoutes.openapi(registerRoute, (c) => deps.controller.register(c, c.req.valid('json')) as never);
  authRoutes.openapi(loginRoute, (c) => deps.controller.login(c, c.req.valid('json')) as never);
  authRoutes.openapi(googleLoginRoute, (c) => deps.controller.google(c, c.req.valid('json')) as never);
  authRoutes.openapi(facebookLoginRoute, (c) => deps.controller.facebook(c, c.req.valid('json')) as never);
  authRoutes.openapi(verifyEmailRoute, (c) => deps.controller.verifyEmail(c, c.req.valid('json')) as never);
  authRoutes.openapi(resendOtpRoute, (c) => deps.controller.resendOtp(c, c.req.valid('json')) as never);
  authRoutes.openapi(refreshRoute, (c) => deps.controller.refresh(c, c.req.valid('json')) as never);
  authRoutes.openapi(logoutRoute, (c) => deps.controller.logout(c, c.req.valid('json')) as never);
  authRoutes.openapi(logoutAllRoute, (c) => deps.controller.logoutAll(c) as never);
  authRoutes.openapi(forgotPasswordRoute, (c) => deps.controller.forgot(c, c.req.valid('json')) as never);
  authRoutes.openapi(resetPasswordRoute, (c) => deps.controller.reset(c, c.req.valid('json')) as never);
  authRoutes.openapi(changePasswordRoute, (c) => deps.controller.changePassword(c, c.req.valid('json')) as never);
  authRoutes.openapi(listProvidersRoute, (c) => deps.controller.listProviders(c) as never);
  authRoutes.openapi(linkGoogleRoute, (c) => deps.controller.linkGoogle(c, c.req.valid('json')) as never);
  authRoutes.openapi(unlinkGoogleRoute, (c) => deps.controller.unlinkGoogle(c) as never);
  authRoutes.openapi(deleteOwnAccountRoute, async (c) => {
    const typed = c as unknown as Context<{ Variables: AppVariables }>;
    const user = typed.get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const body = c.req.valid('json');
    await deps.accountDeletion.deleteOwn(
      { userId: user.user_id, password: body.password, confirmation: body.confirmation },
      typed.get('requestId'),
    );
    return c.json({
      success: true as const,
      data: { message: 'Akun dan data pribadi berhasil dihapus.' },
    }) as never;
  });
  authRoutes.openapi(requestAccountDeletionRoute, async (c) => {
    await deps.accountDeletion.requestByEmail(c.req.valid('json').email);
    return c.json({
      success: true as const,
      data: { message: 'Jika email terdaftar, kode penghapusan telah dikirim' },
    }) as never;
  });
  authRoutes.openapi(confirmAccountDeletionRoute, async (c) => {
    const body = c.req.valid('json');
    const typed = c as unknown as Context<{ Variables: AppVariables }>;
    await deps.accountDeletion.confirmByEmail(
      { email: body.email, code: body.code, confirmation: body.confirmation },
      typed.get('requestId'),
    );
    return c.json({
      success: true as const,
      data: { message: 'Akun dan data pribadi berhasil dihapus.' },
    }) as never;
  });

  return authRoutes;
}
