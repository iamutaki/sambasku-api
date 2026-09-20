import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordSuggestionController } from './word-suggestions.controller';
import {
  createSuggestionSchema,
  createSuggestionResponseSchema,
  suggestionListResponseSchema,
  suggestionDetailResponseSchema,
  approveSuggestionBodySchema,
  approveResponseSchema,
  rejectSuggestionBodySchema,
  rejectResponseSchema,
  changeHistoryResponseSchema,
  adminListSuggestionsQuerySchema,
} from './validators/suggestion.validator';

const json = <T extends z.ZodType>(schema: T) => ({ 'application/json': { schema } });

export interface WordSuggestionRoutesDeps {
  controller: WordSuggestionController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// PUBLIK: riwayat perubahan kata
export function createWordHistoryRoutes(deps: WordSuggestionRoutesDeps) {
  const routes = createOpenApiApp();

  const changeHistoryRoute = createRoute({
    method: 'get',
    path: '/:id/change-history',
    tags: ['Words', 'Suggestions'],
    summary: 'Riwayat perubahan kata - timeline semua edit (langsung & dari suggestion)',
    request: {
      params: z.object({ id: z.string().length(26) }),
      query: z.object({
        limit: z.coerce.number().min(1).max(100).default(20),
        cursor: z.string().length(26).optional(),
      }),
    },
    responses: {
      200: { description: 'Daftar riwayat perubahan', content: json(changeHistoryResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(changeHistoryRoute, ((c: any) => {
    const { id } = c.req.param();
    const q = c.req.valid('query');
    return deps.controller.getChangeHistory(c, id, q.limit, q.cursor);
  }) as never);

  return routes;
}

// AUTENTIKASI: user buat usulan perubahan
export function createWordSuggestionRoutes(deps: WordSuggestionRoutesDeps) {
  const routes = createOpenApiApp();

  // Path harus sama dengan route. `use('/')` di Hono hanya match `/`,
  // bukan `/:id/suggest-edit` — auth terlewat, user_id jadi '' lalu FK gagal.
  routes.use(
    '/:id/suggest-edit',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'contributor', 'root', 'reviewer'),
    rateLimit({
      points: 10,
      duration: 3600,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `suggestion:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  );

  const createSuggestionRoute = createRoute({
    method: 'post',
    path: '/:id/suggest-edit',
    tags: ['Words', 'Suggestions'],
    summary: 'Usulkan perubahan pada kata yang tayang',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(createSuggestionSchema) },
    },
    responses: {
      201: { description: 'Usulan berhasil dibuat', content: json(createSuggestionResponseSchema) },
      400: { description: 'Bad request / invalid changes', content: json(errorResponseSchema) },
      401: { description: 'Token tidak valid', content: json(errorResponseSchema) },
      403: { description: 'Tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(createSuggestionRoute, ((c: any) => {
    const { id: wordId } = c.req.param();
    const body = c.req.valid('json');
    const user = c.get('user') as AuthUser;
    return deps.controller.createSuggestion(c, body, user.user_id, wordId);
  }) as never);

  return routes;
}

// ADMIN: antrean review usulan
export function createAdminSuggestionRoutes(deps: WordSuggestionRoutesDeps) {
  const routes = createOpenApiApp();

  const adminGuard = [
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `admin-suggestion:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  ] as const;
  // Sama seperti contribution.routes: setiap path didaftarkan eksplisit.
  // `use('/')` tidak melindungi `/word-suggestions` atau subpath-nya.
  routes.use('/word-suggestions', ...adminGuard);
  routes.use('/word-suggestions/:id', ...adminGuard);
  routes.use('/word-suggestions/:id/approve', ...adminGuard);
  routes.use('/word-suggestions/:id/reject', ...adminGuard);
  routes.use('/word-suggestions/:id/correct', ...adminGuard);

  const listRoute = createRoute({
    method: 'get',
    path: '/word-suggestions',
    tags: ['Admin', 'Suggestions'],
    summary: 'List usulan perubahan kata (admin)',
    request: { query: adminListSuggestionsQuerySchema },
    responses: {
      200: { description: 'Daftar usulan (cursor)', content: json(suggestionListResponseSchema) },
      401: { description: 'Token tidak valid', content: json(errorResponseSchema) },
      403: { description: 'Tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, ((c: any) => {
    const q = c.req.valid('query');
    return deps.controller.listSuggestions(c, q.limit, q.cursor, q.status);
  }) as never);

  const detailRoute = createRoute({
    method: 'get',
    path: '/word-suggestions/:id',
    tags: ['Admin', 'Suggestions'],
    summary: 'Detail usulan + diff (current vs proposed)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Detail usulan', content: json(suggestionDetailResponseSchema) },
      404: { description: 'Usulan tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(detailRoute, ((c: any) => {
    const { id } = c.req.param();
    return deps.controller.getSuggestionDetail(c, id);
  }) as never);

  const approveRoute = createRoute({
    method: 'post',
    path: '/word-suggestions/:id/approve',
    tags: ['Admin', 'Suggestions'],
    summary: 'Setujui usulan dan terapkan perubahan ke kata',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(approveSuggestionBodySchema) },
    },
    responses: {
      200: { description: 'Usulan disetujui + perubahan diterapkan', content: json(approveResponseSchema) },
      404: { description: 'Usulan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Usulan sudah diverifikasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(approveRoute, ((c: any) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');
    const user = c.get('user') as AuthUser;
    return deps.controller.approveSuggestion(c, id, user.user_id, body.comment);
  }) as never);

  const rejectRoute = createRoute({
    method: 'post',
    path: '/word-suggestions/:id/reject',
    tags: ['Admin', 'Suggestions'],
    summary: 'Tolak usulan dengan alasan',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(rejectSuggestionBodySchema) },
    },
    responses: {
      200: { description: 'Usulan ditolak', content: json(rejectResponseSchema) },
      400: { description: 'Alasan wajib diisi', content: json(errorResponseSchema) },
      404: { description: 'Usulan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Usulan sudah diverifikasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(rejectRoute, ((c: any) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');
    const user = c.get('user') as AuthUser;
    return deps.controller.rejectSuggestion(c, id, user.user_id, body.comment);
  }) as never);

  const correctRoute = createRoute({
    method: 'post',
    path: '/word-suggestions/:id/correct',
    tags: ['Admin', 'Suggestions'],
    summary: 'Koreksi usulan sebelum menyetujui',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: {
        content: json(
          z.object({
            entity_type: z.literal('word_suggestion'),
            publish: z.boolean().default(true),
            corrected_changes: createSuggestionSchema.shape.proposed_changes,
            comment: z.string().max(500).optional(),
          }),
        ),
      },
    },
    responses: {
      200: {
        description: 'Koreksi diterapkan',
        content: json(
          z.object({
            success: z.literal(true),
            data: z.object({
              suggestion_id: z.string(),
              status: z.string(),
              applied: z.boolean(),
              changes_applied: z.number(),
              word_lemma: z.string(),
              message: z.string(),
            }),
          }),
        ),
      },
    },
  });

  routes.openapi(correctRoute, ((c: any) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');
    const user = c.get('user') as AuthUser;
    return deps.controller.correctSuggestion(
      c,
      id,
      user.user_id,
      body.corrected_changes,
      body.publish,
      body.comment,
    );
  }) as never);

  return routes;
}
