import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { WordController } from './word.controller';
import { createWordBodySchema, createWordResponseSchema } from './validators/create-word.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface WordRoutesDeps {
  controller: WordController;
}

// Body anonim = create-word TANPA field status (dipaksa 'published' =
// kirim untuk direview; draft milik anonim tidak bermakna)
const anonWordSchema = createWordBodySchema.omit({ status: true });

// POST /api/v1/contributions/words - submit kata TANPA LOGIN
// (03-api-kontribusi-verifikasi.md). Atribusi ke user sistem Anonim,
// otomatis pending_review. TANPA rate limit (keputusan 2026-09-18,
// Section 15: limit hanya endpoint auth - dinding sesungguhnya ada di
// approval gate pending_review).
export function createAnonContributionRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  const submitRoute = createRoute({
    method: 'post',
    path: '/words',
    tags: ['Contributions'],
    summary: 'Submit kata oleh pengunjung anonim (tanpa login) - masuk antrean review',
    request: {
      body: { content: json(anonWordSchema) },
    },
    responses: {
      201: {
        description: 'Kontribusi anonim tersimpan (selalu pending_review)',
        content: json(createWordResponseSchema),
      },
      400: { description: 'Body tidak valid / referensi id tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(submitRoute, (c) => deps.controller.createAnon(c, c.req.valid('json')) as never);

  return routes;
}
