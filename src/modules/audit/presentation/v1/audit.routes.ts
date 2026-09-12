import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { AuditController } from './audit.controller';
import {
  auditLogListResponseSchema,
  listAuditLogsQuerySchema,
} from './validators/audit-log.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

// GET /api/v1/admin/audit-logs — HANYA admin & root (Section 21)
export function createAuditRoutes(deps: {
  controller: AuditController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 500, duration: 60 }), // kategori admin (Section 15)
  );

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Audit'],
    summary: 'Jejak audit mutasi data (auditor: admin & root)',
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: { description: 'Daftar audit log + meta', content: json(auditLogListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan (hanya admin/root)', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  return routes;
}
