import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { ContributionController } from './contribution.controller';
import {
  approveContributionSchema,
  contributionDetailResponseSchema,
  correctContributionSchema,
  listContributionsQuerySchema,
  listContributionsResponseSchema,
  rejectContributionSchema,
  reviewDecisionResponseSchema,
} from './validators/contribution.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface ContributionRoutesDeps {
  controller: ContributionController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Antrean review — HANYA verifikator: admin, root, reviewer (Section 22).
// Tier admin Section 15: 500 request/60 detik.
export function createContributionRoutes(deps: ContributionRoutesDeps) {
  const routes = createOpenApiApp();

  const reviewer = [deps.authenticate, authorizeRole('admin', 'root', 'reviewer'), rateLimit({ points: 500, duration: 60 })] as const;

  routes.use('/', ...reviewer);
  routes.use('/:id', ...reviewer);
  routes.use('/:id/approve', ...reviewer);
  routes.use('/:id/reject', ...reviewer);
  routes.use('/:id/correct', ...reviewer);

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Contributions', 'Admin'],
    summary: 'Antrean review kontribusi (filter status/entity_type) — cursor pagination',
    request: { query: listContributionsQuerySchema },
    responses: {
      200: { description: 'Daftar kontribusi', content: json(listContributionsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator (admin/root/reviewer)', content: json(errorResponseSchema) },
    },
  });

  const detailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Contributions', 'Admin'],
    summary: 'Detail kontribusi + payload entity utuh untuk layar review',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Detail kontribusi', content: json(contributionDetailResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kontribusi tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const approveRoute = createRoute({
    method: 'post',
    path: '/:id/approve',
    tags: ['Contributions', 'Admin'],
    summary: 'Setujui kontribusi — entity published + is_verified true',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(approveContributionSchema) },
    },
    responses: {
      200: { description: 'Kontribusi disetujui', content: json(reviewDecisionResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kontribusi tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan review', content: json(errorResponseSchema) },
    },
  });

  const rejectRoute = createRoute({
    method: 'post',
    path: '/:id/reject',
    tags: ['Contributions', 'Admin'],
    summary: 'Tolak kontribusi — comment (alasan) WAJIB, entity rejected',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(rejectContributionSchema) },
    },
    responses: {
      200: { description: 'Kontribusi ditolak', content: json(reviewDecisionResponseSchema) },
      400: { description: 'comment wajib diisi', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kontribusi tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan review', content: json(errorResponseSchema) },
    },
  });

  const correctRoute = createRoute({
    method: 'post',
    path: '/:id/correct',
    tags: ['Contributions', 'Admin'],
    summary: 'Koreksi kontribusi oleh verifikator — is_corrected true, lalu published',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(correctContributionSchema) },
    },
    responses: {
      200: { description: 'Kontribusi dikoreksi & dipublikasikan', content: json(reviewDecisionResponseSchema) },
      400: { description: 'entity_type tidak cocok / body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kontribusi tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Sudah ada keputusan review', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(detailRoute, (c) => deps.controller.detail(c, c.req.param('id')) as never);
  routes.openapi(approveRoute, (c) => deps.controller.approve(c, c.req.param('id'), c.req.valid('json')) as never);
  routes.openapi(rejectRoute, (c) => deps.controller.reject(c, c.req.param('id'), c.req.valid('json')) as never);
  routes.openapi(correctRoute, (c) => deps.controller.correct(c, c.req.param('id'), c.req.valid('json')) as never);

  return routes;
}
