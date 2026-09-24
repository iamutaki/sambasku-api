import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import { clientIpKey, rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import type { TranslationHelpController } from './translation-help.controller';
import {
  createTranslationHelpBodySchema,
  createTranslationHelpReplyBodySchema,
  createTranslationHelpReplyResponseSchema,
  createTranslationHelpResponseSchema,
  deleteTranslationHelpReplyResponseSchema,
  listMyTranslationHelpsQuerySchema,
  listTranslationHelpsQuerySchema,
  translationHelpIdParamSchema,
  translationHelpOwnerDetailResponseSchema,
  translationHelpOwnerListResponseSchema,
  translationHelpPublicDetailResponseSchema,
  translationHelpPublicListResponseSchema,
  translationHelpReplyIdParamSchema,
  translationHelpUploadTokenQuerySchema,
  uploadCredentialsResponseSchema,
} from './validators/translation-help.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface TranslationHelpRoutesDeps {
  controller: TranslationHelpController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
  optionalAuthenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

const tokenUserLimit = rateLimit({
  points: 20,
  duration: 3600,
  keyFn: (c) => {
    const uid = (c as { get: (k: 'user') => { user_id: string } | undefined }).get('user')?.user_id;
    return uid ? `th-tok:user:${uid}` : '';
  },
});
const tokenIpLimit = rateLimit({
  points: 40,
  duration: 3600,
  keyFn: (c) => `th-tok:ip:${clientIpKey(c)}`,
});

const submitUserLimit = rateLimit({
  points: 10,
  duration: 3600,
  keyFn: (c) => {
    const uid = (c as { get: (k: 'user') => { user_id: string } | undefined }).get('user')?.user_id;
    return uid ? `th-submit:user:${uid}` : '';
  },
});

const replyUserLimit = rateLimit({
  points: 30,
  duration: 3600,
  keyFn: (c) => {
    const uid = (c as { get: (k: 'user') => { user_id: string } | undefined }).get('user')?.user_id;
    return uid ? `th-reply:user:${uid}` : '';
  },
});

export function createTranslationHelpRoutes(deps: TranslationHelpRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/upload-token', deps.authenticate, tokenUserLimit, tokenIpLimit);
  routes.use('/', async (c, next) => {
    if (c.req.method === 'POST') return deps.authenticate(c, next);
    return next();
  });
  routes.use('/', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    return submitUserLimit(c, next);
  });
  routes.use('/my', deps.authenticate);
  routes.use('/:id', deps.optionalAuthenticate);
  routes.use('/:id/replies', deps.authenticate, replyUserLimit);
  routes.use('/replies/:id', deps.authenticate);

  const uploadTokenRoute = createRoute({
    method: 'get',
    path: '/upload-token',
    tags: ['Translation Helps'],
    summary: 'Kredensial direct-upload ImageKit, folder hanya /translation-helps (login)',
    request: { query: translationHelpUploadTokenQuerySchema },
    responses: {
      200: {
        description: 'Token + signature upload',
        content: json(uploadCredentialsResponseSchema),
      },
      400: { description: 'Folder bukan /translation-helps', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
      503: {
        description: 'Provider gambar belum dikonfigurasi',
        content: json(errorResponseSchema),
      },
    },
  });

  const createRouteDef = createRoute({
    method: 'post',
    path: '/',
    tags: ['Translation Helps'],
    summary: 'Kirim permintaan bantuan terjemahan (wajib login)',
    request: { body: { content: json(createTranslationHelpBodySchema) } },
    responses: {
      200: { description: 'Tersimpan pending_review', content: json(createTranslationHelpResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Translation Helps'],
    summary: 'Feed bantuan terjemahan yang tayang (publik)',
    request: { query: listTranslationHelpsQuerySchema },
    responses: {
      200: { description: 'Daftar published', content: json(translationHelpPublicListResponseSchema) },
    },
  });

  const myRoute = createRoute({
    method: 'get',
    path: '/my',
    tags: ['Translation Helps'],
    summary: 'Riwayat permintaan bantuan saya',
    request: { query: listMyTranslationHelpsQuerySchema },
    responses: {
      200: { description: 'Daftar milik user', content: json(translationHelpOwnerListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  const detailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Translation Helps'],
    summary: 'Detail bantuan (published publik; pending/rejected hanya pemilik)',
    request: { params: translationHelpIdParamSchema },
    responses: {
      200: {
        description: 'Detail',
        content: {
          'application/json': {
            schema: translationHelpPublicDetailResponseSchema.or(
              translationHelpOwnerDetailResponseSchema,
            ),
          },
        },
      },
      404: { description: 'Tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const createReplyRoute = createRoute({
    method: 'post',
    path: '/:id/replies',
    tags: ['Translation Helps'],
    summary: 'Balas bantuan yang sudah tayang (login)',
    request: {
      params: translationHelpIdParamSchema,
      body: { content: json(createTranslationHelpReplyBodySchema) },
    },
    responses: {
      201: { description: 'Balasan tersimpan', content: json(createTranslationHelpReplyResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Bantuan tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Bantuan belum tayang', content: json(errorResponseSchema) },
    },
  });

  const deleteReplyRoute = createRoute({
    method: 'delete',
    path: '/replies/:id',
    tags: ['Translation Helps'],
    summary: 'Hapus balasan sendiri',
    request: { params: translationHelpReplyIdParamSchema },
    responses: {
      200: { description: 'Dihapus', content: json(deleteTranslationHelpReplyResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan penulis', content: json(errorResponseSchema) },
      404: { description: 'Balasan tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(
    uploadTokenRoute,
    (c) => deps.controller.uploadCredentials(c, c.req.valid('query').folder) as never,
  );
  routes.openapi(createRouteDef, (c) =>
    deps.controller.create(c, c.req.valid('json')) as never,
  );
  routes.openapi(listRoute, (c) =>
    deps.controller.listPublished(c, c.req.valid('query')) as never,
  );
  routes.openapi(myRoute, (c) => deps.controller.listMine(c, c.req.valid('query')) as never);
  routes.openapi(detailRoute, (c) =>
    deps.controller.getDetail(c, c.req.valid('param').id) as never,
  );
  routes.openapi(createReplyRoute, (c) =>
    deps.controller.createReply(c, c.req.valid('param').id, c.req.valid('json')) as never,
  );
  routes.openapi(deleteReplyRoute, (c) =>
    deps.controller.deleteReply(c, c.req.valid('param').id) as never,
  );

  return routes;
}
