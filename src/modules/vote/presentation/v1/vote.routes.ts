import type { MiddlewareHandler } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { rateLimit } from '@/shared/middlewares/rate-limit.middleware';
import { createOpenApiApp } from '@/shared/openapi/openapi-app';
import { errorResponseSchema } from '@/shared/openapi/error-response.schema';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { VoteController } from './vote.controller';
import {
  myVotesResponseSchema,
  targetsQuerySchema,
  toggleVoteResponseSchema,
  toggleVoteSchema,
  voteCountsResponseSchema,
  voteDeckQuerySchema,
  voteDeckResponseSchema,
  voteHistoryQuerySchema,
  voteHistoryResponseSchema,
} from './validators/vote.validator';

const json = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

export interface VoteRoutesDeps {
  controller: VoteController;
  authenticate: MiddlewareHandler<{ Variables: AppVariables }>;
}

// Vote polymorphic (08-api-upvote-downvote.md): toggle + batch counts +
// vote milik user + deck (34). Mount di /api/v1/votes.
export function createVoteRoutes(deps: VoteRoutesDeps) {
  const routes = createOpenApiApp();

  // Toggle: login (semua role) + 60/menit per user_id - interaksi ringan,
  // lebih longgar dari tier tulis 30/menit (Section 15)
  routes.use(
    '/',
    deps.authenticate,
    rateLimit({
      points: 60,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `vote-toggle:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );
  // Counts: baca publik - tier 100/menit per IP (Section 15)
  routes.use('/counts', rateLimit({ points: 100, duration: 60 }));
  // My: login (semua role), tanpa limit tambahan - baca kecil bermakna user sendiri
  routes.use('/my', deps.authenticate);
  // History: login (semua role) + 100/menit per user_id. Path baru, bukan
  // dual-mode /my (26-api-my-votes.md).
  routes.use(
    '/history',
    deps.authenticate,
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `vote-history:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );
  // Deck: login + 100/menit per user_id (34-api-vote-deck.md)
  routes.use(
    '/deck',
    deps.authenticate,
    rateLimit({
      points: 100,
      duration: 60,
      keyFn: (c) => {
        const user = (c.get('user') as AuthUser | undefined) ?? null;
        return `vote-deck:${user?.user_id ?? 'unknown'}`;
      },
    }),
  );

  const toggleRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['Votes'],
    summary:
      'Toggle upvote/downvote - vote searah kedua kali = batal, beda arah = ganti (login, semua role)',
    request: {
      body: { content: json(toggleVoteSchema) },
    },
    responses: {
      200: { description: 'State vote final + counts segar', content: json(toggleVoteResponseSchema) },
      400: { description: 'Body tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      404: { description: 'Target vote tidak ditemukan / sudah dihapus', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak toggle (60/menit per user)', content: json(errorResponseSchema) },
    },
  });

  const countsRoute = createRoute({
    method: 'get',
    path: '/counts',
    tags: ['Votes'],
    summary: 'Batch jumlah vote per target (publik) - client memegang id dari word detail',
    request: {
      query: targetsQuerySchema,
    },
    responses: {
      200: { description: 'Counts per target (target tanpa vote = 0/0)', content: json(voteCountsResponseSchema) },
      400: { description: 'Format targets tidak valid', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak permintaan', content: json(errorResponseSchema) },
    },
  });

  const historyRoute = createRoute({
    method: 'get',
    path: '/history',
    tags: ['Votes'],
    summary: 'Riwayat vote milik user login (semua jenis target, lemma kata induk)',
    request: {
      query: voteHistoryQuerySchema,
    },
    responses: {
      200: { description: 'Daftar vote milik pemohon', content: json(voteHistoryResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak permintaan (100/menit per user)', content: json(errorResponseSchema) },
    },
  });

  const deckRoute = createRoute({
    method: 'get',
    path: '/deck',
    tags: ['Votes'],
    summary:
      'Antrean kata published yang user belum vote - deck nilai di tab Kontribusi (login)',
    request: {
      query: voteDeckQuerySchema,
    },
    responses: {
      200: { description: 'Daftar kartu deck', content: json(voteDeckResponseSchema) },
      400: { description: 'Query tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
      429: { description: 'Terlalu banyak permintaan (100/menit per user)', content: json(errorResponseSchema) },
    },
  });

  const myRoute = createRoute({
    method: 'get',
    path: '/my',
    tags: ['Votes'],
    summary: 'Vote milik user login untuk batch target - state tombol upvote/downvote di UI',
    request: {
      query: targetsQuerySchema,
    },
    responses: {
      200: { description: 'Vote user untuk target yang dipilih saja', content: json(myVotesResponseSchema) },
      400: { description: 'Format targets tidak valid', content: json(errorResponseSchema) },
      401: { description: 'Token tidak ada/invalid', content: json(errorResponseSchema) },
    },
  });

  routes.openapi(toggleRoute, (c) => deps.controller.toggle(c, c.req.valid('json')) as never);
  routes.openapi(countsRoute, (c) => deps.controller.counts(c, c.req.valid('query')) as never);
  routes.openapi(historyRoute, (c) => deps.controller.history(c, c.req.valid('query')) as never);
  routes.openapi(deckRoute, (c) => deps.controller.deck(c, c.req.valid('query')) as never);
  routes.openapi(myRoute, (c) => deps.controller.my(c, c.req.valid('query')) as never);

  return routes;
}
