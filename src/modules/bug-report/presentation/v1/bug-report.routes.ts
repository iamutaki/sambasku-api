import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables } from '@/shared/types';
import {
  clientIpKey,
  normalizedDeviceId,
  rateLimit,
} from '@/shared/middlewares/rate-limit.middleware';
import type { BugReportController } from './bug-report.controller';
import {
  bugReportUploadTokenQuerySchema,
  createBugReportBodySchema,
  createBugReportResponseSchema,
  uploadCredentialsResponseSchema,
} from './validators/bug-report.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface BugReportRoutesDeps {
  controller: BugReportController;
  optionalAuthenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

const tokenIpLimit = rateLimit({
  points: 40,
  duration: 3600,
  keyFn: (c) => `bug-tok:ip:${clientIpKey(c)}`,
});
const tokenDeviceLimit = rateLimit({
  points: 20,
  duration: 3600,
  keyFn: (c) => {
    const d = normalizedDeviceId(c);
    return d ? `bug-tok:dev:${d}` : '';
  },
});

const submitUserLimit = rateLimit({
  points: 5,
  duration: 3600,
  keyFn: (c) => {
    const uid = (c as { get: (k: 'user') => { user_id: string } | undefined }).get('user')?.user_id;
    return uid ? `bug-submit:user:${uid}` : '';
  },
});
const submitIpLimit = rateLimit({
  points: 20,
  duration: 3600,
  keyFn: (c) => `bug-submit:ip:${clientIpKey(c)}`,
});
const submitDeviceLimit = rateLimit({
  points: 5,
  duration: 3600,
  keyFn: (c) => {
    const d = normalizedDeviceId(c);
    return d ? `bug-submit:dev:${d}` : '';
  },
});

export function createBugReportRoutes(deps: BugReportRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('/upload-token', tokenIpLimit, tokenDeviceLimit);

  routes.use('/', deps.optionalAuthenticate);
  routes.use('/', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    if (c.get('user')?.user_id) return submitUserLimit(c, next);
    return next();
  });
  routes.use('/', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    if (c.get('user')?.user_id) return next();
    return submitIpLimit(c, next);
  });
  routes.use('/', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    if (c.get('user')?.user_id) return next();
    return submitDeviceLimit(c, next);
  });

  const uploadTokenRoute = createRoute({
    method: 'get',
    path: '/upload-token',
    tags: ['Bug Reports'],
    summary: 'Kredensial direct-upload ImageKit, folder hanya /bug-reports (publik)',
    request: { query: bugReportUploadTokenQuerySchema },
    responses: {
      200: {
        description: 'Token + signature upload',
        content: json(uploadCredentialsResponseSchema),
      },
      400: {
        description: 'Folder bukan /bug-reports',
        content: json(errorResponseSchema),
      },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
      503: {
        description: 'Provider gambar belum dikonfigurasi',
        content: json(errorResponseSchema),
      },
    },
  });

  const submitRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Bug Reports'],
    summary: 'Kirim laporan masalah (auth opsional: tamu atau login)',
    request: { body: { content: json(createBugReportBodySchema) } },
    responses: {
      200: { description: 'Laporan tersimpan', content: json(createBugReportResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Bearer ada tapi invalid/expired', content: json(errorResponseSchema) },
      429: { description: 'Rate limit', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(
    uploadTokenRoute,
    (c) => deps.controller.uploadCredentials(c, c.req.valid('query').folder) as never,
  );
  routes.openapi(submitRoute, (c) =>
    deps.controller.create(c, c.req.valid('json'), normalizedDeviceId(c)) as never,
  );

  return routes;
}
