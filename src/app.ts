import { apiReference } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { env } from '@/shared/config/env';
import { db } from '@/shared/database/drizzle/client';
import { errorHandler } from '@/shared/middlewares/error-handler.middleware';
import { requestIdMiddleware } from '@/shared/middlewares/request-id.middleware';
import { createAuthenticateMiddleware } from '@/shared/middlewares/authenticate.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { UserRepositoryImpl } from '@/modules/auth/infrastructure/user.repository.impl';
import { RefreshTokenRepositoryImpl } from '@/modules/auth/infrastructure/refresh-token.repository.impl';
import { PasswordResetTokenRepositoryImpl } from '@/modules/auth/infrastructure/password-reset-token.repository.impl';
import { JwtTokenService } from '@/modules/auth/infrastructure/jwt-token.service';
import { Argon2PasswordService } from '@/modules/auth/infrastructure/argon2-password.service';
import { SmtpMailerService } from '@/modules/auth/infrastructure/smtp-mailer.service';
import { RegisterUserUseCase } from '@/modules/auth/application/use-cases/register-user.use-case';
import { LoginUserUseCase } from '@/modules/auth/application/use-cases/login-user.use-case';
import { RefreshTokenUseCase } from '@/modules/auth/application/use-cases/refresh-token.use-case';
import { LogoutUserUseCase } from '@/modules/auth/application/use-cases/logout-user.use-case';
import { LogoutAllDevicesUseCase } from '@/modules/auth/application/use-cases/logout-all-devices.use-case';
import { ForgotPasswordUseCase } from '@/modules/auth/application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '@/modules/auth/application/use-cases/reset-password.use-case';
import { AuthController } from '@/modules/auth/presentation/v1/auth.controller';
import { createAuthRoutes } from '@/modules/auth/presentation/v1/auth.routes';

// ---- Composition root: rakit semua dependency (manual DI, api-base-stack.md Section 2) ----
const userRepo = new UserRepositoryImpl(db);
const refreshTokenRepo = new RefreshTokenRepositoryImpl(db);
const resetTokenRepo = new PasswordResetTokenRepositoryImpl(db);
const tokenService = new JwtTokenService({
  privateKeyPem: env.JWT_PRIVATE_KEY,
  publicKeyPem: env.JWT_PUBLIC_KEY,
  accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL,
});
const hasher = new Argon2PasswordService();
const mailer = new SmtpMailerService();

const controller = new AuthController({
  register: new RegisterUserUseCase(userRepo, hasher),
  login: new LoginUserUseCase(
    userRepo,
    hasher,
    tokenService,
    refreshTokenRepo,
    env.JWT_ACCESS_TOKEN_TTL,
    env.JWT_REFRESH_TOKEN_TTL,
  ),
  refresh: new RefreshTokenUseCase(
    refreshTokenRepo,
    userRepo,
    tokenService,
    env.JWT_ACCESS_TOKEN_TTL,
    env.JWT_REFRESH_TOKEN_TTL,
  ),
  logout: new LogoutUserUseCase(refreshTokenRepo),
  logoutAll: new LogoutAllDevicesUseCase(refreshTokenRepo),
  forgot: new ForgotPasswordUseCase(userRepo, resetTokenRepo, mailer, `${env.APP_URL}/reset-password`),
  reset: new ResetPasswordUseCase(resetTokenRepo, userRepo, hasher),
});

const authenticate = createAuthenticateMiddleware((token) => tokenService.verifyAccessToken(token));

// ---- HTTP app ----
export const app = createOpenApiApp();
app.onError(errorHandler);

// Route tidak ditemukan — HARUS envelope juga (api-base-stack.md Section 13).
// Tanpa ini Hono balas plain text "404 Not Found".
app.notFound((c) =>
  c.json(
    {
      success: false as const,
      error_code: 'NOT_FOUND',
      message: 'Route tidak ditemukan',
      details: null,
    },
    404,
  ),
);

app.use('*', requestIdMiddleware);
app.use('/api/*', cors({ origin: env.CORS_ALLOWED_ORIGINS, credentials: true }));

// Info singkat di root — meta route (bukan endpoint fitur, jadi tidak ikut OpenAPI spec)
app.get('/', (c) =>
  c.json({
    success: true as const,
    data: {
      name: 'Kamus Digital Sambas-Indonesia API',
      version: '1.0.0',
      docs: '/docs',
      openapi: '/openapi.json',
    },
  }),
);

app.route('/api/v1/auth', createAuthRoutes({ controller, authenticate }));

// OpenAPI spec + Scalar docs (api-base-stack.md Section 9)
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Kamus Digital Sambas-Indonesia API',
    version: '1.0.0',
  },
});
app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }));
