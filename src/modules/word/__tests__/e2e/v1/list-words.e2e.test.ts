import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E3ELANGSMB');
const IDN = ulid26('01E3ELANGIDN');
const NOMINA = ulid26('01E3EWCNOMINA');
const MAKANAN = ulid26('01E3ECATMAKANAN');

describe.skipIf(!hasTestDb)('List Words A-Z E2E v1 (18 doc) - GET /api/v1/words', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

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

  const get = (path: string) => request(path);

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users, languages, wordClasses, categories, words } = await import(
      '@/shared/database/drizzle/schema'
    );
    db = getTestDb();
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
    const email = `az${stamp}@test.com`;
    await post('/api/v1/auth/register', {
      name: `az${stamp}`,
      email,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, email));
    const login = await post('/api/v1/auth/login', { email, password: 'Password123' });
    adminToken = ((await login.json()) as { data: { access_token: string } }).data.access_token;

    const wordBody = (lemma: string) => ({
      language_id: SMB,
      lemma,
      meanings: [
        {
          word_class_id: NOMINA,
          definition: 'Kata uji list A-Z',
          order_index: 1,
          translations: [{ language_id: IDN, translation_text: lemma, translation_type: 'direct' }],
        },
      ],
      word_type: 'word',
      category_ids: [MAKANAN],
      related_words: [],
      variants: [],
      status: 'published',
    });

    // urutan insert sengaja acak - endpoint wajib urut lemma ASC
    for (const lemma of ['capai', 'apam', 'budu']) {
      const res = await post('/api/v1/admin/words', wordBody(lemma), adminToken);
      expect(res.status).toBe(201);
    }

    // draft langsung via DB - TIDAK boleh muncul di list publik
    await db.insert(words).values({
      id: ulid26('01E3DRAFTZETA'),
      languageId: SMB,
      lemma: 'zeta',
      status: 'draft',
    });
  });

  it('guest tanpa token → 200, urut A-Z, envelope + meta standar, draft tidak muncul', async () => {
    const res = await get('/api/v1/words?limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: Array<{ lemma: string; status: string; language_code: string }>;
      meta: { limit: number; next_cursor: string | null; has_more: boolean };
    };
    expect(body.success).toBe(true);
    expect(body.data.map((w) => w.lemma)).toEqual(['apam', 'budu', 'capai']);
    expect(body.data.every((w) => w.status === 'published')).toBe(true);
    expect(body.data[0]!.language_code).toBe('smb');
    expect(body.meta).toEqual({ limit: 10, next_cursor: null, has_more: false });
  });

  it('pagination: limit 2 → has_more; halaman 2 via next_cursor lanjut tanpa duplikat', async () => {
    const p1 = await get('/api/v1/words?limit=2');
    expect(p1.status).toBe(200);
    const b1 = (await p1.json()) as {
      data: Array<{ lemma: string; id: string }>;
      meta: { next_cursor: string | null; has_more: boolean };
    };
    expect(b1.data.map((w) => w.lemma)).toEqual(['apam', 'budu']);
    expect(b1.meta.has_more).toBe(true);
    expect(typeof b1.meta.next_cursor).toBe('string');

    const p2 = await get(`/api/v1/words?limit=2&cursor=${encodeURIComponent(b1.meta.next_cursor!)}`);
    expect(p2.status).toBe(200);
    const b2 = (await p2.json()) as {
      data: Array<{ lemma: string; id: string }>;
      meta: { next_cursor: string | null; has_more: boolean };
    };
    expect(b2.data.map((w) => w.lemma)).toEqual(['capai']);
    expect(b2.meta).toEqual({ limit: 2, next_cursor: null, has_more: false });

    const ids = [...b1.data, ...b2.data].map((w) => w.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('q memfilter server-side (ILIKE, tanpa search-miss baru)', async () => {
    const { searchMisses } = await import('@/shared/database/drizzle/schema');
    const before = (await db.select().from(searchMisses)).length;

    const res = await get('/api/v1/words?q=apam&limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ lemma: string }> };
    expect(body.data.map((w) => w.lemma)).toEqual(['apam']);

    // q tanpa hasil juga TIDAK boleh merekam miss (browsing bukan pencarian)
    const miss = await get('/api/v1/words?q=zzzztidakada&limit=10');
    expect(miss.status).toBe(200);
    const after = (await db.select().from(searchMisses)).length;
    expect(after).toBe(before);
  });

  it('cursor invalid → 400 VALIDATION_ERROR details cursor; limit 0 → 400', async () => {
    const bad = await get('/api/v1/words?cursor=bukan-cursor%21%21');
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as {
      error_code: string;
      details: Array<{ field: string; message: string }>;
    };
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.details?.[0]?.field).toBe('cursor');

    const zero = await get('/api/v1/words?limit=0');
    expect(zero.status).toBe(400);
  });
});
