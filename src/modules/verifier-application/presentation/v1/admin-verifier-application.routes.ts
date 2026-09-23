import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { VerifierApplicationController } from './verifier-application.controller';
import {
  adminListVerifierApplicationsResponseSchema,
  adminVerifierApplicationDetailResponseSchema,
  approveVerifierApplicationResponseSchema,
  listVerifierApplicationsQuerySchema,
  rejectVerifierApplicationResponseSchema,
  rejectVerifierApplicationSchema,
  verifierApplicationIdParamSchema,
} from './validators/verifier-application.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminVerifierApplicationRoutesDeps {
  controller: VerifierApplicationController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminVerifierApplicationRoutes(deps: AdminVerifierApplicationRoutesDeps) {
  const routes = createOpenApiApp();

  const admin = [
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 500, duration: 60 }),
  ] as const;

  routes.use('/', ...admin);
  routes.use('/:id', ...admin);
  routes.use('/:id/approve', ...admin);
  routes.use('/:id/reject', ...admin);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Verifier Applications', 'Admin'],
    summary: 'Antrean pengajuan verifikator (admin/root, cursor)',
    request: { query: listVerifierApplicationsQuerySchema },
    responses: {
      200: { description: 'Daftar pengajuan', content: json(adminListVerifierApplicationsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
    },
  });

  const detailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Verifier Applications', 'Admin'],
    summary: 'Detail pengajuan verifikator (termasuk alamat dan sosial)',
    request: { params: verifierApplicationIdParamSchema },
    responses: {
      200: { description: 'Detail pengajuan', content: json(adminVerifierApplicationDetailResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
      404: { description: 'Pengajuan tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const approveRoute = createRoute({
    method: 'post',
    path: '/:id/approve',
    tags: ['Verifier Applications', 'Admin'],
    summary: 'Setujui: role pemohon menjadi reviewer + FCM',
    request: { params: verifierApplicationIdParamSchema },
    responses: {
      200: { description: 'Disetujui, role reviewer', content: json(approveVerifierApplicationResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
      404: { description: 'Pengajuan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan', content: json(errorResponseSchema) },
    },
  });

  const rejectRoute = createRoute({
    method: 'post',
    path: '/:id/reject',
    tags: ['Verifier Applications', 'Admin'],
    summary: 'Tolak pengajuan (comment wajib) + FCM',
    request: {
      params: verifierApplicationIdParamSchema,
      body: { content: json(rejectVerifierApplicationSchema) },
    },
    responses: {
      200: { description: 'Ditolak', content: json(rejectVerifierApplicationResponseSchema) },
      400: { description: 'comment wajib', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan admin/root', content: json(errorResponseSchema) },
      404: { description: 'Pengajuan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(detailRoute, (c) => deps.controller.detail(c, c.req.param('id')) as never);
  routes.openapi(approveRoute, (c) => deps.controller.approve(c, c.req.param('id')) as never);
  routes.openapi(rejectRoute, (c) =>
    deps.controller.reject(c, c.req.param('id'), c.req.valid('json')) as never,
  );

  return routes;
}
