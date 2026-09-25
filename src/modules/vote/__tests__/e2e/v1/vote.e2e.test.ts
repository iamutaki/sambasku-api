import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01U2ELANGSMB');
const IDN = ulid26('01U2ELANGIDN');
const NOMINA = ulid26('01U2EWCNOMINA');
const MAKANAN = ulid26('01U2ECATMAKANAN');

function validWordBody(lemma: string) {
  return {
    language_id: SMB,
    lemma,
    meanings: [
      {
        word_class_id: NOMINA,
        definition: 'Kata untuk di-vote',
        order_index: 1,
        translations: [{ language_id: IDN, translation_text: 'kata vote', translation_type: 'direct' }],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    status: 'published',
  };
}

describe.skipIf(!hasTestDb)('Vote E2E v1 - toggle + counts + my (08 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let wordId: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const post = (path: string, body: unknown, token?: string) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const get = (path: string, token?: string) =>
    request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users, languages, wordClasses, categories } = await import(
      '@/shared/database/drizzle/schema'
    );
    const db = getTestDb();
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    await truncateAll(db);

    await db.insert(languages).values([
      { id: SMB, code: 'smb', name: 'Sambas' },
      { id: IDN, code: 'id', name: 'Indonesia' },
    ]);
    await db.insert(wordClasses).values({ id: NOMINA, code: 'n', name: 'Nomina' });
    await db.insert(categories).values({ id: MAKANAN, name: 'Makanan' });

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    await post('/api/v1/auth/register', {
      name: `adm${stamp}`,
      email: `adm${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await post('/api/v1/auth/register', {
      name: `kon${stamp}`,
      email: `kon${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ emailVerified: true });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));

    const login = async (email: string) => {
      const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
      return ((await res.json()) as { data: { access_token: string } }).data.access_token;
    };
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);

    const create = await post('/api/v1/admin/words', validWordBody('kata divote'), adminToken);
    const { data } = await create.json();
    wordId = data.word_id as string;
  });

  it('ALUR PENUH: upvote → toggle ulang batal → ganti arah downvote', async () => {
    const vote = (value: 1 | -1, token = contributorToken) =>
      post('/api/v1/votes', { target_type: 'word', target_id: wordId, value }, token);

    const on = await vote(1);
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({
      success: true,
      data: { target_type: 'word', target_id: wordId, my_vote: 1, upvotes: 1, downvotes: 0 },
    });

    const off = await vote(1); // searah kedua kali = batal
    expect(await off.json()).toMatchObject({
      data: { my_vote: null, upvotes: 0, downvotes: 0 },
    });

    const down = await vote(-1); // beda arah = replace
    expect(await down.json()).toMatchObject({
      data: { my_vote: -1, upvotes: 0, downvotes: 1 },
    });
  });

  it('counts publik TANPA token → 200 membawa counts target', async () => {
    const res = await get(`/api/v1/votes/counts?targets=word:${wordId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: [{ target_type: 'word', target_id: wordId, upvotes: 0, downvotes: 1 }],
    });
  });

  it('my dengan token → vote user terlihat; TANPA token → 401', async () => {
    const res = await get(`/api/v1/votes/my?targets=word:${wordId}`, contributorToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: [{ target_type: 'word', target_id: wordId, value: -1 }],
    });

    expect((await get(`/api/v1/votes/my?targets=word:${wordId}`)).status).toBe(401);
  });

  it('toggle target tidak dikenal → 404 VOTE_TARGET_NOT_FOUND', async () => {
    const res = await post(
      '/api/v1/votes',
      { target_type: 'word', target_id: ulid26('01U2EWORDNGACAK'), value: 1 },
      contributorToken,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error_code).toBe('VOTE_TARGET_NOT_FOUND');
  });

  it('target_type tidak dikenal → 400 VALIDATION_ERROR', async () => {
    const res = await post(
      '/api/v1/votes',
      { target_type: 'peribahasa', target_id: wordId, value: 1 },
      contributorToken,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error_code).toBe('VALIDATION_ERROR');
  });

  it('toggle tanpa token → 401; format targets salah → 400', async () => {
    expect((await post('/api/v1/votes', { target_type: 'word', target_id: wordId, value: 1 })).status).toBe(401);

    const bad = await get('/api/v1/votes/counts?targets=bogus');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error_code).toBe('VALIDATION_ERROR');
  });

  it('GET /votes/my tanpa targets tetap 400; history milik pemohon saja', async () => {
    expect((await get('/api/v1/votes/my', contributorToken)).status).toBe(400);
    expect((await get('/api/v1/votes/history')).status).toBe(401);

    await post('/api/v1/votes', { target_type: 'word', target_id: wordId, value: 1 }, adminToken);

    const mine = await get('/api/v1/votes/history', contributorToken);
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as {
      data: { value: number; target_type: string; word: { lemma: string } | null }[];
      meta: { has_more: boolean };
    };
    expect(body.data.every((row) => row.value === -1)).toBe(true);
    expect(body.data[0].word?.lemma).toBe('kata divote');
    expect(body.meta.has_more).toBe(false);

    const adminHist = await get('/api/v1/votes/history?value=1&target_type=word', adminToken);
    const adminBody = (await adminHist.json()) as { data: { value: number; target_type: string }[] };
    expect(adminBody.data).toEqual([expect.objectContaining({ value: 1, target_type: 'word' })]);
  });

  it('history: cursor has_more; word null setelah kata di-soft-delete', async () => {
    const created = await post(
      `/api/v1/words/${wordId}/comments`,
      { body: 'komentar untuk vote history' },
      contributorToken,
    );
    const commentId = ((await created.json()) as { data: { id: string } }).data.id;
    await post('/api/v1/votes', { target_type: 'comment', target_id: commentId, value: 1 }, contributorToken);

    const page1 = await get('/api/v1/votes/history?limit=1', contributorToken);
    const b1 = (await page1.json()) as {
      data: { id: string; target_type: string }[];
      meta: { next_cursor: string | null; has_more: boolean; limit: number };
    };
    expect(b1.meta).toMatchObject({ limit: 1, has_more: true });
    expect(b1.data[0].target_type).toBe('comment');

    const page2 = await get(
      `/api/v1/votes/history?limit=1&cursor=${b1.meta.next_cursor}`,
      contributorToken,
    );
    const b2 = (await page2.json()) as { data: { id: string }[] };
    expect(b2.data[0].id).not.toBe(b1.data[0].id);

    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { words } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();
    await db.update(words).set({ deletedAt: new Date() }).where(eq(words.id, wordId));

    const after = await get('/api/v1/votes/history?target_type=word', contributorToken);
    const afterBody = (await after.json()) as { data: { word: null }[] };
    expect(afterBody.data.length).toBeGreaterThan(0);
    expect(afterBody.data.every((row) => row.word === null)).toBe(true);
  });

  it('translation_help_reply: vote published → 200; taken_down → 404; detail counts', async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { translationHelps, translationHelpReplies, users } = await import(
      '@/shared/database/drizzle/schema'
    );
    const db = getTestDb();

    const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
    const askerId = allUsers.find((u) => u.role === 'contributor')!.id;
    const adminId = allUsers.find((u) => u.role === 'admin')!.id;
    const helpId = ulid26('01U2EHELPVOTE');
    const replyOk = ulid26('01U2EREPLYOKv');
    const replyDown = ulid26('01U2EREPLYDNv');

    await db.insert(translationHelps).values({
      id: helpId,
      userId: askerId,
      body: 'Bantuan untuk vote e2e',
      images: [],
      status: 'published',
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });
    await db.insert(translationHelpReplies).values([
      {
        id: replyOk,
        helpId,
        userId: askerId,
        body: 'Jawaban bagus',
        status: 'published',
      },
      {
        id: replyDown,
        helpId,
        userId: askerId,
        body: 'Jawaban diturunkan',
        status: 'taken_down',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    ]);

    const voted = await post(
      '/api/v1/votes',
      { target_type: 'translation_help_reply', target_id: replyOk, value: 1 },
      contributorToken,
    );
    expect(voted.status).toBe(200);
    expect(await voted.json()).toMatchObject({
      success: true,
      data: {
        target_type: 'translation_help_reply',
        target_id: replyOk,
        my_vote: 1,
        upvotes: 1,
        downvotes: 0,
      },
    });

    const bad = await post(
      '/api/v1/votes',
      { target_type: 'translation_help_reply', target_id: replyDown, value: 1 },
      contributorToken,
    );
    expect(bad.status).toBe(404);
    expect((await bad.json()).error_code).toBe('VOTE_TARGET_NOT_FOUND');

    const detail = await get(`/api/v1/translation-helps/${helpId}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      data: { replies: { id: string; upvotes: number; downvotes: number }[] };
    };
    const ok = body.data.replies.find((r) => r.id === replyOk);
    expect(ok).toMatchObject({ upvotes: 1, downvotes: 0 });
  });

  it('translation_help: upvote pertanyaan → 200; downvote → 400; sort popular', async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { translationHelps, users } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();

    const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
    const askerId = allUsers.find((u) => u.role === 'contributor')!.id;
    const adminId = allUsers.find((u) => u.role === 'admin')!.id;
    const helpId = ulid26('01U2EHELPASK');

    await db.insert(translationHelps).values({
      id: helpId,
      userId: askerId,
      body: 'Pertanyaan untuk upvote',
      images: [],
      status: 'published',
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    const voted = await post(
      '/api/v1/votes',
      { target_type: 'translation_help', target_id: helpId, value: 1 },
      contributorToken,
    );
    expect(voted.status).toBe(200);
    expect(await voted.json()).toMatchObject({
      success: true,
      data: {
        target_type: 'translation_help',
        target_id: helpId,
        my_vote: 1,
        upvotes: 1,
      },
    });

    const down = await post(
      '/api/v1/votes',
      { target_type: 'translation_help', target_id: helpId, value: -1 },
      contributorToken,
    );
    expect(down.status).toBe(400);
    expect((await down.json()).error_code).toBe('VALIDATION_ERROR');

    const detail = await get(`/api/v1/translation-helps/${helpId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      data: { id: helpId, upvotes: 1 },
    });

    const popular = await get('/api/v1/translation-helps?sort=popular&limit=5');
    expect(popular.status).toBe(200);
    const popBody = (await popular.json()) as { data: { id: string; upvotes: number }[] };
    expect(popBody.data[0]).toMatchObject({ id: helpId, upvotes: 1 });
  });

  it('GET /votes/deck: 401 tanpa token; login lihat kata; vote → hilang dari deck', async () => {
    expect((await get('/api/v1/votes/deck')).status).toBe(401);

    // Kata baru — fixture `wordId` sudah di-vote di tes sebelumnya.
    const create = await post('/api/v1/admin/words', validWordBody('kata deck'), adminToken);
    expect(create.status).toBe(201);
    const deckWordId = ((await create.json()) as { data: { word_id: string } }).data.word_id;

    const deck1 = await get('/api/v1/votes/deck?limit=10', contributorToken);
    expect(deck1.status).toBe(200);
    const body1 = (await deck1.json()) as {
      success: boolean;
      data: { id: string; lemma: string; sense: string | null }[];
      meta: { limit: number; has_more: boolean; next_cursor: string | null };
    };
    expect(body1.success).toBe(true);
    expect(body1.meta.limit).toBe(10);
    expect(body1.data.some((w) => w.id === deckWordId)).toBe(true);
    const card = body1.data.find((w) => w.id === deckWordId);
    expect(card?.lemma).toBe('kata deck');
    expect(card?.sense).toBeTruthy();

    await post(
      '/api/v1/votes',
      { target_type: 'word', target_id: deckWordId, value: 1 },
      contributorToken,
    );

    const deck2 = await get('/api/v1/votes/deck?limit=10', contributorToken);
    expect(deck2.status).toBe(200);
    const body2 = (await deck2.json()) as { data: { id: string }[] };
    expect(body2.data.some((w) => w.id === deckWordId)).toBe(false);
  });
});
