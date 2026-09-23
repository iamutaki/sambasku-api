import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { BugReportController } from './bug-report.controller';
import {
  bugReportIdParamSchema,
  bugReportItemResponseSchema,
  bugReportListResponseSchema,
  listBugReportsQuerySchema,
  resolveBugReportBodySchema,
} from './validators/bug-report.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminBugReportRoutesDeps {
  controller: BugReportController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminBugReportRoutes(deps: AdminBugReportRoutesDeps) {
  const routes = createOpenApiApp();

  const admin = [
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 500, duration: 60 }),
  ] as const;

  routes.use('/', ...admin);
  routes.use('/:id/resolve', ...admin);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Bug Reports', 'Admin'],
    summary: 'Antrean laporan masalah (admin/root, cursor)',
    request: { query: listBugReportsQuerySchema },
    responses: {
      200: { description: 'Daftar laporan', content: json(bugReportListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
    },
  });

  const resolveRoute = createRoute({
    method: 'post',
    path: '/:id/resolve',
    tags: ['Bug Reports', 'Admin'],
    summary: 'Selesaikan atau tolak laporan (terminal)',
    request: {
      params: bugReportIdParamSchema,
      body: { content: json(resolveBugReportBodySchema) },
    },
    responses: {
      200: { description: 'Laporan diperbarui', content: json(bugReportItemResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
      404: { description: 'Laporan tidak ditemukan / sudah selesai', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(
    resolveRoute,
    (c) => deps.controller.resolve(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );

  return routes;
}
