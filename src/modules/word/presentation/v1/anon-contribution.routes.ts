import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Context } from 'hono';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
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

// 06-api-x-device-id.md - key bucket per-device. Header self-asserted:
// cukup opaque 8-64 karakter, TIDAK divalidasi format (memvalidasi
// bentuk = memberi bot cetakan yang harus dipenuhi). Absen/invalid →
// null → bucket device dilewati (bucket IP tetap berlaku).
export function xDeviceKey(c: Context): string | null {
  const raw = c.req.header('x-device-id')?.trim() ?? '';
  return raw.length >= 8 && raw.length <= 64 ? `anon-dev:${raw}` : null;
}

// POST /api/v1/contributions/words - submit kata TANPA LOGIN
// (03-api-kontribusi-verifikasi.md). Atribusi ke user sistem Anonim,
// otomatis pending_review. Tier "publik tulis" Section 15, dual-bucket
// (06-api-x-device-id.md): 5/jam per X-Device-Id (fairness - manusia
// di balik CGNAT punya bucket sendiri) + 20/jam per IP (langit-langit
// bot yang mengacak device id dari satu IP).
export function createAnonContributionRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/words', rateLimit({ points: 20, duration: 3600 }));
  routes.use(
    '/words',
    rateLimit({
      points: 5,
      duration: 3600,
      // fallback tak pernah terpakai: skipIf sudah mencegat null
      keyFn: (c) => xDeviceKey(c) ?? 'anon-dev:__skipped__',
      skipIf: (c) => xDeviceKey(c) === null,
    }),
  );

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
      429: {
        description: 'Terlalu banyak submit: 5/jam per X-Device-Id atau 20/jam per IP',
        content: json(errorResponseSchema),
      },
    },
  });

  routes.openapi(submitRoute, (c) => deps.controller.createAnon(c, c.req.valid('json')) as never);

  return routes;
}
