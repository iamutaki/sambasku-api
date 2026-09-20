import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { WordController } from './word.controller';
import {
  createWordBodySchema,
  createWordResponseSchema,
  variantRootRefine,
} from './validators/create-word.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AnonContributionRoutesDeps {
  controller: WordController;
  /** Auth opsional: Bearer valid → atribusi ke user login; tanpa token → anonim */
  optionalAuthenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Body = create-word TANPA field status (dipaksa 'published' =
// kirim untuk direview; draft tidak bermakna di endpoint ini).
// Aturan variasi root (≠ lemma) diterapkan setelah .omit karena refine
// memutus .omit (11-api-variasi-penulisan.md).
const anonWordSchema = createWordBodySchema
  .omit({ status: true })
  .superRefine(variantRootRefine);

// POST /api/v1/contributions/words
// - Tanpa auth → user sistem Anonim (03-api-kontribusi-verifikasi.md)
// - Dengan Bearer → user login (bugfix: mobile kirim token tapi dulu
//   diabaikan karena createAnon hardcode ANONIM_USER_ID)
export function createAnonContributionRoutes(deps: AnonContributionRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/words', deps.optionalAuthenticate);

  const submitRoute = createRoute({
    method: 'post',
    path: '/words',
    tags: ['Contributions'],
    summary:
      'Submit kata (publik). Tanpa login → anonim; dengan Bearer → atribusi user login',
    request: {
      body: { content: json(anonWordSchema) },
    },
    responses: {
      201: {
        description: 'Kontribusi tersimpan (selalu pending_review untuk non-verifier)',
        content: json(createWordResponseSchema),
      },
      400: {
        description: 'Body tidak valid / referensi id tidak ditemukan',
        content: json(errorResponseSchema),
      },
      401: {
        description: 'Bearer ada tapi invalid/expired',
        content: json(errorResponseSchema),
      },
    },
  });

  routes.openapi(submitRoute, (c) => deps.controller.createAnon(c, c.req.valid('json')) as never);

  return routes;
}
