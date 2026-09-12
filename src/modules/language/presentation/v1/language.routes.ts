import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import type { LanguageController } from './language.controller';
import {
  dialectListResponseSchema,
  errorSchema,
  languageListResponseSchema,
  listDialectsQuerySchema,
  listLanguagesQuerySchema,
} from './validators/language.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createLanguageRoutes(deps: { controller: LanguageController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 })); // publik baca (Section 15)

  const listLanguagesRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Languages'],
    summary: 'Daftar bahasa (dropdown form admin)',
    request: { query: listLanguagesQuerySchema },
    responses: {
      200: { description: 'Daftar bahasa', content: json(languageListResponseSchema) },
    },
  });

  routes.openapi(
    listLanguagesRoute,
    (c) => deps.controller.languages(c, c.req.valid('query').is_active) as never,
  );
  return routes;
}

// Dialek di-mount terpisah: GET /api/v1/dialects?language_id=…
export function createDialectRoutes(deps: { controller: LanguageController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  const listDialectsRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Languages'],
    summary: 'Daftar dialek per bahasa (dropdown form admin)',
    request: { query: listDialectsQuerySchema },
    responses: {
      200: { description: 'Daftar dialek', content: json(dialectListResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorSchema) },
    },
  });

  routes.openapi(
    listDialectsRoute,
    (c) => deps.controller.dialects(c, c.req.valid('query').language_id) as never,
  );
  return routes;
}
