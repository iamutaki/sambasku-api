import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { VerifierApplicationController } from './verifier-application.controller';
import {
  myVerifierApplicationResponseSchema,
  submitVerifierApplicationSchema,
} from './validators/verifier-application.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface VerifierApplicationRoutesDeps {
  controller: VerifierApplicationController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

const writeLimit = (action: string) =>
  rateLimit({
    points: 30,
    duration: 60,
    keyFn: (c) => {
      const user = (c.get('user') as AuthUser | undefined) ?? null;
      return `verifier-application-${action}:${user?.user_id ?? 'unknown'}`;
    },
  });

export function createVerifierApplicationRoutes(deps: VerifierApplicationRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/', deps.authenticate, writeLimit('create'));
  routes.use('/me', deps.authenticate, writeLimit('me'));

  const createRouteDef = createRoute({
    method: 'post',
    path: '/',
    tags: ['Verifier Applications'],
    summary: 'Ajukan jadi verifikator (contributor, 30/menit)',
    request: { body: { content: json(submitVerifierApplicationSchema) } },
    responses: {
      201: { description: 'Pengajuan tersimpan (pending)', content: json(myVerifierApplicationResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan contributor', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada pengajuan / HP dipakai user lain', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (30/menit)', content: json(errorResponseSchema) },
    },
  });

  const meRoute = createRoute({
    method: 'get',
    path: '/me',
    tags: ['Verifier Applications'],
    summary: 'Pengajuan milik user login',
    responses: {
      200: { description: 'Pengajuan milik sendiri', content: json(myVerifierApplicationResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Belum pernah mengajukan', content: json(errorResponseSchema) },
    },
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/me',
    tags: ['Verifier Applications'],
    summary: 'Perbaiki pengajuan yang ditolak (contributor, 30/menit)',
    request: { body: { content: json(submitVerifierApplicationSchema) } },
    responses: {
      200: { description: 'Pengajuan dikirim ulang (pending)', content: json(myVerifierApplicationResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan contributor', content: json(errorResponseSchema) },
      404: { description: 'Belum pernah mengajukan', content: json(errorResponseSchema) },
      409: { description: 'Status bukan rejected / HP dipakai user lain', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak percobaan (30/menit)', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(createRouteDef, (c) => deps.controller.create(c, c.req.valid('json')) as never);
  routes.openapi(meRoute, (c) => deps.controller.me(c) as never);
  routes.openapi(patchRoute, (c) => deps.controller.resubmit(c, c.req.valid('json')) as never);

  return routes;
}
