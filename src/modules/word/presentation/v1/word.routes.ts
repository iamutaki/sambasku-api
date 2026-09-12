import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordController } from './word.controller';
import {
  createWordResponseSchema,
  createWordSchema,
  searchWordsQuerySchema,
  wordDetailResponseSchema,
  wordListResponseSchema,
} from './validators/create-word.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface WordRoutesDeps {
  controller: WordController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// POST /api/v1/admin/words — authenticate + authorizeRole + rate limit 30/menit
export function createAdminWordRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'contributor'),
    rateLimit({
      points: 30,
      duration: 60,
      // per user_id (Section 15) — authenticate sudah jalan lebih dulu
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-create:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  );

  const createWordRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Words', 'Admin'],
    summary: 'Tambah kata baru lengkap dengan makna/terjemahan/contoh (transaksional)',
    request: { body: { content: json(createWordSchema) } },
    responses: {
      201: { description: 'Kata tersimpan (status per role)', content: json(createWordResponseSchema) },
      400: { description: 'Body tidak valid / referensi id tidak ditemukan', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(createWordRoute, (c) => deps.controller.create(c, c.req.valid('json')) as never);

  return routes;
}

// GET /api/v1/words/:id + /search — publik, rate limit 100/menit per IP
export function createPublicWordRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  const wordDetailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Words'],
    summary: 'Detail kata published (halaman publik)',
    request: {
      params: z.object({ id: z.string().length(26) }),
    },
    responses: {
      200: { description: 'Detail kata', content: json(wordDetailResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const searchWordsRoute = createRoute({
    method: 'get',
    path: '/search',
    tags: ['Words'],
    summary: 'Cari kata (dropdown sinonim/antonim form admin) — list + meta pagination',
    request: { query: searchWordsQuerySchema },
    responses: {
      200: { description: 'Hasil pencarian', content: json(wordListResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(searchWordsRoute, (c) => deps.controller.search(c, c.req.valid('query')) as never);
  routes.openapi(wordDetailRoute, (c) => deps.controller.detail(c, c.req.param('id')) as never);

  return routes;
}
