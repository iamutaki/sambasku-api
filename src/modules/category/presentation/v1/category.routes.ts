import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import type { CategoryController } from './category.controller';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

const categoryListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      parent_id: z.string().nullable(),
      name: z.string(),
      description: z.string().nullable(),
    }),
  ),
});

// GET /api/v1/categories — multi-select kategori form admin
export function createCategoryRoutes(deps: { controller: CategoryController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 })); // publik baca (Section 15)

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Categories'],
    summary: 'Daftar kategori/glosarium (multi-select form admin)',
    responses: {
      200: { description: 'Daftar kategori', content: json(categoryListResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.categories(c) as never);
  return routes;
}
