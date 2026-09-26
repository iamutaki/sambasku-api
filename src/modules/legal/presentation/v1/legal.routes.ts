import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import type { AppVariables } from '@/shared/types';
import type { LegalController } from './legal.controller';
import {
  acceptLegalBodySchema,
  acceptLegalResponseSchema,
  appSettingsListResponseSchema,
  createLegalDraftBodySchema,
  currentLegalResponseSchema,
  legalDocumentAdminResponseSchema,
  legalDocumentPublicResponseSchema,
  legalDocumentQuerySchema,
  legalDocumentTypeParamsSchema,
  legalIdParamsSchema,
  listAdminLegalQuerySchema,
  listAdminLegalResponseSchema,
  patchAppSettingsBodySchema,
  updateLegalDraftBodySchema,
} from './validators/legal.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface LegalRoutesDeps {
  controller: LegalController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function createLegalPublicRoutes(deps: { controller: LegalController }) {
  const routes = createOpenApiApp();

  routes.openapi(
    createRoute({
      method: 'get',
      path: '/current',
      tags: ['Legal'],
      summary: 'Versi aktif Syarat Ketentuan dan Kebijakan Privasi',
      responses: {
        200: { description: 'Versi aktif', content: json(currentLegalResponseSchema) },
        404: { description: 'Belum dikonfigurasi', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.getCurrent(c) as never,
  );

  routes.openapi(
    createRoute({
      method: 'get',
      path: '/documents/{type}',
      tags: ['Legal'],
      summary: 'Isi dokumen legal (versi aktif atau ?version=)',
      request: {
        params: legalDocumentTypeParamsSchema,
        query: legalDocumentQuerySchema,
      },
      responses: {
        200: { description: 'Dokumen', content: json(legalDocumentPublicResponseSchema) },
        404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
      },
    }),
    (c) => {
      const { type } = c.req.valid('param');
      const { version } = c.req.valid('query');
      return deps.controller.getDocument(c, type, version) as never;
    },
  );

  return routes;
}

export function createLegalAuthRoutes(deps: LegalRoutesDeps) {
  const routes = createOpenApiApp();
  routes.use('/accept-legal', deps.authenticate);

  routes.openapi(
    createRoute({
      method: 'post',
      path: '/accept-legal',
      tags: ['Legal'],
      summary: 'Setujui dokumen legal versi aktif',
      request: { body: { content: json(acceptLegalBodySchema) } },
      responses: {
        200: { description: 'Berhasil', content: json(acceptLegalResponseSchema) },
        400: { description: 'Consent tidak valid', content: json(errorResponseSchema) },
        401: { description: 'Tidak terautentikasi', content: json(errorResponseSchema) },
        403: { description: 'Versi kedaluwarsa', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.acceptLegal(c, c.req.valid('json')) as never,
  );

  return routes;
}

export function createAdminLegalRoutes(deps: LegalRoutesDeps) {
  const routes = createOpenApiApp();
  const adminOnly = [deps.authenticate, authorizeRole('root', 'admin')] as const;

  routes.use('/documents', ...adminOnly);
  routes.use('/documents/*', ...adminOnly);
  routes.use('/settings', ...adminOnly);

  routes.openapi(
    createRoute({
      method: 'get',
      path: '/documents',
      tags: ['Admin Legal'],
      summary: 'List dokumen legal',
      request: { query: listAdminLegalQuerySchema },
      responses: {
        200: { description: 'Daftar', content: json(listAdminLegalResponseSchema) },
        401: { description: 'Unauthorized', content: json(errorResponseSchema) },
        403: { description: 'Forbidden', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.listAdmin(c, c.req.valid('query')) as never,
  );

  routes.openapi(
    createRoute({
      method: 'post',
      path: '/documents',
      tags: ['Admin Legal'],
      summary: 'Buat draft dokumen legal',
      request: { body: { content: json(createLegalDraftBodySchema) } },
      responses: {
        201: { description: 'Draft dibuat', content: json(legalDocumentAdminResponseSchema) },
        400: { description: 'Validasi', content: json(errorResponseSchema) },
        409: { description: 'Versi sudah ada', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.createDraft(c, c.req.valid('json')) as never,
  );

  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/documents/{id}',
      tags: ['Admin Legal'],
      summary: 'Ubah draft',
      request: {
        params: legalIdParamsSchema,
        body: { content: json(updateLegalDraftBodySchema) },
      },
      responses: {
        200: { description: 'Updated', content: json(legalDocumentAdminResponseSchema) },
        400: { description: 'Bukan draft', content: json(errorResponseSchema) },
      },
    }),
    (c) =>
      deps.controller.updateDraft(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );

  routes.openapi(
    createRoute({
      method: 'post',
      path: '/documents/{id}/publish',
      tags: ['Admin Legal'],
      summary: 'Publish dokumen (set versi aktif)',
      request: { params: legalIdParamsSchema },
      responses: {
        200: { description: 'Published', content: json(legalDocumentAdminResponseSchema) },
        404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.publish(c, c.req.valid('param').id) as never,
  );

  routes.openapi(
    createRoute({
      method: 'post',
      path: '/documents/{id}/archive',
      tags: ['Admin Legal'],
      summary: 'Archive dokumen',
      request: { params: legalIdParamsSchema },
      responses: {
        200: { description: 'Archived', content: json(legalDocumentAdminResponseSchema) },
        404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.archive(c, c.req.valid('param').id) as never,
  );

  routes.openapi(
    createRoute({
      method: 'get',
      path: '/settings',
      tags: ['Admin Legal'],
      summary: 'Baca app_settings legal/OAuth',
      responses: {
        200: { description: 'Settings', content: json(appSettingsListResponseSchema) },
      },
    }),
    (c) => deps.controller.getSettings(c) as never,
  );

  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/settings',
      tags: ['Admin Legal'],
      summary: 'Ubah app_settings',
      request: { body: { content: json(patchAppSettingsBodySchema) } },
      responses: {
        200: { description: 'Updated', content: json(appSettingsListResponseSchema) },
        400: { description: 'Key/value invalid', content: json(errorResponseSchema) },
      },
    }),
    (c) => deps.controller.patchSettings(c, c.req.valid('json')) as never,
  );

  return routes;
}
