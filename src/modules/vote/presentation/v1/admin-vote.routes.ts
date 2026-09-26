import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { AdminVotesController } from './admin-vote.controller';
import {
  deleteAdminVoteParamsSchema,
  deleteAdminVoteResponseSchema,
  listAdminVotesQuerySchema,
  listAdminVotesResponseSchema,
  resetByClientVotesBodySchema,
  resetByClientVotesResponseSchema,
  resetTargetVotesBodySchema,
  resetTargetVotesResponseSchema,
  topVoteTargetsQuerySchema,
  topVoteTargetsResponseSchema,
} from './validators/admin-votes.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminVoteRoutesDeps {
  controller: AdminVotesController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Semua endpoint /api/v1/admin/votes - hanya role root/admin/reviewer
export function createAdminVoteRoutes(deps: AdminVoteRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '*',
    deps.authenticate,
    authorizeRole('root', 'admin', 'reviewer'),
    rateLimit({ points: 120, duration: 60 }), // 120 req/menit per user
  );

  // 1. GET /api/v1/admin/votes - List cursor paginated
  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Votes'],
    summary: 'Daftar vote dengan cursor pagination (root/admin/reviewer)',
    request: { query: listAdminVotesQuerySchema },
    responses: {
      200: { description: 'Daftar vote + meta cursor', content: json(listAdminVotesResponseSchema) },
      400: { description: 'Query params tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan (hanya root/admin/reviewer)', content: json(errorResponseSchema) },
    },
  });

  // 2. DELETE /api/v1/admin/votes/:id - Hapus vote individual
  const deleteRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Admin Votes'],
    summary: 'Hapus satu vote individual by id (root/admin/reviewer)',
    request: { params: deleteAdminVoteParamsSchema },
    responses: {
      200: { description: 'Vote berhasil dihapus', content: json(deleteAdminVoteResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Vote tidak ditemukan (VOTE_NOT_FOUND)', content: json(errorResponseSchema) },
    },
  });

  // 3. DELETE /api/v1/admin/votes/reset-target - Reset SEMUA vote target (brigading)
  const resetTargetRoute = createRoute({
    method: 'delete',
    path: '/reset-target',
    tags: ['Admin Votes'],
    summary: 'Reset SEMUA vote untuk target tertentu (anti-brigading massal)',
    request: { body: { content: json(resetTargetVotesBodySchema) } },
    responses: {
      200: { description: 'Reset target sukses, return jumlah vote yang dihapus', content: json(resetTargetVotesResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  // 3b. DELETE /api/v1/admin/votes/reset-by-client - Reset vote dari satu client_id
  const resetByClientRoute = createRoute({
    method: 'delete',
    path: '/reset-by-client',
    tags: ['Admin Votes'],
    summary: 'Reset SEMUA vote dari client_id third-party (revoke atribusi)',
    request: { body: { content: json(resetByClientVotesBodySchema) } },
    responses: {
      200: {
        description: 'Reset by client sukses',
        content: json(resetByClientVotesResponseSchema),
      },
      400: { description: 'Body tidak valid / first-party dilindungi', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  // 4. GET /api/v1/admin/votes/top-targets - Top target terurut skor net desc
  const topTargetsRoute = createRoute({
    method: 'get',
    path: '/top-targets',
    tags: ['Admin Votes'],
    summary: 'Top targets terurut skor bersih (net = upvotes-downvotes) desc',
    request: { query: topVoteTargetsQuerySchema },
    responses: {
      200: { description: 'Daftar top targets per type', content: json(topVoteTargetsResponseSchema) },
      400: { description: 'Query params tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  // Route statis (reset-target, top-targets) HARUS diregistrasi sebelum
  // route param /:id - Hono match berdasarkan urutan registrasi, kalau
  // kebalik "reset-target" akan tertangkap validator :id (26 char ULID).
  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(resetTargetRoute, (c) =>
    deps.controller.resetTarget(c, c.req.valid('json')) as never,
  );
  routes.openapi(resetByClientRoute, (c) =>
    deps.controller.resetByClient(c, c.req.valid('json')) as never,
  );
  routes.openapi(topTargetsRoute, (c) =>
    deps.controller.topTargets(c, c.req.valid('query')) as never,
  );
  routes.openapi(deleteRoute, (c) =>
    deps.controller.deleteById(c, c.req.valid('param')) as never,
  );

  return routes;
}
