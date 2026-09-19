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
        definition: 'Kata untuk di-bookmark',
        order_index: 1,
        translations: [{ language_id: IDN, translation_text: 'kata bookmark', translation_type: 'direct' }],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    status: 'published',
  };
}

describe.skipIf(!hasTestDb)('Bookmark E2E v1 - toggle + my (16 doc)', () => {
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

    const create = await post('/api/v1/admin/words', validWordBody('kata dibookmark'), adminToken);
    const { data } = await create.json();
    wordId = data.word_id as string;
  });

  it('ALUR PENUH: pasang → lepas (idempotent satu arah)', async () => {
    const bookmark = (token = contributorToken) => post('/api/v1/bookmarks', { word_id: wordId }, token);

    const on = await bookmark();
    expect(on.status).toBe(200);
    const onBody = await on.json();
    expect(onBody).toMatchObject({ success: true, data: { word_id: wordId, is_bookmarked: true } });
    expect(typeof onBody.data.bookmarked_at).toBe('string');

    const off = await bookmark(); // ulang = lepas
    expect(await off.json()).toMatchObject({
      data: { word_id: wordId, is_bookmarked: false, bookmarked_at: null },
    });
  });

  it('my dengan token → list membawa ringkasan kata + meta cursor; TANPA token → 401', async () => {
    await post('/api/v1/bookmarks', { word_id: wordId }, contributorToken);

    const res = await get('/api/v1/bookmarks/my?limit=10', contributorToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: [
        {
          word_id: wordId,
          word: { id: wordId, lemma: 'kata dibookmark', word_type: 'word' },
        },
      ],
      meta: { limit: 10, next_cursor: null, has_more: false },
    });

    expect((await get('/api/v1/bookmarks/my')).status).toBe(401);
  });

  it('my?word_ids= → mode cek status batch tanpa meta', async () => {
    const res = await get(`/api/v1/bookmarks/my?word_ids=${wordId}`, contributorToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((i: { word_id: string }) => i.word_id)).toEqual([wordId]);
    expect(body.meta).toBeUndefined();
  });

  it('kata tidak dikenal → 404 WORD_NOT_FOUND; format word_id salah → 400', async () => {
    const notFound = await post(
      '/api/v1/bookmarks',
      { word_id: ulid26('01U2EWORDNGACAK') },
      contributorToken,
    );
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error_code).toBe('WORD_NOT_FOUND');

    const bad = await post('/api/v1/bookmarks', { word_id: 'bogus' }, contributorToken);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error_code).toBe('VALIDATION_ERROR');
  });

  it('toggle tanpa token → 401', async () => {
    expect((await post('/api/v1/bookmarks', { word_id: wordId })).status).toBe(401);
  });
});
