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
import {
  createAuthenticateMiddleware,
  createOptionalAuthenticateMiddleware,
} from '@/shared/middlewares/authenticate.middleware';
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
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/change-password.use-case';
import { AuthController } from '@/modules/auth/presentation/v1/auth.controller';
import { createAuthRoutes } from '@/modules/auth/presentation/v1/auth.routes';
import { ListAdminUsersUseCase } from '@/modules/auth/application/use-cases/list-admin-users.use-case';
import { UpdateUserRoleUseCase } from '@/modules/auth/application/use-cases/update-user-role.use-case';
import { AdminUsersController } from '@/modules/auth/presentation/v1/admin-user.controller';
import { createAdminUserRoutes } from '@/modules/auth/presentation/v1/admin-user.routes';
import { WordRepositoryImpl } from '@/modules/word/infrastructure/word.repository.impl';
import { CreateWordUseCase } from '@/modules/word/application/use-cases/create-word.use-case';
import { UpdateWordUseCase } from '@/modules/word/application/use-cases/update-word.use-case';
import { GetWordByIdUseCase } from '@/modules/word/application/use-cases/get-word-by-id.use-case';
import { GetWordOfDayUseCase } from '@/modules/word/application/use-cases/get-word-of-day.use-case';
import { SearchWordsUseCase } from '@/modules/word/application/use-cases/search-words.use-case';
import { ListAdminWordsUseCase } from '@/modules/word/application/use-cases/list-admin-words.use-case';
import { ListWordsUseCase } from '@/modules/word/application/use-cases/list-words.use-case';
import { VerifyWordUseCase } from '@/modules/word/application/use-cases/verify-word.use-case';
import { PublishWordUseCase } from '@/modules/word/application/use-cases/publish-word.use-case';
import { SoftDeleteWordUseCase } from '@/modules/word/application/use-cases/soft-delete-word.use-case';
import { AddPronunciationUseCase } from '@/modules/word/application/use-cases/add-pronunciation.use-case';
import { AddMeaningUseCase } from '@/modules/word/application/use-cases/add-meaning.use-case';
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
import {
  createWordSuggestionRoutes,
  createWordHistoryRoutes,
  createAdminSuggestionRoutes,
} from '@/modules/word-suggestions/presentation/v1/word-suggestions.routes';
import { WordSuggestionController } from '@/modules/word-suggestions/presentation/v1/word-suggestions.controller';
import { WordSuggestionRepositoryImpl } from '@/modules/word-suggestions/infrastructure/word-suggestion.repository.impl';
import { ContributionRepositoryImpl } from '@/modules/contribution/infrastructure/contribution.repository.impl';
import { ListContributionsUseCase } from '@/modules/contribution/application/use-cases/list-contributions.use-case';
import { GetContributionDetailUseCase } from '@/modules/contribution/application/use-cases/get-contribution-detail.use-case';
import { ReviewContributionUseCase } from '@/modules/contribution/application/use-cases/review-contribution.use-case';
import { CorrectContributionUseCase } from '@/modules/contribution/application/use-cases/correct-contribution.use-case';
import { ContributionController } from '@/modules/contribution/presentation/v1/contribution.controller';
import { createContributionRoutes } from '@/modules/contribution/presentation/v1/contribution.routes';
import { createMyContributionRoutes } from '@/modules/contribution/presentation/v1/my-contribution.routes';
import { MyContributionController } from '@/modules/contribution/presentation/v1/my-contribution.controller';
import { ListMyContributionsUseCase } from '@/modules/contribution/application/use-cases/list-my-contributions.use-case';
import { GetMyContributionDetailUseCase } from '@/modules/contribution/application/use-cases/get-my-contribution-detail.use-case';
import { SearchMissRepositoryImpl } from '@/modules/search-miss/infrastructure/search-miss.repository.impl';
import { ListSearchMissesUseCase } from '@/modules/search-miss/application/use-cases/list-search-misses.use-case';
import { DismissSearchMissUseCase } from '@/modules/search-miss/application/use-cases/dismiss-search-miss.use-case';
import { UpdateSearchMissUseCase } from '@/modules/search-miss/application/use-cases/update-search-miss.use-case';
import { ResolveSearchMissUseCase } from '@/modules/search-miss/application/use-cases/resolve-search-miss.use-case';
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
import { DashboardController } from '@/modules/dashboard/presentation/v1/dashboard.controller';
import { createDashboardRoutes } from '@/modules/dashboard/presentation/v1/dashboard.routes';
import { GetDashboardStatsUseCase } from '@/modules/dashboard/application/use-cases/get-dashboard-stats.use-case';
import { DashboardRepositoryImpl } from '@/modules/dashboard/infrastructure/dashboard.repository.impl';
import { VoteRepositoryImpl } from '@/modules/vote/infrastructure/vote.repository.impl';
import { ToggleVoteUseCase } from '@/modules/vote/application/use-cases/toggle-vote.use-case';
import { GetVoteCountsUseCase } from '@/modules/vote/application/use-cases/get-vote-counts.use-case';
import { GetMyVotesUseCase } from '@/modules/vote/application/use-cases/get-my-votes.use-case';
import { VoteController } from '@/modules/vote/presentation/v1/vote.controller';
import { createVoteRoutes } from '@/modules/vote/presentation/v1/vote.routes';
import { AdminVotesController } from '@/modules/vote/presentation/v1/admin-vote.controller';
import { createAdminVoteRoutes } from '@/modules/vote/presentation/v1/admin-vote.routes';
import { ListAdminVotesUseCase } from '@/modules/vote/application/use-cases/list-admin-votes.use-case';
import { DeleteAdminVoteUseCase } from '@/modules/vote/application/use-cases/delete-admin-vote.use-case';
import { ResetTargetVotesUseCase } from '@/modules/vote/application/use-cases/reset-target-votes.use-case';
import { GetTopTargetVotesUseCase } from '@/modules/vote/application/use-cases/get-top-target-votes.use-case';
import { CommentRepositoryImpl } from '@/modules/comment/infrastructure/comment.repository.impl';
import { CreateCommentUseCase } from '@/modules/comment/application/use-cases/create-comment.use-case';
import { ListWordCommentsUseCase } from '@/modules/comment/application/use-cases/list-word-comments.use-case';
import { DeleteCommentUseCase } from '@/modules/comment/application/use-cases/delete-comment.use-case';
import { ListAdminCommentsUseCase } from '@/modules/comment/application/use-cases/list-admin-comments.use-case';
import { ReviewCommentUseCase } from '@/modules/comment/application/use-cases/review-comment.use-case';
import { CommentController } from '@/modules/comment/presentation/v1/comment.controller';
import { createCommentRoutes, createWordCommentRoutes } from '@/modules/comment/presentation/v1/comment.routes';
import { createAdminCommentRoutes } from '@/modules/comment/presentation/v1/admin-comment.routes';
import { BookmarkRepositoryImpl } from '@/modules/bookmark/infrastructure/bookmark.repository.impl';
import { ToggleBookmarkUseCase } from '@/modules/bookmark/application/use-cases/toggle-bookmark.use-case';
import { GetMyBookmarksUseCase } from '@/modules/bookmark/application/use-cases/get-my-bookmarks.use-case';
import { BookmarkController } from '@/modules/bookmark/presentation/v1/bookmark.controller';
import { createBookmarkRoutes } from '@/modules/bookmark/presentation/v1/bookmark.routes';
import { PublicUserRepositoryImpl } from '@/modules/user/infrastructure/public-user.repository.impl';
import { GetPublicProfileUseCase } from '@/modules/user/application/use-cases/get-public-profile.use-case';
import { UserController } from '@/modules/user/presentation/v1/user.controller';
import { createPublicUserRoutes } from '@/modules/user/presentation/v1/user.routes';
import { DeviceTokenRepositoryImpl } from '@/modules/device/infrastructure/device-token.repository.impl';
import { RegisterDeviceTokenUseCase } from '@/modules/device/application/use-cases/register-device-token.use-case';
import { RevokeDeviceTokenUseCase } from '@/modules/device/application/use-cases/revoke-device-token.use-case';
import { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import { createPushSender } from '@/modules/device/infrastructure/push-sender.factory';
import { DeviceController } from '@/modules/device/presentation/v1/device.controller';
import { createDeviceRoutes } from '@/modules/device/presentation/v1/device.routes';
import { NotificationRepositoryImpl } from '@/modules/notification/infrastructure/notification.repository.impl';
import { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import { ListMyNotificationsUseCase } from '@/modules/notification/application/use-cases/list-my-notifications.use-case';
import { GetUnreadNotificationCountUseCase } from '@/modules/notification/application/use-cases/get-unread-notification-count.use-case';
import { MarkNotificationReadUseCase } from '@/modules/notification/application/use-cases/mark-notification-read.use-case';
import { MarkAllNotificationsReadUseCase } from '@/modules/notification/application/use-cases/mark-all-notifications-read.use-case';
import { NotificationController } from '@/modules/notification/presentation/v1/notification.controller';
import { createNotificationRoutes } from '@/modules/notification/presentation/v1/notification.routes';
import { createLemmaDefinitionProviderRegistry } from '@/modules/lemma-definition/infrastructure/lemma-definition-provider.factory';
import { LookupLemmaDefinitionUseCase } from '@/modules/lemma-definition/application/use-cases/lookup-lemma-definition.use-case';
import { LemmaDefinitionController } from '@/modules/lemma-definition/presentation/v1/lemma-definition.controller';
import { createLemmaDefinitionRoutes } from '@/modules/lemma-definition/presentation/v1/lemma-definition.routes';
import { createShareBackgroundProviderRegistry, listShareBackgroundProviderInfos } from '@/modules/share/infrastructure/share-background.factory';
import { ListShareBackgroundsUseCase } from '@/modules/share/application/use-cases/list-share-backgrounds.use-case';
import { ShareController } from '@/modules/share/presentation/v1/share.controller';
import { createShareRoutes } from '@/modules/share/presentation/v1/share.routes';
import { VerifierApplicationRepositoryImpl } from '@/modules/verifier-application/infrastructure/verifier-application.repository.impl';
import { CreateVerifierApplicationUseCase } from '@/modules/verifier-application/application/use-cases/create-verifier-application.use-case';
import { GetMyVerifierApplicationUseCase } from '@/modules/verifier-application/application/use-cases/get-my-verifier-application.use-case';
import { ResubmitVerifierApplicationUseCase } from '@/modules/verifier-application/application/use-cases/resubmit-verifier-application.use-case';
import { ListVerifierApplicationsUseCase } from '@/modules/verifier-application/application/use-cases/list-verifier-applications.use-case';
import { GetVerifierApplicationDetailUseCase } from '@/modules/verifier-application/application/use-cases/get-verifier-application-detail.use-case';
import { ApproveVerifierApplicationUseCase } from '@/modules/verifier-application/application/use-cases/approve-verifier-application.use-case';
import { RejectVerifierApplicationUseCase } from '@/modules/verifier-application/application/use-cases/reject-verifier-application.use-case';
import { VerifierApplicationController } from '@/modules/verifier-application/presentation/v1/verifier-application.controller';
import { createVerifierApplicationRoutes } from '@/modules/verifier-application/presentation/v1/verifier-application.routes';
import { createAdminVerifierApplicationRoutes } from '@/modules/verifier-application/presentation/v1/admin-verifier-application.routes';

// ---- Composition root: rakit semua dependency (manual DI, api-base-stack.md Section 2) ----
const userRepo = new UserRepositoryImpl(db);
const refreshTokenRepo = new RefreshTokenRepositoryImpl(db);
const resetTokenRepo = new PasswordResetTokenRepositoryImpl(db);
const deviceTokenRepo = new DeviceTokenRepositoryImpl(db);
const pushSender = createPushSender();
const notifyUser = new NotifyUserUseCase(deviceTokenRepo, pushSender);
const notificationRepo = new NotificationRepositoryImpl(db);
const recordInbox = new RecordInboxNotificationUseCase(notificationRepo);
const tokenService = new JwtTokenService({
  privateKeyPem: env.JWT_PRIVATE_KEY,
  publicKeyPem: env.JWT_PUBLIC_KEY,
  accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL,
});
const hasher = new Pbkdf2PasswordService();
// Email: Resend (HTTP) kalau RESEND_API_KEY ter-set - jalur Cloudflare
// Workers; selain itu SMTP (Node). Keduanya implements MailerPort.
const mailer = createMailer();

// ---- Modul audit (Section 21) - direkspos ke use case modul lain ----
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
  logoutAll: new LogoutAllDevicesUseCase(refreshTokenRepo, deviceTokenRepo),
  forgot: new ForgotPasswordUseCase(userRepo, resetTokenRepo, mailer, `${env.APP_URL}/reset-password`),
  reset: new ResetPasswordUseCase(resetTokenRepo, userRepo, hasher, auditRepo, refreshTokenRepo),
  changePassword: new ChangePasswordUseCase(userRepo, hasher, auditRepo, refreshTokenRepo),
});

