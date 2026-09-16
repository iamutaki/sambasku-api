import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import { okNullResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { SearchMissController } from './search-miss.controller';
import {
  adminSearchMissQuerySchema,
  publicSearchMissQuerySchema,
  searchMissListResponseSchema,
} from './validators/search-miss.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface SearchMissRoutesDeps {
  controller: SearchMissController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// GET /api/v1/search-misses — beranda publik: "sedang dicari, belum ada
// artinya" → peluang kontribusi (03-api-kontribusi-verifikasi.md)
export function createSearchMissRoutes(deps: SearchMissRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Search Misses'],
    summary: 'Pencarian kosong terpopuler — peluang kontribusi untuk beranda',
    request: { query: publicSearchMissQuerySchema },
    responses: {
      200: { description: 'Daftar miss belum terjawab (paling dicari)', content: json(searchMissListResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listPublic(c, c.req.valid('query')) as never);

  return routes;
}

// Panel admin: GET /api/v1/admin/search-misses + POST /:id/dismiss
export function createAdminSearchMissRoutes(deps: SearchMissRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '*',
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 500, duration: 60 }),
  );

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Search Misses', 'Admin'],
    summary: 'Panel admin: semua pencarian kosong + status terjawab (cursor pagination)',
    request: { query: adminSearchMissQuerySchema },
    responses: {
      200: { description: 'Daftar miss', content: json(searchMissListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  const dismissRoute = createRoute({
    method: 'post',
    path: '/:id/dismiss',
    tags: ['Search Misses', 'Admin'],
    summary: 'Singkirkan miss dari panel/beranda (spam / tidak layak) — soft delete',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Miss disembunyikan', content: { 'application/json': { schema: okNullResponseSchema } } },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Miss tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listAdmin(c, c.req.valid('query')) as never);
  routes.openapi(dismissRoute, (c) => deps.controller.dismiss(c, c.req.param('id')) as never);

  return routes;
}
