import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { DashboardController } from './dashboard.controller';
import { dashboardStatsResponseSchema } from './validators/dashboard.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createDashboardRoutes(deps: {
  controller: DashboardController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();
  routes.use('*', deps.authenticate, rateLimit({ points: 300, duration: 60 }));

  const statsRoute = createRoute({
    method: 'get',
    path: '/stats',
    tags: ['Dashboard'],
    summary: 'Statistik agregat dashboard (kata, kontribusi, pengguna, aktivitas)',
    responses: {
      200: { description: 'Statistik dashboard', content: json(dashboardStatsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(statsRoute, (c) => deps.controller.stats(c) as never);
  return routes;
}
