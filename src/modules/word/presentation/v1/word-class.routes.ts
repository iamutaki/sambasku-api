import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { wordClassListResponseSchema } from './validators/create-word.validator';
import type { WordController } from './word.controller';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

// GET /api/v1/word-classes — dropdown kelas kata (hierarki parent_id)
export function createWordClassRoutes(deps: { controller: WordController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 })); // publik baca (Section 15)

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Words'],
    summary: 'Daftar kelas kata untuk dropdown (termasuk hierarki parent)',
    responses: {
      200: { description: 'Daftar kelas kata', content: json(wordClassListResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.wordClasses(c) as never);
  return routes;
}
