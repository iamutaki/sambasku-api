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
  takedownCommentResponseSchema,
  uncensorCommentResponseSchema,
} from './validators/comment.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminCommentRoutesDeps {
  controller: CommentController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminCommentRoutes(deps: AdminCommentRoutesDeps) {
  const routes = createOpenApiApp();

  const reviewer = [
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({ points: 500, duration: 60 }),
  ] as const;

  routes.use('/', ...reviewer);
  routes.use('/:id/takedown', ...reviewer);
  routes.use('/:id/uncensor', ...reviewer);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Comments', 'Admin'],
    summary: 'List komentar admin (filter status + word_id) - cursor pagination',
    request: { query: listAdminCommentsQuerySchema },
    responses: {
      200: { description: 'Daftar komentar + username + info moderasi', content: json(adminListCommentsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator (admin/root/reviewer)', content: json(errorResponseSchema) },
    },
  });

  const takedownRoute = createRoute({
    method: 'post',
    path: '/:id/takedown',
    tags: ['Comments', 'Admin'],
    summary: 'Takedown komentar published → taken_down',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Komentar di-takedown', content: json(takedownCommentResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Komentar tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah di-takedown / bukan published', content: json(errorResponseSchema) },
    },
  });

  const uncensorRoute = createRoute({
    method: 'post',
    path: '/:id/uncensor',
    tags: ['Comments', 'Admin'],
    summary: 'Pulihkan teks asli yang disensor blocklist',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Teks asli dipulihkan', content: json(uncensorCommentResponseSchema) },
      400: { description: 'Tidak ada teks tersensor', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Komentar tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listAdmin(c, c.req.valid('query')) as never);
  routes.openapi(takedownRoute, (c) => deps.controller.takedown(c, c.req.param('id')) as never);
  routes.openapi(uncensorRoute, (c) => deps.controller.uncensor(c, c.req.param('id')) as never);

  return routes;
}
