import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authorizeRole } from '@/shared/middlewares/authorize-role.middleware';
import { okNullResponseSchema } from '@/shared/openapi/error-response.schema';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { WordController } from './word.controller';
import {
  createWordResponseSchema,
  createWordSchema,
  adminListWordsQuerySchema,
  listWordsQuerySchema,
  searchWordsQuerySchema,
  wordDetailResponseSchema,
  wordOfDayResponseSchema,
  latestWordsResponseSchema,
  listLatestWordsQuerySchema,
  wordListResponseSchema,
  duplicateWordGroupsResponseSchema,
  mergeDuplicateWordsBodySchema,
  mergeDuplicateWordsResponseSchema,
  commaSplitCandidatesResponseSchema,
  applyCommaSplitBodySchema,
  applyCommaSplitResponseSchema,
  markCommaLiteralBodySchema,
  markCommaLiteralResponseSchema,
} from './validators/create-word.validator';
import {
  adminWordDetailResponseSchema,
  updateWordResponseSchema,
  updateWordSchema,
} from './validators/update-word.validator';
import { takedownWordBodySchema } from '@/modules/word-report/presentation/v1/validators/word-report.validator';
import { importWordsBodySchema, importWordsResponseSchema } from './validators/import-words.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface WordRoutesDeps {
  controller: WordController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// POST /api/v1/admin/words - authenticate + authorizeRole + rate limit 30/menit
