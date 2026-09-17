import { apiReference } from '@scalar/hono-api-reference';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { cors } from 'hono/cors';
import { env } from '@/shared/config/env';
import { sql } from 'drizzle-orm';
import { db } from '@/shared/database/drizzle/client';
import { errorHandler } from '@/shared/middlewares/error-handler.middleware';
import { requestIdMiddleware } from '@/shared/middlewares/request-id.middleware';
import { requestDb } from '@/shared/middlewares/request-db.middleware';
import { createAuthenticateMiddleware } from '@/shared/middlewares/authenticate.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { UserRepositoryImpl } from '@/modules/auth/infrastructure/user.repository.impl';
import { RefreshTokenRepositoryImpl } from '@/modules/auth/infrastructure/refresh-token.repository.impl';
import { PasswordResetTokenRepositoryImpl } from '@/modules/auth/infrastructure/password-reset-token.repository.impl';
import { JwtTokenService } from '@/modules/auth/infrastructure/jwt-token.service';
import { Pbkdf2PasswordService } from '@/modules/auth/infrastructure/pbkdf2-password.service';
import { createMailer } from '@/modules/auth/infrastructure/mailer.factory';
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
import { VerifyWordUseCase } from '@/modules/word/application/use-cases/verify-word.use-case';
import { AddPronunciationUseCase } from '@/modules/word/application/use-cases/add-pronunciation.use-case';
import { AddWordImageUseCase } from '@/modules/word/application/use-cases/add-word-image.use-case';
import { AddExampleUseCase } from '@/modules/word/application/use-cases/add-example.use-case';
import { WordController } from '@/modules/word/presentation/v1/word.controller';
import {
  createAdminWordRoutes,
  createPublicWordRoutes,
} from '@/modules/word/presentation/v1/word.routes';
import {
  createMeaningExampleRoutes,
  createWordMediaRoutes,
} from '@/modules/word/presentation/v1/word-media.routes';
import { createAnonContributionRoutes } from '@/modules/word/presentation/v1/anon-contribution.routes';
import { createWordClassRoutes } from '@/modules/word/presentation/v1/word-class.routes';
import { ContributionRepositoryImpl } from '@/modules/contribution/infrastructure/contribution.repository.impl';
import { ListContributionsUseCase } from '@/modules/contribution/application/use-cases/list-contributions.use-case';
import { GetContributionDetailUseCase } from '@/modules/contribution/application/use-cases/get-contribution-detail.use-case';
import { ReviewContributionUseCase } from '@/modules/contribution/application/use-cases/review-contribution.use-case';
import { CorrectContributionUseCase } from '@/modules/contribution/application/use-cases/correct-contribution.use-case';
import { ContributionController } from '@/modules/contribution/presentation/v1/contribution.controller';
import { createContributionRoutes } from '@/modules/contribution/presentation/v1/contribution.routes';
import { SearchMissRepositoryImpl } from '@/modules/search-miss/infrastructure/search-miss.repository.impl';
import { ListSearchMissesUseCase } from '@/modules/search-miss/application/use-cases/list-search-misses.use-case';
import { DismissSearchMissUseCase } from '@/modules/search-miss/application/use-cases/dismiss-search-miss.use-case';
import { SearchMissController } from '@/modules/search-miss/presentation/v1/search-miss.controller';
import {
  createAdminSearchMissRoutes,
  createSearchMissRoutes,
} from '@/modules/search-miss/presentation/v1/search-miss.routes';
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
import { createImageStorage } from '@/modules/image/infrastructure/image-storage.factory';
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
const hasher = new Pbkdf2PasswordService();
// Email: Resend (HTTP) kalau RESEND_API_KEY ter-set — jalur Cloudflare
// Workers; selain itu SMTP (Node). Keduanya implements MailerPort.
const mailer = createMailer();

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
// Provider gambar dipilih via env IMAGE_PROVIDER (default imagekit) —
// pola factory yang sama dengan createMailer (Section 8)
const imageStorage = createImageStorage();
// Search miss: pencarian kosong → peluang kontribusi (03 doc) — direcord
// dari SearchWordsUseCase lewat interface modul search-miss (Section 4)
const searchMissRepo = new SearchMissRepositoryImpl(db);
const wordController = new WordController({
  create: new CreateWordUseCase(wordRepo, auditRepo),
  getById: new GetWordByIdUseCase(wordRepo),
  search: new SearchWordsUseCase(wordRepo, searchMissRepo),
  verify: new VerifyWordUseCase(wordRepo, auditRepo),
  addPronunciation: new AddPronunciationUseCase(wordRepo, auditRepo),
  addWordImage: new AddWordImageUseCase(wordRepo, auditRepo),
  addExample: new AddExampleUseCase(wordRepo, auditRepo),
  listWordClasses: () => wordRepo.listWordClasses(),
  imageProviderName: imageStorage.providerName,
});

