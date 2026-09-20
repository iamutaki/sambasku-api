import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { DeviceController } from './device.controller';
import {
  deviceTokenMutationResponseSchema,
  registerDeviceTokenSchema,
  revokeDeviceTokenSchema,
} from './validators/device.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface DeviceRoutesDeps {
  controller: DeviceController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Device FCM tokens - register/revoke. Mount di /api/v1/device.
export function createDeviceRoutes(deps: DeviceRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '/register',
    deps.authenticate,
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `device-register:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );
  routes.use(
    '/revoke',
    deps.authenticate,
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `device-revoke:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );

  const registerRoute = createRoute({
    method: 'post',
    path: '/register',
    tags: ['Device'],
    summary: 'Daftarkan / update FCM token perangkat (login)',
    request: {
      body: { content: json(registerDeviceTokenSchema) },
    },
    responses: {
      200: { description: 'Token tersimpan', content: json(deviceTokenMutationResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak request', content: json(errorResponseSchema) },
    },
  });

  const revokeRoute = createRoute({
    method: 'patch',
    path: '/revoke',
    tags: ['Device'],
    summary: 'Detach FCM token perangkat ini (logout)',
    request: {
      body: { content: json(revokeDeviceTokenSchema) },
    },
    responses: {
      200: { description: 'Revoke dicoba (idempotent)', content: json(deviceTokenMutationResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak request', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(registerRoute, (c) => deps.controller.register(c, c.req.valid('json')) as never);
  routes.openapi(revokeRoute, (c) => deps.controller.revoke(c, c.req.valid('json')) as never);

  return routes;
}
