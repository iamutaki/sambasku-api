import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { BookmarkController } from './bookmark.controller';
import {
  myBookmarksQuerySchema,
  myBookmarksResponseSchema,
  toggleBookmarkResponseSchema,
  toggleBookmarkSchema,
} from './validators/bookmark.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface BookmarkRoutesDeps {
  controller: BookmarkController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Bookmark kata per user (16-api-bookmark.md): toggle + daftar milik user.
// Mount di /api/v1/bookmarks.
export function createBookmarkRoutes(deps: BookmarkRoutesDeps) {
  const routes = createOpenApiApp();

  // Toggle: login (semua role) + 30/menit per user_id - tier tulis standar
  // (Section 15), tidak butuh kelonggaran seperti vote (60) karena toggle
  // bookmark satu arah idempotent.
  routes.use(
    '/',
    deps.authenticate,
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `bookmark-toggle:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );
  // My: login (semua role), tanpa limit tambahan - baca kecil bermakna user sendiri
  routes.use('/my', deps.authenticate);

  const toggleRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Bookmarks'],
    summary: 'Toggle bookmark kata - sudah ada = lepas, belum = pasang (login, semua role)',
    request: {
      body: { content: json(toggleBookmarkSchema) },
    },
    responses: {
      200: { description: 'State bookmark final kata', content: json(toggleBookmarkResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan / sudah dihapus', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak toggle (30/menit per user)', content: json(errorResponseSchema) },
    },
  });

  const myRoute = createRoute({
    method: 'get',
    path: '/my',
    tags: ['Bookmarks'],
    summary: 'Daftar bookmark user login (cursor) - word_ids opsional untuk cek status batch',
    request: {
      query: myBookmarksQuerySchema,
    },
    responses: {
      200: { description: 'Bookmark user + ringkasan kata; meta hanya tanpa word_ids', content: json(myBookmarksResponseSchema) },
      400: { description: 'Format limit/cursor/word_ids tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(toggleRoute, (c) => deps.controller.toggle(c, c.req.valid('json')) as never);
  routes.openapi(myRoute, (c) => deps.controller.my(c, c.req.valid('query')) as never);

  return routes;
}
