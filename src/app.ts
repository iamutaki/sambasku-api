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
import { WordRepositoryImpl } from '@/modules/word/infrastructure/word.repository.impl';
import { CreateWordUseCase } from '@/modules/word/application/use-cases/create-word.use-case';
import { GetWordByIdUseCase } from '@/modules/word/application/use-cases/get-word-by-id.use-case';
import { SearchWordsUseCase } from '@/modules/word/application/use-cases/search-words.use-case';
import { WordController } from '@/modules/word/presentation/v1/word.controller';
import {
  createAdminWordRoutes,
  createPublicWordRoutes,
} from '@/modules/word/presentation/v1/word.routes';
import { createWordClassRoutes } from '@/modules/word/presentation/v1/word-class.routes';
import { LanguageRepositoryImpl } from '@/modules/language/infrastructure/language.repository.impl';
import { ListLanguagesUseCase } from '@/modules/language/application/use-cases/list-languages.use-case';
import { ListDialectsUseCase } from '@/modules/language/application/use-cases/list-dialects.use-case';
import { LanguageController } from '@/modules/language/presentation/v1/language.controller';
import {
  createDialectRoutes,
  createLanguageRoutes,
} from '@/modules/language/presentation/v1/language.routes';
import { CategoryRepositoryImpl } from '@/modules/category/infrastructure/category.repository.impl';
import { ListCategoriesUseCase } from '@/modules/category/application/use-cases/list-categories.use-case';
import { CategoryController } from '@/modules/category/presentation/v1/category.controller';
import { createCategoryRoutes } from '@/modules/category/presentation/v1/category.routes';
import { AuditLogRepositoryImpl } from '@/modules/audit/infrastructure/audit-log.repository.impl';
import { ListAuditLogsUseCase } from '@/modules/audit/application/use-cases/list-audit-logs.use-case';
import { AuditController } from '@/modules/audit/presentation/v1/audit.controller';
import { createAuditRoutes } from '@/modules/audit/presentation/v1/audit.routes';
import { ImageKitStorageService } from '@/modules/image/infrastructure/imagekit-storage.service';
import { CreateUploadCredentialsUseCase } from '@/modules/image/application/use-cases/create-upload-credentials.use-case';
import { ImageController } from '@/modules/image/presentation/v1/image.controller';
import { createImageRoutes } from '@/modules/image/presentation/v1/image.routes';

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

// ---- Modul audit (Section 21) — direkspos ke use case modul lain ----
const auditRepo = new AuditLogRepositoryImpl(db);

const controller = new AuthController({
  register: new RegisterUserUseCase(userRepo, hasher, auditRepo),
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
  reset: new ResetPasswordUseCase(resetTokenRepo, userRepo, hasher, auditRepo, refreshTokenRepo),
});

const authenticate = createAuthenticateMiddleware((token) => tokenService.verifyAccessToken(token));

// ---- Modul word (+ language & category sebagai data referensi form admin) ----
const wordRepo = new WordRepositoryImpl(db);
const imageStorage = new ImageKitStorageService();
const wordController = new WordController({
  create: new CreateWordUseCase(wordRepo, auditRepo),
  getById: new GetWordByIdUseCase(wordRepo),
  search: new SearchWordsUseCase(wordRepo),
  listWordClasses: () => wordRepo.listWordClasses(),
  imageProviderName: imageStorage.providerName,
});

const languageRepo = new LanguageRepositoryImpl(db);
const languageController = new LanguageController({
  listLanguages: new ListLanguagesUseCase(languageRepo),
  listDialects: new ListDialectsUseCase(languageRepo),
});

const categoryController = new CategoryController({
  listCategories: new ListCategoriesUseCase(new CategoryRepositoryImpl(db)),
});

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

// Modul word — admin (write) + publik (read)
app.route('/api/v1/admin/words', createAdminWordRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/words', createPublicWordRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/word-classes', createWordClassRoutes({ controller: wordController }));

// Data referensi form admin
app.route('/api/v1/languages', createLanguageRoutes({ controller: languageController }));
app.route('/api/v1/dialects', createDialectRoutes({ controller: languageController }));
app.route('/api/v1/categories', createCategoryRoutes({ controller: categoryController }));

// Audit log — hanya admin & root (Section 21)
const auditController = new AuditController({ listAuditLogs: new ListAuditLogsUseCase(auditRepo) });
app.route('/api/v1/admin/audit-logs', createAuditRoutes({ controller: auditController, authenticate }));

// Image provider — wrapper ImageKit via ImageStoragePort (Section 8);
// imageStorage sudah di-instantiate di atas (dipakai wordController juga)
const imageController = new ImageController({
  createUploadCredentials: new CreateUploadCredentialsUseCase({
    imageStorage,
    defaultFolder: '/words',
  }),
});
app.route('/api/v1/admin/images/upload-token', createImageRoutes({ controller: imageController, authenticate }));

// OpenAPI spec + Scalar docs (api-base-stack.md Section 9)
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Kamus Digital Sambas-Indonesia API',
    version: '1.0.0',
  },
});
app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }));
