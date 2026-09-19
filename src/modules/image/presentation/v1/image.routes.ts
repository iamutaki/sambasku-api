import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { ImageController } from './image.controller';
import {
  uploadCredentialsQuerySchema,
  uploadCredentialsResponseSchema,
} from './validators/image.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

// GET /api/v1/admin/images/upload-token - tanda tangan untuk direct upload
// dari client ke ImageKit (backend tidak pernah melewati byte gambar)
export function createImageRoutes(deps: {
  controller: ImageController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    // Mirror role media-kontribusi (03): contributor ke atas boleh
    // ambil token; root/reviewer ikut supaya konsol & mobile tidak 403.
    authorizeRole('admin', 'editor', 'contributor', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );

  const uploadTokenRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Images'],
    summary: 'Kredensial direct-upload ke provider gambar (client upload sendiri ke CDN)',
    request: { query: uploadCredentialsQuerySchema },
    responses: {
      200: { description: 'Token + signature upload', content: json(uploadCredentialsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      503: { description: 'Provider gambar belum dikonfigurasi', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(
    uploadTokenRoute,
    (c) => deps.controller.uploadCredentials(c, c.req.valid('query').folder) as never,
  );
  return routes;
}
