import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { UserController } from './user.controller';
import {
  publicProfileParamsSchema,
  publicProfileResponseSchema,
} from './validators/public-profile.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createPublicUserRoutes(deps: { controller: UserController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  const profileRoute = createRoute({
    method: 'get',
    path: '/:username',
    tags: ['Users'],
    summary: 'Profil publik by username (tanpa auth, tanpa PII)',
    request: { params: publicProfileParamsSchema },
    responses: {
      200: { description: 'Profil publik', content: json(publicProfileResponseSchema) },
      400: { description: 'Username tidak valid', content: json(errorResponseSchema) },
      404: { description: 'User tidak ditemukan / nonaktif / terhapus', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(profileRoute, (c) =>
    deps.controller.publicProfile(c, c.req.valid('param').username) as never,
  );

  return routes;
}
