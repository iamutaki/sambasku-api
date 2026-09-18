import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { CommentController } from './comment.controller';
import {
  adminListCommentsResponseSchema,
  listAdminCommentsQuerySchema,
  reviewCommentResponseSchema,
} from './validators/comment.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminCommentRoutesDeps {
  controller: CommentController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Antrean moderasi komentar (09-api-comment.md) - HANYA verifikator:
// admin, root, reviewer (pola antrean contribution 03). Tier admin
// Section 15: 500 request/menit.
export function createAdminCommentRoutes(deps: AdminCommentRoutesDeps) {
  const routes = createOpenApiApp();

  const reviewer = [
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({ points: 500, duration: 60 }),
  ] as const;

  routes.use('/', ...reviewer);
  routes.use('/:id/approve', ...reviewer);
  routes.use('/:id/reject', ...reviewer);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Comments', 'Admin'],
    summary: 'Antrean moderasi komentar (filter status, default pending_review) - cursor pagination',
    request: { query: listAdminCommentsQuerySchema },
    responses: {
      200: { description: 'Daftar komentar + username + info moderasi', content: json(adminListCommentsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator (admin/root/reviewer)', content: json(errorResponseSchema) },
    },
  });

  const approveRoute = createRoute({
    method: 'post',
    path: '/:id/approve',
    tags: ['Comments', 'Admin'],
    summary: 'Setujui komentar - satu-satunya jalur ke published (tampil publik)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Komentar dipublikasikan', content: json(reviewCommentResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Komentar tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan moderasi', content: json(errorResponseSchema) },
    },
  });

  const rejectRoute = createRoute({
    method: 'post',
    path: '/:id/reject',
    tags: ['Comments', 'Admin'],
    summary: 'Tolak komentar - rejected (terminal, tanpa kolom alasan)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Komentar ditolak', content: json(reviewCommentResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Komentar tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan moderasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listAdmin(c, c.req.valid('query')) as never);
  routes.openapi(approveRoute, (c) => deps.controller.review(c, c.req.param('id'), 'approve') as never);
  routes.openapi(rejectRoute, (c) => deps.controller.review(c, c.req.param('id'), 'reject') as never);

  return routes;
}
