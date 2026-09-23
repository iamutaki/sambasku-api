import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordReportController } from './word-report.controller';
import {
  listWordReportsQuerySchema,
  resolveWordReportBodySchema,
  takedownWordBodySchema,
  wordReportIdParamSchema,
  wordReportItemResponseSchema,
  wordReportListResponseSchema,
} from './validators/word-report.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminWordReportRoutesDeps {
  controller: WordReportController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminWordReportRoutes(deps: AdminWordReportRoutesDeps) {
  const routes = createOpenApiApp();

  const admin = [
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `admin-word-report:${user?.user_id ?? 'unknown'}`;
      },
    }),
  ] as const;

  routes.use('/', ...admin);
  routes.use('/:id', ...admin);
  routes.use('/:id/dismiss', ...admin);
  routes.use('/:id/mark-corrected', ...admin);
  routes.use('/:id/takedown', ...admin);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Word Reports', 'Admin'],
    summary: 'Antrean laporan entri',
    request: { query: listWordReportsQuerySchema },
    responses: {
      200: { description: 'Daftar laporan', content: json(wordReportListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Word Reports', 'Admin'],
    summary: 'Detail satu laporan entri',
    request: { params: wordReportIdParamSchema },
    responses: {
      200: { description: 'Laporan', content: json(wordReportItemResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Laporan tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const dismissRoute = createRoute({
    method: 'post',
    path: '/:id/dismiss',
    tags: ['Word Reports', 'Admin'],
    summary: 'Tolak laporan. Kata tetap tayang.',
    request: {
      params: wordReportIdParamSchema,
      body: { content: json(resolveWordReportBodySchema) },
    },
    responses: {
      200: { description: 'Laporan ditutup', content: json(wordReportItemResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Laporan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Laporan sudah ditutup', content: json(errorResponseSchema) },
    },
  });

  const correctedRoute = createRoute({
    method: 'post',
    path: '/:id/mark-corrected',
    tags: ['Word Reports', 'Admin'],
    summary: 'Tandai laporan selesai karena entri sudah diperbaiki. Kata tetap tayang.',
    request: {
      params: wordReportIdParamSchema,
      body: { content: json(resolveWordReportBodySchema) },
    },
    responses: {
      200: { description: 'Laporan ditutup', content: json(wordReportItemResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Laporan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Laporan sudah ditutup', content: json(errorResponseSchema) },
    },
  });

  const takedownRoute = createRoute({
    method: 'post',
    path: '/:id/takedown',
    tags: ['Word Reports', 'Admin'],
    summary: 'Tarik entri dan tutup semua laporan terbuka pada kata itu',
    request: {
      params: wordReportIdParamSchema,
      body: { content: json(takedownWordBodySchema) },
    },
    responses: {
      200: { description: 'Entri ditarik', content: json(wordReportItemResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Laporan atau kata tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Laporan sudah ditutup atau kata bukan published', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(getRoute, (c) => deps.controller.get(c, c.req.valid('param').id) as never);
  routes.openapi(
    dismissRoute,
    (c) => deps.controller.dismiss(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );
  routes.openapi(
    correctedRoute,
    (c) => deps.controller.markCorrected(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );
  routes.openapi(
    takedownRoute,
    (c) => deps.controller.takedown(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );

  return routes;
}
