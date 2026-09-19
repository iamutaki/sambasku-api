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
});
