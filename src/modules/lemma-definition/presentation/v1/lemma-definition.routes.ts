import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { LemmaDefinitionController } from './lemma-definition.controller';
import {
  lookupLemmaDefinitionQuerySchema,
  lookupLemmaDefinitionResponseSchema,
} from './validators/lookup-lemma-definition.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createLemmaDefinitionRoutes(deps: {
  controller: LemmaDefinitionController;
}) {
  const routes = createOpenApiApp();

  // Publik (tanpa auth) supaya form kontribusi web anonim bisa prefill
  // definisi KBBI. Lookup mahal (outbound pihak ketiga) - rate limit
  // 20/menit per IP cukup ketat untuk guard abuse (kontrak 13).
  routes.use(
    '/lookup',
    rateLimit({
      points: 20,
      duration: 60,
      keyFn: (c) => `lemma-def:${c.req.header('cf-connecting-ip') ?? 'unknown'}`,
    }),
  );

  const lookupRoute = createRoute({
    method: 'get',
    path: '/lookup',
    tags: ['Lemma Definitions'],
    summary: 'Lookup definisi lemma dari KBBI (publik - prefill form makna/kontribusi)',
    description:
      'Memanggil penyedia KBBI pihak ketiga, lalu memetakan ke bentuk standar ' +
      '(entries + suggestions). Query opsional `provider` (whitelist, mis. raf555) ' +
      'meng-override default env KBBI_PROVIDER. Tidak menulis ke database. ' +
      'Lookup miss = 200 + found:false.',
    request: { query: lookupLemmaDefinitionQuerySchema },
    responses: {
      200: {
        description: 'Hasil lookup (found true/false)',
        content: json(lookupLemmaDefinitionResponseSchema),
      },
      400: { description: 'Query lemma/provider tidak valid', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
      502: { description: 'Provider KBBI gagal', content: json(errorResponseSchema) },
      503: { description: 'Provider belum dikonfigurasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(lookupRoute, (c) => {
    const { lemma, provider } = c.req.valid('query');
    return deps.controller.lookup(c, lemma, provider) as never;
  });

  return routes;
}