// ---- Modul contribution — antrean review (Section 22 approval gate,
// 03-api-kontribusi-verifikasi.md). Baca entity word lewat interface
// WordRepository (batas modul Section 4). ----
const contributionRepo = new ContributionRepositoryImpl(db);
const contributionController = new ContributionController({
  list: new ListContributionsUseCase(contributionRepo),
  getDetail: new GetContributionDetailUseCase(contributionRepo, wordRepo),
  review: new ReviewContributionUseCase(contributionRepo, auditRepo),
  correct: new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo),
  imageProviderName: imageStorage.providerName,
});

const searchMissController = new SearchMissController({
  list: new ListSearchMissesUseCase(searchMissRepo),
  dismiss: new DismissSearchMissUseCase(searchMissRepo, auditRepo),
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
// Workers: pool DB per-request (WebSocket = I/O milik request, lihat client.ts)
app.use('*', requestDb);
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

// Health check — dipakai orchestrator (Docker/K8s/Railway) untuk liveness
app.get('/health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'error', database: 'down', timestamp: new Date().toISOString() }, 503);
  }
});

// Canary CI/CD — dipakai memverifikasi deploy baru end-to-end:
// push → GitHub Actions → GET /api/v1/ping harus menunjukkan perubahan.
// `runtime` membuktikan entry mana yang melayani (dual-runtime).
// Terdaftar via createRoute agar muncul di OpenAPI spec + Scalar (Section 9)
// — beda dari / dan /health yang memang meta route di luar spec.
const pingRoute = createRoute({
  method: 'get',
  path: '/api/v1/ping',
  tags: ['Misc'],
  summary: 'Canary CI/CD — verifikasi deploy (tanpa auth, tanpa DB)',
  responses: {
    200: {
      description: 'Pong + info runtime yang melayani',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              pong: z.boolean(),
              time: z.string(),
              env: z.string(),
              runtime: z.enum(['node', 'cloudflare-workers']),
            }),
          }),
        },
      },
    },
  },
});

app.openapi(pingRoute, (c) =>
  c.json({
    success: true as const,
    data: {
      pong: true,
      time: new Date().toISOString(),
      env: env.NODE_ENV,
      runtime:
        typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'
          ? 'cloudflare-workers'
          : 'node',
    },
  }),
);

app.route('/api/v1/auth', createAuthRoutes({ controller, authenticate }));

// Modul word — admin (write) + publik (read)
app.route('/api/v1/admin/words', createAdminWordRoutes({ controller: wordController, authenticate }));
// Kontribusi media (pronounce/gambar/contoh) DI-MOUNT SEBELUM public routes —
// public punya rate limit IP 100/menit global (use '*'), limit per-user 30/menit
// tetap jadi batas efektif; urutan mount menentukan middleware yang berlaku
app.route('/api/v1/words', createWordMediaRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/words', createPublicWordRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/meanings', createMeaningExampleRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/word-classes', createWordClassRoutes({ controller: wordController }));

// Antrean review kontribusi — hanya verifikator (Section 22)
app.route('/api/v1/admin/contributions', createContributionRoutes({ controller: contributionController, authenticate }));

// Submit kata TANPA login (publik, 5/jam per IP) — atribusi ke user sistem
// Anonim, otomatis pending_review (03-api-kontribusi-verifikasi.md)
app.route('/api/v1/contributions', createAnonContributionRoutes({ controller: wordController }));

// Search miss — beranda publik (peluang kontribusi) + panel admin
app.route('/api/v1/search-misses', createSearchMissRoutes({ controller: searchMissController, authenticate }));
app.route('/api/v1/admin/search-misses', createAdminSearchMissRoutes({ controller: searchMissController, authenticate }));

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
