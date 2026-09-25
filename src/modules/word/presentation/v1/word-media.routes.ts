import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordController } from './word.controller';
import {
  addExampleResponseSchema,
  addExampleSchema,
  addMeaningResponseSchema,
  addMeaningSchema,
  addPronunciationResponseSchema,
  addPronunciationSchema,
  addWordImageResponseSchema,
  addWordImageSchema,
  wordAudioResponseSchema,
} from './validators/word-media.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface WordMediaRoutesDeps {
  controller: WordController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Middleware tulis-data Section 15: authenticate + role + 30/menit per user_id
function mediaMiddleware(deps: WordMediaRoutesDeps, ...roles: string[]) {
  return [
    deps.authenticate,
    authorizeRole(...roles),
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-media:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  ];
}

// POST /api/v1/words/:wordId/pronunciations + /:wordId/images -
// kontribusi media pada kata existing (03-api-kontribusi-verifikasi.md)
export function createWordMediaRoutes(deps: WordMediaRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/:wordId/pronunciations', ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'));
  routes.use(
    '/:wordId/pronunciations/audio',
    ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'),
  );
  routes.use(
    '/:wordId/pronunciations/audio/*',
    ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'),
  );
  routes.use('/:wordId/images', ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'));
  // 17-api-usul-definisi.md - kontribusi definisi pada kata existing
  routes.use('/:wordId/meanings', ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'));

  const addPronunciationRoute = createRoute({
    method: 'post',
    path: '/:wordId/pronunciations',
    tags: ['Words'],
    summary: 'Kontribusi pelafalan pada kata existing (contributor → antrean review)',
    request: {
      params: z.object({ wordId: z.string().length(26) }),
      body: { content: json(addPronunciationSchema) },
    },
    responses: {
      201: { description: 'Pelafalan tersimpan (status per role)', content: json(addPronunciationResponseSchema) },
      400: { description: 'Body tidak valid / duplikat', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const uploadAudioRoute = createRoute({
    method: 'post',
    path: '/:wordId/pronunciations/audio',
    tags: ['Words'],
    summary: 'Upload file audio pelafalan (multipart) - multi-take; opsional example_id',
    request: {
      params: z.object({ wordId: z.string().length(26) }),
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              audio: z.any().openapi({ type: 'string', format: 'binary' }),
              dialect_id: z.string().length(26).optional(),
              example_id: z.string().length(26).optional(),
              speaker_name: z.string().max(255).optional(),
              duration_ms: z.coerce.number().int().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Audio tersimpan', content: json(wordAudioResponseSchema) },
      400: { description: 'File/MIME tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata/contoh/dialek tidak ditemukan', content: json(errorResponseSchema) },
      503: { description: 'Storage belum dikonfigurasi', content: json(errorResponseSchema) },
    },
  });

  const deleteAudioRoute = createRoute({
    method: 'delete',
    path: '/:wordId/pronunciations/audio/{audioId}',
    tags: ['Words'],
    summary: 'Soft-delete audio pelafalan (admin/editor/root)',
    request: {
      params: z.object({
        wordId: z.string().length(26),
        audioId: z.string().length(26),
      }),
    },
    responses: {
      204: { description: 'Audio dihapus' },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata/audio tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const addWordImageRoute = createRoute({
    method: 'post',
    path: '/:wordId/images',
    tags: ['Words'],
    summary: 'Kontribusi gambar contoh pada kata existing (hasil direct-upload)',
    request: {
      params: z.object({ wordId: z.string().length(26) }),
      body: { content: json(addWordImageSchema) },
    },
    responses: {
      201: { description: 'Gambar tersimpan (status per role)', content: json(addWordImageResponseSchema) },
      400: { description: 'Body tidak valid / file sudah dipakai', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const addMeaningRoute = createRoute({
    method: 'post',
    path: '/:wordId/meanings',
    tags: ['Words'],
    summary: 'Kontribusi definisi (makna) pada kata existing (contributor → antrean review)',
    request: {
      params: z.object({ wordId: z.string().length(26) }),
      body: { content: json(addMeaningSchema) },
    },
    responses: {
      201: { description: 'Makna tersimpan (status per role)', content: json(addMeaningResponseSchema) },
      400: { description: 'Body tidak valid / duplikat', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(addPronunciationRoute, (c) =>
    deps.controller.addPronunciation(c, c.req.param('wordId'), c.req.valid('json')) as never,
  );

  // bodyLimit hanya di route upload (±6 MB) - jangan global
  routes.use(
    '/:wordId/pronunciations/audio',
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            success: false as const,
            error_code: 'AUDIO_TOO_LARGE',
            message: 'File audio terlalu besar (maks 5 MB)',
          },
          400,
        ),
    }),
  );

  routes.openapi(uploadAudioRoute, (c) =>
    deps.controller.uploadPronunciationAudio(c, c.req.param('wordId')) as never,
  );
  routes.openapi(deleteAudioRoute, (c) =>
    deps.controller.deletePronunciationAudio(
      c,
      c.req.param('wordId'),
      c.req.param('audioId'),
    ) as never,
  );
  routes.openapi(addWordImageRoute, (c) =>
    deps.controller.addWordImage(c, c.req.param('wordId'), c.req.valid('json')) as never,
  );
  routes.openapi(addMeaningRoute, (c) =>
    deps.controller.addMeaning(c, c.req.param('wordId'), c.req.valid('json')) as never,
  );

  return routes;
}

// POST /api/v1/meanings/:meaningId/examples - kontribusi contoh kalimat
export function createMeaningExampleRoutes(deps: WordMediaRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/:meaningId/examples', ...mediaMiddleware(deps, 'admin', 'editor', 'contributor', 'root', 'reviewer'));

  const addExampleRoute = createRoute({
    method: 'post',
    path: '/:meaningId/examples',
    tags: ['Words'],
    summary: 'Kontribusi contoh kalimat (sample) pada makna existing',
    request: {
      params: z.object({ meaningId: z.string().length(26) }),
      body: { content: json(addExampleSchema) },
    },
    responses: {
      201: { description: 'Contoh kalimat tersimpan (status per role)', content: json(addExampleResponseSchema) },
      400: { description: 'Body tidak valid / bahasa tidak ditemukan', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Makna tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(addExampleRoute, (c) =>
    deps.controller.addExample(c, c.req.param('meaningId'), c.req.valid('json')) as never,
  );

  return routes;
}
