import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { NotificationController } from './notification.controller';
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  markAllReadResponseSchema,
  markReadResponseSchema,
  notificationIdParamsSchema,
  unreadCountResponseSchema,
} from './validators/notification.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface NotificationRoutesDeps {
  controller: NotificationController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createNotificationRoutes(deps: NotificationRoutesDeps) {
  const routes = createOpenApiApp();

  const readLimit = [
    deps.authenticate,
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `notifications:${user?.user_id ?? 'unknown'}`;
      },
    }),
  ] as const;

  routes.use('/', ...readLimit);
  routes.use('/unread-count', ...readLimit);
  routes.use('/read-all', ...readLimit);
  routes.use('/:id/read', ...readLimit);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Notifications'],
    summary: 'Daftar notifikasi inbox milik user login',
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: { description: 'Daftar inbox', content: json(listNotificationsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const unreadRoute = createRoute({
    method: 'get',
    path: '/unread-count',
    tags: ['Notifications'],
    summary: 'Jumlah notifikasi belum dibaca milik user login',
    responses: {
      200: { description: 'Unread count', content: json(unreadCountResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const markAllRoute = createRoute({
    method: 'post',
    path: '/read-all',
    tags: ['Notifications'],
    summary: 'Tandai semua notifikasi milik user sebagai dibaca',
    responses: {
      200: { description: 'Jumlah baris yang diubah', content: json(markAllReadResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const markOneRoute = createRoute({
    method: 'post',
    path: '/:id/read',
    tags: ['Notifications'],
    summary: 'Tandai satu notifikasi sebagai dibaca (idempotent)',
    request: { params: notificationIdParamsSchema },
    responses: {
      200: { description: 'Status baca', content: json(markReadResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Bukan milik pemohon atau tidak ada', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(unreadRoute, (c) => deps.controller.unreadCount(c) as never);
  routes.openapi(markAllRoute, (c) => deps.controller.markAllRead(c) as never);
  routes.openapi(markOneRoute, (c) => {
    const { id } = c.req.valid('param');
    return deps.controller.markRead(c, id) as never;
  });

  return routes;
}