const authenticate = createAuthenticateMiddleware((token) => tokenService.verifyAccessToken(token));
const optionalAuthenticate = createOptionalAuthenticateMiddleware((token) =>
  tokenService.verifyAccessToken(token),
);

// ---- Modul word (+ language & category sebagai data referensi form admin) ----
const wordRepo = new WordRepositoryImpl(db);
// Provider gambar dipilih via env IMAGE_PROVIDER (default imagekit) -
// pola factory yang sama dengan createMailer (Section 8)
const imageStorage = createImageStorage();
// Search miss: pencarian kosong → peluang kontribusi (03 doc) - direcord
// dari SearchWordsUseCase lewat interface modul search-miss (Section 4)
const searchMissRepo = new SearchMissRepositoryImpl(db);
const wordController = new WordController({
  create: new CreateWordUseCase(wordRepo, auditRepo, searchMissRepo),
  update: new UpdateWordUseCase(wordRepo, auditRepo),
  getById: new GetWordByIdUseCase(wordRepo),
  wordOfDay: new GetWordOfDayUseCase(wordRepo),
  search: new SearchWordsUseCase(wordRepo, searchMissRepo),
  listAdmin: new ListAdminWordsUseCase(wordRepo),
  list: new ListWordsUseCase(wordRepo),
  verify: new VerifyWordUseCase(wordRepo, auditRepo),
  publish: new PublishWordUseCase(wordRepo, auditRepo),
  deleteWord: new SoftDeleteWordUseCase(wordRepo, auditRepo),
  addPronunciation: new AddPronunciationUseCase(wordRepo, auditRepo),
  addWordImage: new AddWordImageUseCase(wordRepo, auditRepo),
  addExample: new AddExampleUseCase(wordRepo, auditRepo),
  addMeaning: new AddMeaningUseCase(wordRepo, auditRepo),
  listWordClasses: () => wordRepo.listWordClasses(),
  imageProviderName: imageStorage.providerName,
});

