import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { PublicImageController } from './public-image.controller';
import {
  uploadPublicImageQuerySchema,
  uploadPublicImageResponseSchema,
} from './validators/public-image.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createPublicImageRoutes(deps: {
  controller: PublicImageController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'contributor', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );

  routes.use(
    '/',
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            success: false as const,
            error_code: 'IMAGE_TOO_LARGE',
            message: 'File gambar terlalu besar (maks 5 MB)',
          },
          400,
        ),
    }),
  );

  const uploadRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Images'],
    summary: 'Upload gambar kata ke penyimpanan publik (GitHub) - multipart field `file`',
    request: { query: uploadPublicImageQuerySchema },
    responses: {
      201: { description: 'Gambar tersimpan', content: json(uploadPublicImageResponseSchema) },
      400: { description: 'File/MIME tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      503: { description: 'Storage belum dikonfigurasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(uploadRoute, (c) => deps.controller.upload(c) as never);

  return routes;
}
