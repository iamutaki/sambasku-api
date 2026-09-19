import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { AdminUsersController } from './admin-user.controller';
import {
  adminUsersListResponseSchema,
  listAdminUsersQuerySchema,
  updateUserRoleBodySchema,
  updateUserRoleResponseSchema,
} from './validators/admin-users.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface AdminUserRoutesDeps {
  controller: AdminUsersController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// GET/PATCH /api/v1/admin/users - hanya role admin & root
export function createAdminUserRoutes(deps: AdminUserRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '*',
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 120, duration: 60 }), // NFR-5: 120 req/menit
  );

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Users'],
    summary: 'Daftar user dengan cursor pagination (admin & root)',
    request: { query: listAdminUsersQuerySchema },
    responses: {
      200: { description: 'Daftar user + meta', content: json(adminUsersListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan (hanya admin/root)', content: json(errorResponseSchema) },
    },
  });

  const updateRoleRoute = createRoute({
    method: 'patch',
    path: '/:id/role',
    tags: ['Admin Users'],
    summary: 'Ubah role user target + logout semua perangkat target (admin & root)',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(updateUserRoleBodySchema) },
    },
    responses: {
      200: { description: 'Role berhasil diubah', content: json(updateUserRoleResponseSchema) },
      400: { description: 'Role tidak valid / user tidak ditemukan', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: {
        description: 'Target adalah root / ubah role sendiri (CANNOT_CHANGE_ROOT/CANNOT_CHANGE_SELF_ROLE)',
        content: json(errorResponseSchema),
      },
      404: { description: 'User target tidak ada', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(updateRoleRoute, (c) =>
    deps.controller.updateRole(
      c,
      c.req.valid('param').id,
      c.req.valid('json'),
    ) as never,
  );

  return routes;
}