// ---- Modul contribution - antrean review (Section 22 approval gate,
// 03-api-kontribusi-verifikasi.md). Baca entity word lewat interface
// WordRepository (batas modul Section 4). ----
const contributionRepo = new ContributionRepositoryImpl(db);
const contributionController = new ContributionController({
  list: new ListContributionsUseCase(contributionRepo),
  getDetail: new GetContributionDetailUseCase(contributionRepo, wordRepo),
  review: new ReviewContributionUseCase(contributionRepo, auditRepo, notifyUser, recordInbox),
  correct: new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo, recordInbox),
  imageProviderName: imageStorage.providerName,
});

const languageRepo = new LanguageRepositoryImpl(db);

const searchMissController = new SearchMissController({
  list: new ListSearchMissesUseCase(searchMissRepo),
  dismiss: new DismissSearchMissUseCase(searchMissRepo, auditRepo),
  update: new UpdateSearchMissUseCase(searchMissRepo, auditRepo),
  resolve: new ResolveSearchMissUseCase(
    searchMissRepo,
    wordRepo,
    languageRepo,
    auditRepo,
  ),
});

const languageController = new LanguageController({
  listLanguages: new ListLanguagesUseCase(languageRepo),
  listDialects: new ListDialectsUseCase(languageRepo),
});

