import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { ShareController } from './share.controller';
import {
  listShareBackgroundProvidersResponseSchema,
  listShareBackgroundsQuerySchema,
  listShareBackgroundsResponseSchema,
} from './validators/share-backgrounds.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

/** GET /api/v1/share/backgrounds — proxy latar multi-provider. */
export function createShareRoutes(deps: { controller: ShareController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 30, duration: 60 }));

  const backgroundsRoute = createRoute({
    method: 'get',
    path: '/backgrounds',
    tags: ['Share'],
    summary: 'Cari foto atau video latar untuk kartu share',
    description:
      'Default `provider=pexels`, `media=photo`. `sort=relevant` butuh `q`. ' +
      '`sort=popular` untuk Media Explorer (q opsional). ' +
      '`limit` 1–30 (default 3). `media=video` untuk `pexels`, `pixabay`, `wikimedia`. ' +
      'Tanpa konfigurasi / gagal upstream → items kosong + degraded:true.',
    request: { query: listShareBackgroundsQuerySchema },
    responses: {
      200: {
        description: 'Daftar kandidat latar (boleh kosong)',
        content: json(listShareBackgroundsResponseSchema),
      },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  const providersRoute = createRoute({
    method: 'get',
    path: '/background-providers',
    tags: ['Share'],
    summary: 'Daftar provider latar yang didukung',
    responses: {
      200: {
        description: 'Daftar provider',
        content: json(listShareBackgroundProvidersResponseSchema),
      },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(backgroundsRoute, (c) => {
    const { q, page, sort, provider, limit, media, orientation } = c.req.valid('query');
    return deps.controller.backgrounds(
      c,
      q,
      page,
      sort,
      provider,
      limit,
      media,
      orientation,
    ) as never;
  });

  routes.openapi(providersRoute, (c) => deps.controller.providers(c) as never);

  return routes;
}