// GET  /api/v1/admin/words - list panel Kata (tabs tayang)
export function createAdminWordRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use(
    '/',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'contributor', 'root', 'reviewer'),
    rateLimit({
      points: 30,
      duration: 60,
      // per user_id (Section 15) - authenticate sudah jalan lebih dulu
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-create:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  );

  const listAdminWordsRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Words', 'Admin'],
    summary: 'List kata panel admin - filter tayang (published true|false|all)',
    request: { query: adminListWordsQuerySchema },
    responses: {
      200: { description: 'Daftar kata (cursor)', content: json(wordListResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  const createWordRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Words', 'Admin'],
    summary: 'Tambah kata baru lengkap dengan makna/terjemahan/contoh (transaksional)',
    request: { body: { content: json(createWordSchema) } },
    responses: {
      201: { description: 'Kata tersimpan (status per role)', content: json(createWordResponseSchema) },
      400: { description: 'Body tidak valid / referensi id tidak ditemukan', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listAdminWordsRoute, (c) => deps.controller.listAdmin(c, c.req.valid('query')) as never);
  routes.openapi(createWordRoute, (c) => deps.controller.create(c, c.req.valid('json')) as never);

  routes.use(
    '/import',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-import:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );
  const importWordsRoute = createRoute({
    method: 'post',
    path: '/import',
    tags: ['Words', 'Admin'],
    summary: 'Impor kata dari CSV yang sudah dipratinjau (maksimal 25 kata)',
    request: { body: { content: json(importWordsBodySchema) } },
    responses: {
      200: { description: 'Hasil cek tanpa menulis', content: json(importWordsResponseSchema) },
      201: { description: 'Kata atau makna tersimpan', content: json(importWordsResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });
  routes.openapi(importWordsRoute, (c) => deps.controller.importWords(c, c.req.valid('json')) as never);

  // Tab Duplikasi - literal SEBELUM /:id
  routes.use(
    '/duplicates',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({ points: 60, duration: 60 }),
  );
  routes.use(
    '/duplicates/merge',
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );

  const listDuplicatesRoute = createRoute({
    method: 'get',
    path: '/duplicates',
    tags: ['Words', 'Admin'],
    summary: 'Kelompok lemma duplikat (tab Duplikasi)',
    responses: {
      200: { description: 'Kelompok duplikat', content: json(duplicateWordGroupsResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  const mergeDuplicatesRoute = createRoute({
    method: 'post',
    path: '/duplicates/merge',
    tags: ['Words', 'Admin'],
    summary: 'Gabungkan entri lemma duplikat ke satu entri yang dipilih',
    request: { body: { content: json(mergeDuplicateWordsBodySchema) } },
    responses: {
      200: { description: 'Gabungan berhasil', content: json(mergeDuplicateWordsResponseSchema) },
      400: { description: 'Body tidak valid / lemma tidak cocok', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Entri tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listDuplicatesRoute, (c) => deps.controller.listDuplicates(c) as never);
  routes.openapi(mergeDuplicatesRoute, (c) =>
    deps.controller.mergeDuplicates(c, c.req.valid('json')) as never,
  );

  // Tab Pemisahan - literal SEBELUM /:id
  routes.use(
    '/comma-splits',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({ points: 60, duration: 60 }),
  );
  routes.use(
    '/comma-splits/apply',
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );
  routes.use(
    '/comma-splits/mark-literal',
    deps.authenticate,
    authorizeRole('admin', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );

  const listCommaSplitsRoute = createRoute({
    method: 'get',
    path: '/comma-splits',
    tags: ['Words', 'Admin'],
    summary: 'Kandidat pecah koma (tab Pemisahan)',
    responses: {
      200: { description: 'Kandidat lemma & padanan berkoma', content: json(commaSplitCandidatesResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
    },
  });

  const applyCommaSplitRoute = createRoute({
    method: 'post',
    path: '/comma-splits/apply',
    tags: ['Words', 'Admin'],
    summary: 'Pisahkan lemma jadi beberapa kata, atau padanan jadi beberapa makna',
    request: { body: { content: json(applyCommaSplitBodySchema) } },
    responses: {
      200: { description: 'Pemisahan berhasil', content: json(applyCommaSplitResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Entri tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const markCommaLiteralRoute = createRoute({
    method: 'post',
    path: '/comma-splits/mark-literal',
    tags: ['Words', 'Admin'],
    summary: 'Tandai koma sebagai literal (keluar antrean Pemisahan)',
    request: { body: { content: json(markCommaLiteralBodySchema) } },
    responses: {
      200: { description: 'Ditandai literal', content: json(markCommaLiteralResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Entri tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listCommaSplitsRoute, (c) => deps.controller.listCommaSplits(c) as never);
  routes.openapi(applyCommaSplitRoute, (c) =>
    deps.controller.applyCommaSplit(c, c.req.valid('json')) as never,
  );
  routes.openapi(markCommaLiteralRoute, (c) =>
    deps.controller.markCommaLiteral(c, c.req.valid('json')) as never,
  );

  // Edit kata (05-api-edit-kata.md) - verifier team saja: perubahan
  // contributor atas entri existing adalah kontribusi → jalur antrean
  // review (03 doc), bukan endpoint ini. Rate limit kategori tulis 30/menit
  // per user_id (GET prefill ikut limit ini - sekali per sesi edit, cukup).
  routes.use(
    '/:id',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({
      points: 30,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `word-update:${user?.user_id ?? c.req.header('x-forwarded-for') ?? 'unknown'}`;
      },
    }),
  );

  const adminWordDetailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Words', 'Admin'],
    summary: 'Detail kata SEMUA status - prefill form edit (draft/pending/rejected terbuka)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Detail kata', content: json(adminWordDetailResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const updateWordRoute = createRoute({
    method: 'put',
    path: '/:id',
    tags: ['Words', 'Admin'],
    summary: 'Edit kata (full replace - kirim ulang seluruh form)',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(updateWordSchema) },
    },
    responses: {
      200: { description: 'Kata ter-update (status per role)', content: json(updateWordResponseSchema) },
      400: { description: 'Body tidak valid / referensi id tidak ditemukan', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const deleteWordRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Words', 'Admin'],
    summary: 'Soft-delete kata (07-api-delete-kata.md) - hilang dari publik & admin, baris dipertahankan untuk audit/recovery',
    request: {
      params: z.object({ id: z.string().length(26) }),
    },
    responses: {
      200: { description: 'Kata di-soft-delete', content: json(okNullResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan / sudah dihapus', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(adminWordDetailRoute, (c) => deps.controller.adminDetail(c, c.req.param('id')) as never);
  routes.openapi(updateWordRoute, (c) =>
    deps.controller.update(c, c.req.param('id'), c.req.valid('json')) as never,
  );
  routes.openapi(deleteWordRoute, (c) => deps.controller.deleteWord(c, c.req.param('id')) as never);

  // Verifikasi (Section 22) - HANYA verifikator: admin, root, reviewer.
  // Middleware per-path (beda role dari create yang menerima contributor)
  routes.use('/:id/verify', deps.authenticate, authorizeRole('admin', 'root', 'reviewer'), rateLimit({ points: 500, duration: 60 }));
  routes.use('/:id/unverify', deps.authenticate, authorizeRole('admin', 'root', 'reviewer'), rateLimit({ points: 500, duration: 60 }));

  const verifyRoute = createRoute({
    method: 'post',
    path: '/:id/verify',
    tags: ['Words', 'Admin'],
    summary: 'Verifikasi kata oleh verifikator (is_verified → true)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Kata terverifikasi', content: { 'application/json': { schema: okNullResponseSchema } } },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator (admin/root/reviewer)', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const unverifyRoute = createRoute({
    method: 'post',
    path: '/:id/unverify',
    tags: ['Words', 'Admin'],
    summary: 'Cabut verifikasi kata (is_verified → false)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Verifikasi dicabut', content: { 'application/json': { schema: okNullResponseSchema } } },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(verifyRoute, (c) => deps.controller.verify(c, c.req.param('id'), true) as never);
  routes.openapi(unverifyRoute, (c) => deps.controller.verify(c, c.req.param('id'), false) as never);

  // Publikasikan / tarik tayang (status published ↔ draft)
  routes.use('/:id/publish', deps.authenticate, authorizeRole('admin', 'root', 'reviewer'), rateLimit({ points: 500, duration: 60 }));
  routes.use('/:id/unpublish', deps.authenticate, authorizeRole('admin', 'root', 'reviewer'), rateLimit({ points: 500, duration: 60 }));

  const publishRoute = createRoute({
    method: 'post',
    path: '/:id/publish',
    tags: ['Words', 'Admin'],
    summary: 'Publikasikan kata (status → published, is_verified → true)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Kata ditayangkan', content: { 'application/json': { schema: okNullResponseSchema } } },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator (admin/root/reviewer)', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const unpublishRoute = createRoute({
    method: 'post',
    path: '/:id/unpublish',
    tags: ['Words', 'Admin'],
    summary: 'Tarik kata dari tayang (status → draft)',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Kata ditarik dari tayang', content: { 'application/json': { schema: okNullResponseSchema } } },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Bukan verifikator', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(publishRoute, (c) => deps.controller.publish(c, c.req.param('id'), true) as never);
  routes.openapi(unpublishRoute, (c) => deps.controller.publish(c, c.req.param('id'), false) as never);

  const moderationResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
      id: z.string(),
      status: z.enum(['taken_down', 'published']),
    }),
  });

  routes.use(
    '/:id/takedown',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );
  routes.use(
    '/:id/restore',
    deps.authenticate,
    authorizeRole('admin', 'editor', 'root', 'reviewer'),
    rateLimit({ points: 30, duration: 60 }),
  );

  const takedownRoute = createRoute({
    method: 'post',
    path: '/:id/takedown',
    tags: ['Words', 'Admin'],
    summary: 'Tarik entri yang tayang (status → taken_down). Bukan soft-delete.',
    request: {
      params: z.object({ id: z.string().length(26) }),
      body: { content: json(takedownWordBodySchema) },
    },
    responses: {
      200: { description: 'Entri ditarik', content: json(moderationResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Bukan published', content: json(errorResponseSchema) },
    },
  });

  const restoreRoute = createRoute({
    method: 'post',
    path: '/:id/restore',
    tags: ['Words', 'Admin'],
    summary: 'Pulihkan entri taken_down ke published',
    request: { params: z.object({ id: z.string().length(26) }) },
    responses: {
      200: { description: 'Entri dipulihkan', content: json(moderationResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      403: { description: 'Role tidak diizinkan', content: json(errorResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
      409: { description: 'Bukan taken_down', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(
    takedownRoute,
    (c) => deps.controller.takedownWord(c, c.req.param('id'), c.req.valid('json')) as never,
  );
  routes.openapi(restoreRoute, (c) => deps.controller.restoreWord(c, c.req.param('id')) as never);

  return routes;
}

// GET /api/v1/words + /search + /:id - publik, rate limit 100/menit per IP
export function createPublicWordRoutes(deps: WordRoutesDeps) {
  const routes = createOpenApiApp();

  routes.use('*', rateLimit({ points: 100, duration: 60 }));

  // 18-api-list-words.md: daftar semua kata A-Z (browsing, bukan pencarian).
  // Literal '/' didaftarkan SEBELUM '/:id' (pola '/search').
  const listWordsRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Words'],
    summary: 'Daftar semua kata A-Z (browsing publik) - cursor komposit + filter q',
    request: { query: listWordsQuerySchema },
    responses: {
      200: { description: 'Daftar kata urut lemma', content: json(wordListResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
    },
  });

  // Feed beranda - literal '/latest' WAJIB sebelum '/:id'.
  const listLatestRoute = createRoute({
    method: 'get',
    path: '/latest',
    tags: ['Words'],
    summary: 'Feed kosakata terbaru yang sudah disetujui (cursor waktu persetujuan)',
    request: { query: listLatestWordsQuerySchema },
    responses: {
      200: { description: 'Kata published urut persetujuan terbaru', content: json(latestWordsResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
    },
  });

  // 28-api-word-of-the-day.md - literal '/today' WAJIB sebelum '/:id'
  // (kalau tidak, tertangkap param id → gagal validasi ULID 400).
  const wordOfDayRoute = createRoute({
    method: 'get',
    path: '/today',
    tags: ['Words'],
    summary: 'Kata hari ini - deterministik per tanggal WIB (korpus kosong = data null)',
    responses: {
      200: { description: 'Detail kata + date + is_new_this_week, atau null', content: json(wordOfDayResponseSchema) },
    },
  });

  const wordDetailRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Words'],
    summary: 'Detail kata published (halaman publik)',
    request: {
      params: z.object({ id: z.string().length(26) }),
    },
    responses: {
      200: { description: 'Detail kata', content: json(wordDetailResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  // URL publik web /words/<lemma> - WAJIB terdaftar sebelum '/:id' agar
  // segmen literal 'lemma' tidak tertelan param id.
  const wordByLemmaRoute = createRoute({
    method: 'get',
    path: '/lemma/:lemma',
    tags: ['Words'],
    summary: 'Detail kata published berdasarkan lemma (URL publik web)',
    request: {
      params: z.object({ lemma: z.string().trim().min(1).max(255) }),
    },
    responses: {
      200: { description: 'Detail kata', content: json(wordDetailResponseSchema) },
      404: { description: 'Kata tidak ditemukan', content: json(errorResponseSchema) },
    },
  });

  const searchWordsRoute = createRoute({
    method: 'get',
    path: '/search',
    tags: ['Words'],
    summary: 'Cari kata (dropdown sinonim/antonim form admin) - list + meta pagination',
    request: { query: searchWordsQuerySchema },
    responses: {
      200: { description: 'Hasil pencarian', content: json(wordListResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(listWordsRoute, (c) => deps.controller.list(c, c.req.valid('query')) as never);
  routes.openapi(listLatestRoute, (c) => deps.controller.listLatest(c, c.req.valid('query')) as never);
  routes.openapi(searchWordsRoute, (c) => deps.controller.search(c, c.req.valid('query')) as never);
  routes.openapi(wordOfDayRoute, (c) => deps.controller.wordOfDay(c) as never);
  routes.openapi(wordByLemmaRoute, (c) => deps.controller.detailByLemma(c, c.req.param('lemma')) as never);
  routes.openapi(wordDetailRoute, (c) => deps.controller.detail(c, c.req.param('id')) as never);

  return routes;
}