const categoryController = new CategoryController({
  listCategories: new ListCategoriesUseCase(new CategoryRepositoryImpl(db)),
});

// ---- Modul vote (08-api-upvote-downvote.md) - upvote/downvote polymorphic
// pada word & children-nya. TANPA audit per vote (volume tinggi, bukan
// aksi admin - lihat KEPUTUSAN PRODUK di doc). ----
const voteRepo = new VoteRepositoryImpl(db);
const voteController = new VoteController({
  toggle: new ToggleVoteUseCase(voteRepo),
  counts: new GetVoteCountsUseCase(voteRepo),
  myVotes: new GetMyVotesUseCase(voteRepo),
});

// Panel moderasi vote (hapus vote spam + reset massal anti-brigading) -
// role root/admin/reviewer, audit trail best-effort di use case.
const adminVotesController = new AdminVotesController({
  list: new ListAdminVotesUseCase(voteRepo),
  deleteById: new DeleteAdminVoteUseCase(voteRepo, auditRepo),
  resetTarget: new ResetTargetVotesUseCase(voteRepo, auditRepo),
  topTargets: new GetTopTargetVotesUseCase(voteRepo),
});

// ---- Modul dashboard - statistik agregat halaman admin (kata, kontribusi,
// user, aktivitas). Repository membaca beberapa tabel sekaligus - dipisah
// dari modul lain supaya agregasi ringan tidak membebani repositori domain. ----
const dashboardController = new DashboardController({
  getStats: new GetDashboardStatsUseCase(new DashboardRepositoryImpl(db)),
});

