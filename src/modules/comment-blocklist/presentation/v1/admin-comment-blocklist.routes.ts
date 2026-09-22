import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { CommentBlocklistController } from './comment-blocklist.controller';
import {
  createBlocklistResponseSchema,
  createBlocklistWordBodySchema,
  listBlocklistQuerySchema,
  listBlocklistResponseSchema,
} from './validators/comment-blocklist.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminCommentBlocklistRoutesDeps {
  controller: CommentBlocklistController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminCommentBlocklistRoutes(deps: AdminCommentBlocklistRoutesDeps) {
  const routes = createOpenApiApp();

  const admin = [
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 500, duration: 60 }),
  ] as const;

  routes.use('/', ...admin);
  routes.use('/:id', ...admin);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Comment Blocklist', 'Admin'],
    summary: 'List kata blocklist aktif',
    request: { query: listBlocklistQuerySchema },
    responses: {
      200: { description: 'Daftar kata', content: json(listBlocklistResponseSchema) },
      401: { description: 'Unauthorized', content: json(errorResponseSchema) },
      403: { description: 'Forbidden', content: json(errorResponseSchema) },
    },
  });

  const createRouteDef = createRoute({
    method: 'post',
    path: '/',
    tags: ['Comment Blocklist', 'Admin'],
    summary: 'Tambah kata ke blocklist',
    request: { body: { content: json(createBlocklistWordBodySchema), required: true } },
    responses: {
      201: { description: 'Kata ditambahkan', content: json(createBlocklistResponseSchema) },
      401: { description: 'Unauthorized', content: json(errorResponseSchema) },
      403: { description: 'Forbidden', content: json(errorResponseSchema) },
      409: { description: 'Duplikat', content: json(errorResponseSchema) },
    },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Comment Blocklist', 'Admin'],
    summary: 'Hapus (soft) kata blocklist',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: {
        description: 'Terhapus',
        content: json(z.object({ success: z.literal(true), data: z.null() })),
      },
      401: { description: 'Unauthorized', content: json(errorResponseSchema) },
      403: { description: 'Forbidden', content: json(errorResponseSchema) },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(createRouteDef, (c) =>
    deps.controller.create(c, c.req.valid('json')) as never,
  );
  routes.openapi(deleteRoute, (c) => deps.controller.delete(c, c.req.param('id')) as never);

  return routes;
}
