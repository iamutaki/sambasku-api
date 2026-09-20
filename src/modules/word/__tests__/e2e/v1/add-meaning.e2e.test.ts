import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed?.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');

// 17-api-usul-definisi.md: siklus penuh "belum bisa definisi" - create
// placeholder "-" → kontribusi definisi (contributor, antrean) → approve →
// definisi tayang + placeholder dibersihkan.
describe.skipIf(!hasTestDb)('Add Meaning E2E v1 - kontribusi definisi (17 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let wordId: string;
  let pendingMeaningId: string;

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
    for (const [prefix, email, role] of [
      ['adm', `adm${stamp}@test.com`, 'admin'],
      ['kon', `kon${stamp}@test.com`, 'contributor'],
    ] as const) {
      await post('/api/v1/auth/register', {
        name: `${prefix}${stamp}`,
        email,
        password: 'Password123',
        confirm_password: 'Password123',
      });
      if (role !== 'contributor') {
        await db.update(users).set({ role }).where(eq(users.email, email));
      }
    }
    const login = async (email: string) =>
      (await (await post('/api/v1/auth/login', { email, password: 'Password123' })).json()).data.access_token;
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);

    // Kata published TANPA definisi - placeholder "-" (checkbox mobile).
    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'bahal',
        word_type: 'word',
        category_ids: [],
        related_words: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: '-',
            is_have_definition: false,
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: '-', translation_type: 'direct' }],
          },
        ],
        status: 'published',
      },
      adminToken,
    );
    wordId = (await create.json()).data.word_id;
  });

  it('detail publik menampilkan placeholder + flag is_have_definition=false', async () => {
    const res = await get(`/api/v1/words/${wordId}`);
    const body = await res.json();
    expect(body.data.meanings).toHaveLength(1);
    expect(body.data.meanings[0]).toMatchObject({
      definition: '-',
      is_have_definition: false,
    });
  });

  it('kontribusi definisi (contributor) → 201 pending_review, TIDAK tampil di detail publik', async () => {
    const res = await post(
      `/api/v1/words/${wordId}/meanings`,
      {
        word_class_id: NOMINA,
        definition: 'kondisi tidak benar, rusak',
        translations: [{ language_id: IDN, translation_text: 'rusak', translation_type: 'direct' }],
      },
      contributorToken,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ word_id: wordId, status: 'pending_review', is_verified: false });
    expect(body.data.order_index).toBeGreaterThan(1);
    pendingMeaningId = body.data.id;

    const detail = await get(`/api/v1/words/${wordId}`);
    const detailBody = await detail.json();
    // pending tidak bocor; placeholder masih satu-satunya yang tayang
    expect(detailBody.data.meanings).toHaveLength(1);
    expect(detailBody.data.meanings[0].is_have_definition).toBe(false);

    // antrean admin membawa entity_type meaning + detail payload
    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=meaning', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === pendingMeaningId);
    expect(item).toMatchObject({ entity_type: 'meaning', status: 'pending' });

    const detailKontribusi = await get(`/api/v1/admin/contributions/${item.id}`, adminToken);
    const detailBody2 = await detailKontribusi.json();
    expect(detailBody2.data.entity.data).toMatchObject({ definition: 'kondisi tidak benar, rusak' });
  });

  it('approve → definisi tayang + placeholder "-" dibersihkan', async () => {
    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=meaning', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === pendingMeaningId);

    const approve = await post(`/api/v1/admin/contributions/${item.id}/approve`, { comment: 'valid' }, adminToken);
    expect(approve.status).toBe(200);
    expect((await approve.json()).data).toMatchObject({ status: 'approved', entity_type: 'meaning' });

    const detail = await get(`/api/v1/words/${wordId}`);
    const detailBody = await detail.json();
    expect(detailBody.data.meanings).toHaveLength(1);
    expect(detailBody.data.meanings[0]).toMatchObject({
      definition: 'kondisi tidak benar, rusak',
      is_have_definition: true,
    });
  });

  it('definisi oleh admin → 201 published langsung + tampil', async () => {
    const res = await post(
      `/api/v1/words/${wordId}/meanings`,
      {
        word_class_id: NOMINA,
        definition: 'tidak lazim, aneh',
        translations: [{ language_id: IDN, translation_text: 'aneh', translation_type: 'direct' }],
      },
      adminToken,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ status: 'published', is_verified: true });

    const detail = await get(`/api/v1/words/${wordId}`);
    const meanings = (await detail.json()).data.meanings;
    expect(meanings).toHaveLength(2);
    expect(meanings.some((m: { definition: string }) => m.definition === 'tidak lazim, aneh')).toBe(true);
  });

  it('kata tidak ada → 404 WORD_NOT_FOUND; tanpa token → 401; body kosong → 400', async () => {
    const noWord = await post(
      `/api/v1/words/${ulid26('01E2EWORDNGACAK')}/meanings`,
      { definition: 'x', translations: [{ language_id: IDN, translation_text: 'x' }] },
      adminToken,
    );
    expect(noWord.status).toBe(404);
    expect((await noWord.json()).error_code).toBe('WORD_NOT_FOUND');

    const noToken = await post(
      `/api/v1/words/${wordId}/meanings`,
      { definition: 'x', translations: [{ language_id: IDN, translation_text: 'x' }] },
    );
    expect(noToken.status).toBe(401);

    const bad = await post(
      `/api/v1/words/${wordId}/meanings`,
      { definition: '', translations: [] },
      adminToken,
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error_code).toBe('VALIDATION_ERROR');
  });
});
