import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { UserController } from './user.controller';
import {
  avatarUploadResponseSchema,
  publicActivityResponseSchema,
  publicProfileParamsSchema,
  publicProfileResponseSchema,
} from './validators/public-profile.validator';
import {
  myProfileResponseSchema,
  updateMyProfileSchema,
} from './validators/update-my-profile.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export function createPublicUserRoutes(deps: { controller: UserController }) {
  const routes = createOpenApiApp();
  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  const activityRoute = createRoute({
    method: 'get',
    path: '/:username/activity',
    tags: ['Users'],
    summary: 'Aktivitas publik terbaru by username (tanpa auth)',
    request: { params: publicProfileParamsSchema },
    responses: {
      200: { description: 'Daftar aktivitas', content: json(publicActivityResponseSchema) },
      400: { description: 'Username tidak valid', content: json(errorResponseSchema) },
      404: { description: 'User tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const profileRoute = createRoute({
    method: 'get',
    path: '/:username',
    tags: ['Users'],
    summary: 'Profil publik by username (tanpa auth, tanpa PII)',
    request: { params: publicProfileParamsSchema },
    responses: {
      200: { description: 'Profil publik', content: json(publicProfileResponseSchema) },
      400: { description: 'Username tidak valid', content: json(errorResponseSchema) },
      404: { description: 'User tidak ditemukan / nonaktif / terhapus', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(activityRoute, (c) =>
    deps.controller.publicActivity(c, c.req.valid('param').username) as never,
  );
  routes.openapi(profileRoute, (c) =>
    deps.controller.publicProfile(c, c.req.valid('param').username) as never,
  );

  return routes;
}

/** GET/PATCH /api/v1/users/me - edit display_name + bio. Mount sebelum /:username. */
export function createMeProfileRoutes(deps: {
  controller: UserController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    rateLimit({ points: 20, duration: 60, keyFn: (c) => `me-profile:${c.get('user')?.user_id}` }),
  );

  const getRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Users'],
    summary: 'Profil sendiri (prefill editor)',
    responses: {
      200: { description: 'Profil sendiri', content: json(myProfileResponseSchema) },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
    },
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/',
    tags: ['Users'],
    summary: 'Edit display_name dan/atau bio',
    request: { body: { content: json(updateMyProfileSchema) } },
    responses: {
      200: { description: 'Profil diperbarui', content: json(myProfileResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(getRoute, (c) => deps.controller.getMyProfile(c) as never);
  routes.openapi(patchRoute, (c) =>
    deps.controller.updateMyProfile(c, c.req.valid('json')) as never,
  );

  return routes;
}

export function createMeAvatarRoutes(deps: {
  controller: UserController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    rateLimit({ points: 20, duration: 60 }),
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
    tags: ['Users'],
    summary: 'Upload / ganti avatar (multipart field `file`)',
    responses: {
      200: { description: 'Avatar tersimpan', content: json(avatarUploadResponseSchema) },
      400: { description: 'File tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
      503: { description: 'Storage belum dikonfigurasi', content: json(errorResponseSchema) },
    },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/',
    tags: ['Users'],
    summary: 'Hapus avatar',
    responses: {
      204: { description: 'Avatar dihapus' },
      401: { description: 'Token tidak ada', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(uploadRoute, (c) => deps.controller.uploadAvatar(c) as never);
  routes.openapi(deleteRoute, (c) => deps.controller.deleteAvatar(c) as never);

  return routes;
}
