import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { MyContributionController } from './my-contribution.controller';
import {
  listMyContributionsQuerySchema,
  listMyContributionsResponseSchema,
  myContributionDetailParamsSchema,
  myContributionDetailResponseSchema,
} from './validators/contribution.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface MyContributionRoutesDeps {
  controller: MyContributionController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

/** GET /api/v1/contributions/my - milik user login (bukan antrean admin). */
export function createMyContributionRoutes(deps: MyContributionRoutesDeps) {
  const routes = createOpenApiApp();

  const readLimit = [
    deps.authenticate,
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `my-contributions:${user?.user_id ?? 'unknown'}`;
      },
    }),
  ] as const;

  routes.use('/my', ...readLimit);
  routes.use('/my/:kind/:id', ...readLimit);

  const listRoute = createRoute({
    method: 'get',
    path: '/my',
    tags: ['Contributions'],
    summary: 'Daftar kontribusi + usulan perubahan milik user login',
    request: { query: listMyContributionsQuerySchema },
    responses: {
      200: { description: 'Daftar milik pemohon', content: json(listMyContributionsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const detailRoute = createRoute({
    method: 'get',
    path: '/my/:kind/:id',
    tags: ['Contributions'],
    summary: 'Detail satu usulan milik user login',
    request: { params: myContributionDetailParamsSchema },
    responses: {
      200: { description: 'Detail milik pemohon', content: json(myContributionDetailResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Tidak ditemukan atau bukan milik pemohon', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(detailRoute, (c) => {
    const { kind, id } = c.req.valid('param');
    return deps.controller.detail(c, kind, id) as never;
  });

  return routes;
}
