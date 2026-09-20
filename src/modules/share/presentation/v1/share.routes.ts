import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { ShareController } from './share.controller';
import {
  listShareBackgroundsQuerySchema,
  listShareBackgroundsResponseSchema,
} from './validators/share-backgrounds.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

/** GET /api/v1/share/backgrounds?q= — proxy Unsplash untuk kartu share. */
export function createShareRoutes(deps: { controller: ShareController }) {
  const routes = createOpenApiApp();
  // Publik baca; lebih ketat dari categories karena outbound Unsplash.
  routes.use('*', rateLimit({ points: 30, duration: 60 }));

  const backgroundsRoute = createRoute({
    method: 'get',
    path: '/backgrounds',
    tags: ['Share'],
    summary: 'Cari foto latar Unsplash untuk kartu share kosakata',
    description:
      'Proxy Unsplash Search Photos. Kunci API tidak pernah ke client. ' +
      'Query sebaiknya padanan + kategori (bukan lemma Sambas). ' +
      'Tanpa konfigurasi / gagal upstream → data.items kosong (bukan 5xx) ' +
      'supaya mobile bisa fallback ke template tanpa foto.',
    request: { query: listShareBackgroundsQuerySchema },
    responses: {
      200: {
        description: 'Daftar kandidat foto (boleh kosong)',
        content: json(listShareBackgroundsResponseSchema),
      },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(backgroundsRoute, (c) => {
    const { q } = c.req.valid('query');
    return deps.controller.backgrounds(c, q) as never;
  });

  return routes;
}
