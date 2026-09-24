import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import type { NotificationCampaignController } from './notification-campaign.controller';
import {
  campaignDetailResponseSchema,
  campaignIdParamsSchema,
  campaignResponseSchema,
  createCampaignBodySchema,
  createTemplateBodySchema,
  estimateAudienceBodySchema,
  estimateAudienceResponseSchema,
  listCampaignsQuerySchema,
  listCampaignsResponseSchema,
  listTemplatesQuerySchema,
  listTemplatesResponseSchema,
  templateIdParamsSchema,
  templateResponseSchema,
  updateTemplateBodySchema,
} from './validators/campaign.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface NotificationCampaignRoutesDeps {
  controller: NotificationCampaignController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createAdminNotificationTemplateRoutes(deps: NotificationCampaignRoutesDeps) {
  const routes = createOpenApiApp();
  routes.use(
    '*',
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 60, duration: 60 }),
  );

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Notification Templates'],
    summary: 'Daftar template notifikasi campaign',
    request: { query: listTemplatesQuerySchema },
    responses: {
      200: { description: 'Daftar template', content: json(listTemplatesResponseSchema) },
      401: { description: 'Unauthorized', content: json(errorResponseSchema) },
      403: { description: 'Forbidden', content: json(errorResponseSchema) },
    },
  });

  const createRouteDef = createRoute({
    method: 'post',
    path: '/',
    tags: ['Admin Notification Templates'],
    summary: 'Buat template notifikasi',
    request: { body: { content: json(createTemplateBodySchema) } },
    responses: {
      201: { description: 'Template dibuat', content: json(templateResponseSchema) },
      400: { description: 'Validasi gagal', content: json(errorResponseSchema) },
    },
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Admin Notification Templates'],
    summary: 'Detail template',
    request: { params: templateIdParamsSchema },
    responses: {
      200: { description: 'Detail', content: json(templateResponseSchema) },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const updateRoute = createRoute({
    method: 'patch',
    path: '/:id',
    tags: ['Admin Notification Templates'],
    summary: 'Ubah template',
    request: {
      params: templateIdParamsSchema,
      body: { content: json(updateTemplateBodySchema) },
    },
    responses: {
      200: { description: 'Diperbarui', content: json(templateResponseSchema) },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Admin Notification Templates'],
    summary: 'Hapus (soft) template',
    request: { params: templateIdParamsSchema },
    responses: {
      200: {
        description: 'Dihapus',
        content: json(z.object({ success: z.literal(true), data: z.null() })),
      },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listTemplates(c, c.req.valid('query')) as never);
  routes.openapi(createRouteDef, (c) =>
    deps.controller.createTemplate(c, c.req.valid('json')) as never,
  );
  routes.openapi(getRoute, (c) =>
    deps.controller.getTemplate(c, c.req.valid('param').id) as never,
  );
  routes.openapi(updateRoute, (c) =>
    deps.controller.updateTemplate(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );
  routes.openapi(deleteRoute, (c) =>
    deps.controller.deleteTemplate(c, c.req.valid('param').id) as never,
  );

  return routes;
}

export function createAdminNotificationCampaignRoutes(deps: NotificationCampaignRoutesDeps) {
  const routes = createOpenApiApp();
  routes.use(
    '*',
    deps.authenticate,
    authorizeRole('admin', 'root'),
    rateLimit({ points: 60, duration: 60 }),
  );

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin Notification Campaigns'],
    summary: 'Daftar campaign',
    request: { query: listCampaignsQuerySchema },
    responses: {
      200: { description: 'Daftar', content: json(listCampaignsResponseSchema) },
    },
  });

  const createRouteDef = createRoute({
    method: 'post',
    path: '/',
    tags: ['Admin Notification Campaigns'],
    summary: 'Buat draft campaign',
    request: { body: { content: json(createCampaignBodySchema) } },
    responses: {
      201: { description: 'Draft dibuat', content: json(campaignResponseSchema) },
      400: { description: 'Validasi gagal', content: json(errorResponseSchema) },
    },
  });

  const estimateRoute = createRoute({
    method: 'post',
    path: '/estimate',
    tags: ['Admin Notification Campaigns'],
    summary: 'Estimasi audience (user dengan device aktif)',
    request: { body: { content: json(estimateAudienceBodySchema) } },
    responses: {
      200: { description: 'Estimasi', content: json(estimateAudienceResponseSchema) },
    },
  });

  const detailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Admin Notification Campaigns'],
    summary: 'Detail campaign + stats + sample failures',
    request: { params: campaignIdParamsSchema },
    responses: {
      200: { description: 'Detail', content: json(campaignDetailResponseSchema) },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const sendRoute = createRoute({
    method: 'post',
    path: '/:id/send',
    tags: ['Admin Notification Campaigns'],
    summary: 'Kirim sekarang atau jadwalkan (jika send_at masa depan)',
    request: { params: campaignIdParamsSchema },
    responses: {
      200: { description: 'Dikirim / dijadwalkan', content: json(campaignResponseSchema) },
      400: { description: 'Tidak bisa dikirim', content: json(errorResponseSchema) },
    },
  });

  const cancelRoute = createRoute({
    method: 'post',
    path: '/:id/cancel',
    tags: ['Admin Notification Campaigns'],
    summary: 'Batalkan draft / scheduled',
    request: { params: campaignIdParamsSchema },
    responses: {
      200: { description: 'Dibatalkan', content: json(campaignResponseSchema) },
      400: { description: 'Tidak bisa dibatalkan', content: json(errorResponseSchema) },
    },
  });

  const retryRoute = createRoute({
    method: 'post',
    path: '/:id/retry',
    tags: ['Admin Notification Campaigns'],
    summary: 'Ulangi penerima gagal (audience selected)',
    request: { params: campaignIdParamsSchema },
    responses: {
      200: { description: 'Retry dimulai', content: json(campaignResponseSchema) },
      400: { description: 'Tidak bisa di-retry', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listRoute, (c) => deps.controller.listCampaigns(c, c.req.valid('query')) as never);
  routes.openapi(estimateRoute, (c) =>
    deps.controller.estimateAudience(c, c.req.valid('json')) as never,
  );
  routes.openapi(createRouteDef, (c) =>
    deps.controller.createCampaign(c, c.req.valid('json')) as never,
  );
  routes.openapi(detailRoute, (c) =>
    deps.controller.getCampaign(c, c.req.valid('param').id) as never,
  );
  routes.openapi(sendRoute, (c) =>
    deps.controller.sendCampaign(c, c.req.valid('param').id) as never,
  );
  routes.openapi(cancelRoute, (c) =>
    deps.controller.cancelCampaign(c, c.req.valid('param').id) as never,
  );
  routes.openapi(retryRoute, (c) =>
    deps.controller.retryCampaign(c, c.req.valid('param').id) as never,
  );

  return routes;
}