// ---- Modul comment (09-api-comment.md) - komentar lemma, pre-moderation
// (approval gate Section 22). Bergantung ke WordRepository (cek kata ada)
// + VoteRepository (counts per komentar) lewat interface - preseden
// auditRepo lintas modul. ----
const commentRepo = new CommentRepositoryImpl(db);
const commentController = new CommentController({
  create: new CreateCommentUseCase(commentRepo, wordRepo, auditRepo),
  listByWord: new ListWordCommentsUseCase(commentRepo, voteRepo),
  delete: new DeleteCommentUseCase(commentRepo, auditRepo),
  listAdmin: new ListAdminCommentsUseCase(commentRepo),
  review: new ReviewCommentUseCase(commentRepo, auditRepo),
});

// ---- Modul bookmark (16-api-bookmark.md) - kata tersimpan per user,
// toggle idempotent. TANPA audit (preseden vote: baris user-state). ----
const bookmarkRepo = new BookmarkRepositoryImpl(db);
const bookmarkController = new BookmarkController({
  toggle: new ToggleBookmarkUseCase(bookmarkRepo),
  my: new GetMyBookmarksUseCase(bookmarkRepo),
});

const publicUserRepo = new PublicUserRepositoryImpl(db);
const userController = new UserController({
  getPublicProfile: new GetPublicProfileUseCase(publicUserRepo),
});

// ---- Modul device (FCM token register/revoke, multi-device) ----
const deviceController = new DeviceController({
  register: new RegisterDeviceTokenUseCase(deviceTokenRepo),
  revoke: new RevokeDeviceTokenUseCase(deviceTokenRepo),
});

// ---- Modul word-suggestions (usul perubahan kata) ----
const suggestionRepo = new WordSuggestionRepositoryImpl();
const suggestionController = new WordSuggestionController({
  repository: suggestionRepo,
  inbox: recordInbox,
});
const myContributionController = new MyContributionController({
  listMine: new ListMyContributionsUseCase(contributionRepo, suggestionRepo),
  getMine: new GetMyContributionDetailUseCase(contributionRepo, suggestionRepo),
});

// ---- HTTP app ----
export const app = createOpenApiApp();
app.onError(errorHandler);

// Route tidak ditemukan - HARUS envelope juga (api-base-stack.md Section 13).
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

// Info singkat di root - meta route (bukan endpoint fitur, jadi tidak ikut OpenAPI spec)
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

// Health check - dipakai orchestrator (Docker/K8s/Railway) untuk liveness
app.get('/health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'error', database: 'down', timestamp: new Date().toISOString() }, 503);
  }
});

