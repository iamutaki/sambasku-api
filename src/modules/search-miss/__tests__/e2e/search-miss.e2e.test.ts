import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');

describe.skipIf(!hasTestDb)('Search Miss E2E - pencarian kosong jadi peluang kontribusi', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;

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
  const patch = (path: string, body: unknown, token?: string) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const get = (path: string, token?: string) =>
    request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users, languages, wordClasses } = await import('@/shared/database/drizzle/schema');
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values([
      { id: SMB, code: 'smb', name: 'Sambas' },
      { id: IDN, code: 'id', name: 'Indonesia' },
    ]);
    await db.insert(wordClasses).values({ id: NOMINA, code: 'n', name: 'Nomina' });

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    await post('/api/v1/auth/register', {
      name: `adm${stamp}`,
      email: `adm${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));
    adminToken = (
      (await (await post('/api/v1/auth/login', { email: `adm${stamp}@test.com`, password: 'Password123' })).json()).data
    ).access_token;
  });

  it('pencarian kosong tercatat → belum di beranda sampai tayang; terjawab → hilang', async () => {
    // 1. User A cari "Kalintiak" (belum ada) → 0 hasil
    const miss = await get('/api/v1/words/search?q=Kalintiak');
    expect(miss.status).toBe(200);
    expect((await miss.json()).data).toHaveLength(0);

    // 2. Cari sekali lagi (hit_count naik) - default is_visible=false → TIDAK di beranda
    await get('/api/v1/words/search?q=kalintiak');
    const berandaHidden = await get('/api/v1/search-misses?limit=10');
    expect(berandaHidden.status).toBe(200);
    expect(
      (await berandaHidden.json()).data.some((m: { term: string }) => m.term === 'kalintiak'),
    ).toBe(false);

    // 3. Panel admin melihat miss (is_visible false)
    const panel = await get('/api/v1/admin/search-misses', adminToken);
    const panelBody = await panel.json();
    const adminItem = panelBody.data.find((m: { term: string }) => m.term === 'kalintiak');
    expect(adminItem).toMatchObject({
      direction: 'lemma',
      is_fulfilled: false,
      is_visible: false,
      hit_count: 2,
    });

    // 4. Admin tayangkan → muncul di beranda
    const publish = await patch(
      `/api/v1/admin/search-misses/${adminItem.id}`,
      { is_visible: true },
      adminToken,
    );
    expect(publish.status).toBe(200);
    expect((await publish.json()).data.is_visible).toBe(true);

    const beranda = await get('/api/v1/search-misses?limit=10');
    const berandaBody = await beranda.json();
    const item = berandaBody.data.find((m: { term: string }) => m.term === 'kalintiak');
    expect(item).toMatchObject({ direction: 'lemma', is_fulfilled: false, hit_count: 2 });

    // 5. Kontributor (admin) mengisi kata itu → publish
    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'Kalintiak',
        word_type: 'word',
        category_ids: [],
        related_words: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'ikan sungai kecil',
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: 'ikan kecil', translation_type: 'direct' }],
          },
        ],
        status: 'published',
      },
      adminToken,
    );
    expect(create.status).toBe(201);

    // 6. Miss terjawab (derived): hilang dari beranda, ber-flag di panel admin
    const berandaAfter = await get('/api/v1/search-misses');
    expect(
      (await berandaAfter.json()).data.some((m: { term: string }) => m.term === 'kalintiak'),
    ).toBe(false);

    const panelAfter = await get('/api/v1/admin/search-misses', adminToken);
    const itemAfter = (await panelAfter.json()).data.find((m: { term: string }) => m.term === 'kalintiak');
    expect(itemAfter.is_fulfilled).toBe(true);
  });

  it('koreksi term + conflict unique', async () => {
    await get('/api/v1/words/search?q=roboi');
    await get('/api/v1/words/search?q=roboy');
    const panel = await get('/api/v1/admin/search-misses', adminToken);
    const body = await panel.json();
    const roboi = body.data.find((m: { term: string }) => m.term === 'roboi');
    const roboy = body.data.find((m: { term: string }) => m.term === 'roboy');
    expect(roboi).toBeTruthy();
    expect(roboy).toBeTruthy();

    const corrected = await patch(
      `/api/v1/admin/search-misses/${roboi.id}`,
      { term: 'Roboi Betul', is_visible: true },
      adminToken,
    );
    expect(corrected.status).toBe(200);
    const correctedBody = await corrected.json();
    expect(correctedBody.data.term).toBe('roboi betul');
    expect(correctedBody.data.is_visible).toBe(true);

    const beranda = await get('/api/v1/search-misses');
    expect(
      (await beranda.json()).data.some((m: { term: string }) => m.term === 'roboi betul'),
    ).toBe(true);

    const conflict = await patch(
      `/api/v1/admin/search-misses/${roboy.id}`,
      { term: 'roboi betul' },
      adminToken,
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error_code).toBe('SEARCH_MISS_TERM_CONFLICT');
  });

  it('dismiss miss dari panel admin → hilang dari kedua daftar; id ngawur → 404', async () => {
    await get('/api/v1/words/search?q=miyang');
    const panel = await get('/api/v1/admin/search-misses', adminToken);
    const item = (await panel.json()).data.find((m: { term: string }) => m.term === 'miyang');

    await patch(`/api/v1/admin/search-misses/${item.id}`, { is_visible: true }, adminToken);

    const dismiss = await post(`/api/v1/admin/search-misses/${item.id}/dismiss`, {}, adminToken);
    expect(dismiss.status).toBe(200);

    const beranda = await get('/api/v1/search-misses');
    expect((await beranda.json()).data.some((m: { term: string }) => m.term === 'miyang')).toBe(false);

    const bogus = await post(`/api/v1/admin/search-misses/${ulid26('01E2ENGACAK')}/dismiss`, {}, adminToken);
    expect(bogus.status).toBe(404);
    expect((await bogus.json()).error_code).toBe('SEARCH_MISS_NOT_FOUND');
  });

  it('query terlalu pendek (<2 karakter) tidak dicatat; tanpa token panel admin → 401', async () => {
    await get('/api/v1/words/search?q=a');
    const beranda = await get('/api/v1/search-misses');
    expect((await beranda.json()).data.some((m: { term: string }) => m.term === 'a')).toBe(false);

    expect((await get('/api/v1/admin/search-misses')).status).toBe(401);
  });

  it('resolve as variant → miss fulfilled tanpa buat lemma baru', async () => {
    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'ketek',
        word_type: 'word',
        category_ids: [],
        related_words: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'kera',
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: 'monyet', translation_type: 'direct' }],
          },
        ],
        status: 'published',
      },
      adminToken,
    );
    expect(create.status).toBe(201);
    const wordId = (await create.json()).data.word_id;

    await get("/api/v1/words/search?q=kete'");
    const panel = await get('/api/v1/admin/search-misses', adminToken);
    const miss = (await panel.json()).data.find((m: { term: string }) => m.term === "kete'");
    expect(miss).toBeTruthy();
    expect(miss.is_fulfilled).toBe(false);

    const resolve = await post(
      `/api/v1/admin/search-misses/${miss.id}/resolve`,
      { action: 'variant', word_id: wordId },
      adminToken,
    );
    expect(resolve.status).toBe(200);
    const body = await resolve.json();
    expect(body.data).toMatchObject({
      resolved_as: 'variant',
      target_word_id: wordId,
      is_fulfilled: true,
    });
    expect(body.data.variant_id).toBeTruthy();

    const panelAfter = await get('/api/v1/admin/search-misses', adminToken);
    const after = (await panelAfter.json()).data.find((m: { term: string }) => m.term === "kete'");
    expect(after.is_fulfilled).toBe(true);

    // pencarian lewat varian harus menemukan kata
    const search = await get("/api/v1/words/search?q=kete'");
    expect(search.status).toBe(200);
    const found = (await search.json()).data.some(
      (w: { id: string; lemma: string }) => w.id === wordId || w.lemma === 'ketek',
    );
    expect(found).toBe(true);
  });
});
