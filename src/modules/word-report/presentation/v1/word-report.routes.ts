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
  createWordReportBodySchema,
  createWordReportResponseSchema,
  wordIdParamSchema,
} from './validators/word-report.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface WordReportRoutesDeps {
  controller: WordReportController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createWordReportRoutes(deps: WordReportRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '/:id/reports',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'contributor', 'root', 'reviewer'),
    rateLimit({
      points: 10,
      duration: 3600,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-report:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );

  const createRouteDef = createRoute({
    method: 'post',
    path: '/:id/reports',
    tags: ['Words', 'Word Reports'],
    summary: 'Laporkan entri yang tayang (login). Kata tetap tayang sampai verifikator bertindak.',
    request: {
      params: wordIdParamSchema,
      body: { content: json(createWordReportBodySchema) },
    },
    responses: {
      201: { description: 'Laporan tersimpan', content: json(createWordReportResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Bukan published atau laporan masih terbuka', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(createRouteDef, (c) =>
    deps.controller.create(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );

  return routes;
}