// Canary CI/CD - dipakai memverifikasi deploy baru end-to-end:
// push → GitHub Actions → GET /api/v1/ping harus menunjukkan perubahan.
// `runtime` membuktikan entry mana yang melayani (dual-runtime).
// Terdaftar via createRoute agar muncul di OpenAPI spec + Scalar (Section 9)
// - beda dari / dan /health yang memang meta route di luar spec.
const pingRoute = createRoute({
  method: 'get',
  path: '/api/v1/ping',
  tags: ['Misc'],
  summary: 'Canary CI/CD - verifikasi deploy (tanpa auth, tanpa DB)',
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

// Modul word - admin (write) + publik (read)
app.route('/api/v1/admin/words', createAdminWordRoutes({ controller: wordController, authenticate }));
// Kontribusi media (pronounce/gambar/contoh) DI-MOUNT SEBELUM public routes -
// public punya rate limit IP 100/menit global (use '*'), limit per-user 30/menit
// tetap jadi batas efektif; urutan mount menentukan middleware yang berlaku
app.route('/api/v1/words', createWordMediaRoutes({ controller: wordController, authenticate }));
// Komentar per kata (09) - SEBELUM public word routes (pola media routes),
// supaya /:wordId/comments tidak tertelan routes.use('*') rate limit publik
app.route('/api/v1/words', createWordCommentRoutes({ controller: commentController, authenticate }));
app.route('/api/v1/words', createPublicWordRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/words', createWordHistoryRoutes({ controller: suggestionController, authenticate }));
app.route(
  '/api/v1/words',
  createWordSuggestionRoutes({ controller: suggestionController, authenticate }),
);
app.route(
  '/api/v1/admin',
  createAdminSuggestionRoutes({ controller: suggestionController, authenticate }),
);
app.route('/api/v1/meanings', createMeaningExampleRoutes({ controller: wordController, authenticate }));
app.route('/api/v1/word-classes', createWordClassRoutes({ controller: wordController }));

// Vote polymorphic (08-api-upvote-downvote.md) - toggle (login) + counts
// (publik) + my (login). Tanpa prefix bentrok, urutan mount bebas.
app.route('/api/v1/votes', createVoteRoutes({ controller: voteController, authenticate }));

// Komentar (09-api-comment.md): delete by id (publik-group) + antrean
// moderasi admin (pre-moderation, approval gate Section 22)
app.route('/api/v1/comments', createCommentRoutes({ controller: commentController, authenticate }));

// Bookmark kata per user (16-api-bookmark.md) - toggle + my (login, semua
// role). Tanpa prefix bentrok, urutan mount bebas.
app.route('/api/v1/bookmarks', createBookmarkRoutes({ controller: bookmarkController, authenticate }));

// Profil publik by username (19-api-profil-publik.md) - tanpa auth, rate
// limit 100/menit/IP di routes factory. Tidak bentrok /admin/users.
app.route('/api/v1/users', createPublicUserRoutes({ controller: userController }));
app.route('/api/v1/device', createDeviceRoutes({ controller: deviceController, authenticate }));
app.route(
  '/api/v1/notifications',
  createNotificationRoutes({
    controller: new NotificationController({
      list: new ListMyNotificationsUseCase(notificationRepo),
      unreadCount: new GetUnreadNotificationCountUseCase(notificationRepo),
      markRead: new MarkNotificationReadUseCase(notificationRepo),
      markAllRead: new MarkAllNotificationsReadUseCase(notificationRepo),
    }),
    authenticate,
  }),
);
app.route('/api/v1/admin/comments', createAdminCommentRoutes({ controller: commentController, authenticate }));

// Moderasi vote (hapus vote spam individual + reset massal per target),
// gate role + rate limit ada di routes factory (root/admin/reviewer)
app.route('/api/v1/admin/votes', createAdminVoteRoutes({ controller: adminVotesController, authenticate }));

// Antrean review kontribusi - hanya verifikator (Section 22)
app.route('/api/v1/admin/contributions', createContributionRoutes({ controller: contributionController, authenticate }));

// Submit kata TANPA login (publik, tanpa limit) - atribusi ke user sistem
// Anonim, otomatis pending_review (03-api-kontribusi-verifikasi.md)
app.route(
  '/api/v1/contributions',
  createAnonContributionRoutes({ controller: wordController, optionalAuthenticate }),
);
app.route(
  '/api/v1/contributions',
  createMyContributionRoutes({ controller: myContributionController, authenticate }),
);

// Search miss - beranda publik (peluang kontribusi) + panel admin
app.route('/api/v1/search-misses', createSearchMissRoutes({ controller: searchMissController, authenticate }));
app.route('/api/v1/admin/search-misses', createAdminSearchMissRoutes({ controller: searchMissController, authenticate }));

// Data referensi form admin
app.route('/api/v1/languages', createLanguageRoutes({ controller: languageController }));
app.route('/api/v1/dialects', createDialectRoutes({ controller: languageController }));
app.route('/api/v1/categories', createCategoryRoutes({ controller: categoryController }));

// Audit log - hanya admin & root (Section 21)
const auditController = new AuditController({ listAuditLogs: new ListAuditLogsUseCase(auditRepo) });
app.route('/api/v1/admin/audit-logs', createAuditRoutes({ controller: auditController, authenticate }));

// Image provider - wrapper ImageKit via ImageStoragePort (Section 8);
// imageStorage sudah di-instantiate di atas (dipakai wordController juga)
const imageController = new ImageController({
  createUploadCredentials: new CreateUploadCredentialsUseCase({
    imageStorage,
    defaultFolder: '/words',
  }),
});
app.route('/api/v1/admin/images/upload-token', createImageRoutes({ controller: imageController, authenticate }));

// Statistik dashboard - semua role yang login (dashboard = halaman pertama konsol)
app.route('/api/v1/admin/dashboard', createDashboardRoutes({ controller: dashboardController, authenticate }));

// ---- Admin users (Package A): list user + ubah role, hanya admin & root ----
const adminUsersController = new AdminUsersController({
  list: new ListAdminUsersUseCase(userRepo),
  updateRole: new UpdateUserRoleUseCase(userRepo, refreshTokenRepo, auditRepo),
});
app.route('/api/v1/admin/users', createAdminUserRoutes({ controller: adminUsersController, authenticate }));

const verifierApplicationRepo = new VerifierApplicationRepositoryImpl(db);
const verifierApplicationController = new VerifierApplicationController({
  create: new CreateVerifierApplicationUseCase(verifierApplicationRepo, userRepo),
  getMine: new GetMyVerifierApplicationUseCase(verifierApplicationRepo),
  resubmit: new ResubmitVerifierApplicationUseCase(verifierApplicationRepo, userRepo),
  list: new ListVerifierApplicationsUseCase(verifierApplicationRepo),
  getDetail: new GetVerifierApplicationDetailUseCase(verifierApplicationRepo),
  approve: new ApproveVerifierApplicationUseCase(
    verifierApplicationRepo,
    refreshTokenRepo,
    auditRepo,
    notifyUser,
  ),
  reject: new RejectVerifierApplicationUseCase(verifierApplicationRepo, auditRepo, notifyUser),
});
app.route(
  '/api/v1/verifier-applications',
  createVerifierApplicationRoutes({ controller: verifierApplicationController, authenticate }),
);
app.route(
  '/api/v1/admin/verifier-applications',
  createAdminVerifierApplicationRoutes({ controller: verifierApplicationController, authenticate }),
);

// Lookup definisi lemma (KBBI via port) - prefill field definition di form
// mobile/admin. Tidak menulis DB. docs/api/13-api-kbbi-lemma-definition.md
const lemmaDefinitionRegistry = createLemmaDefinitionProviderRegistry();
const lemmaDefinitionController = new LemmaDefinitionController({
  lookup: new LookupLemmaDefinitionUseCase(
    lemmaDefinitionRegistry,
    env.LEMMA_DEFINITION_CACHE_TTL_SECONDS,
  ),
});
app.route(
  '/api/v1/lemma-definitions',
  createLemmaDefinitionRoutes({ controller: lemmaDefinitionController, authenticate }),
);

// Latar kartu share — proxy Unsplash (docs/backlogs/SHARE.md). Publik.
// Latar kartu share — multi-provider (docs/backlogs/SHARE.md). Publik.
const shareBackgroundProviders = createShareBackgroundProviderRegistry();
const shareController = new ShareController({
  listBackgrounds: new ListShareBackgroundsUseCase(
    shareBackgroundProviders,
    env.SHARE_BACKGROUNDS_CACHE_TTL_SECONDS,
  ),
  listProviders: () => listShareBackgroundProviderInfos(shareBackgroundProviders),
});
app.route('/api/v1/share', createShareRoutes({ controller: shareController }));

// OpenAPI spec + Scalar docs (api-base-stack.md Section 9)
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Kamus Digital Sambas-Indonesia API',
    version: '1.0.0',
  },
});
app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }));
