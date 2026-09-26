import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { e2eRegisterBody } from '@/shared/testing/e2e-auth';

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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    language_id: SMB,
    lemma: 'makatn',
    meanings: [
      {
        word_class_id: NOMINA,
        definition: 'Aktivitas memasukkan makanan ke mulut',
        order_index: 1,
        translations: [
          { language_id: IDN, translation_text: 'makan', translation_type: 'direct' },
        ],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    status: 'published',
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)('Word E2E v1 - Edit Kata (05 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;

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

  const put = (path: string, body: unknown, token?: string) =>
    request(path, {
      method: 'PUT',
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
    await post('/api/v1/auth/register', e2eRegisterBody({
        name: `adm${stamp}`,
        email: `adm${stamp}@test.com`,
    }));
    await post('/api/v1/auth/register', e2eRegisterBody({
        name: `kon${stamp}`,
        email: `kon${stamp}@test.com`,
    }));
    await db.update(users).set({ emailVerified: true });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));

    const login = async (email: string) => {
      const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
      return ((await res.json()) as { data: { access_token: string } }).data.access_token;
    };
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);
  });

  it('ALUR PENUH: create → GET admin prefill → PUT edit → perubahan terpantau publik', async () => {
    const create = await post('/api/v1/admin/words', validBody(), adminToken);
    const { data } = await create.json();
    const id = data.word_id as string;

    // prefill admin: terbaca + jejak waktu
    const prefill = await get(`/api/v1/admin/words/${id}`, adminToken);
    expect(prefill.status).toBe(200);
    const prefillBody = await prefill.json();
    expect(prefillBody.data.lemma).toBe('makatn');
    expect(typeof prefillBody.data.created_at).toBe('string');

    // PUT full replace: lemma & definisi baru, category dikosongkan
    const res = await put(
      `/api/v1/admin/words/${id}`,
      validBody({
        lemma: 'makatn edit',
        notes: 'catatan hasil edit',
        category_ids: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'Definisi revisi',
            order_index: 1,
            translations: [
              { language_id: IDN, translation_text: 'makan (revisi)', translation_type: 'direct' },
            ],
          },
        ],
      }),
      adminToken,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      word_id: id,
      lemma: 'makatn edit',
      status: 'published', // admin + published → self-verified (flow sama dengan add)
      is_verified: true,
    });
    expect(body.data.updated_at).toEqual(expect.any(String));
    expect(body.data.warnings).toBeUndefined(); // diri sendiri tidak dihitung duplikat

    // publik memantulkan hasil edit (full replace: kategori hilang)
    const detail = await get(`/api/v1/words/${id}`);
    const detailBody = await detail.json();
    expect(detailBody.data.lemma).toBe('makatn edit');
    expect(detailBody.data.meanings[0].definition).toBe('Definisi revisi');
    expect(detailBody.data.categories).toEqual([]);
  });

  it('GET admin detail membuka DRAFT (publik 404) - prefill jujur', async () => {
    const create = await post(
      '/api/v1/admin/words',
      validBody({ lemma: 'rahasia', status: 'draft' }),
      adminToken,
    );
    const { data } = await create.json();

    const publik = await get(`/api/v1/words/${data.word_id}`);
    expect(publik.status).toBe(404);

    const admin = await get(`/api/v1/admin/words/${data.word_id}`, adminToken);
    expect(admin.status).toBe(200);
    expect((await admin.json()).data.status).toBe('draft');
  });

  it('PUT draft yang di-publish admin → hidup di endpoint publik', async () => {
    const create = await post(
      '/api/v1/admin/words',
      validBody({ lemma: 'draft dipublish', status: 'draft' }),
      adminToken,
    );
    const { data } = await create.json();

    const res = await put(
      `/api/v1/admin/words/${data.word_id}`,
      validBody({ lemma: 'draft dipublish', status: 'published' }),
      adminToken,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('published');

    const publik = await get(`/api/v1/words/${data.word_id}`);
    expect(publik.status).toBe(200);
  });

  it('PUT id tidak dikenal → 404 WORD_NOT_FOUND', async () => {
    const res = await put(`/api/v1/admin/words/${ulid26('01U2EWORDNGACAK')}`, validBody(), adminToken);
    expect(res.status).toBe(404);
    expect((await res.json()).error_code).toBe('WORD_NOT_FOUND');
  });

  it('PUT contributor → 403 (perubahan existing = jalur antrean review)', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'target contributor' }), adminToken);
    const { data } = await create.json();

    const res = await put(`/api/v1/admin/words/${data.word_id}`, validBody(), contributorToken);
    expect(res.status).toBe(403);
    expect((await res.json()).error_code).toBe('FORBIDDEN');
  });

  it('PUT Form B (kata inline) → 400 dengan pesan arahkan ke POST', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'target form b' }), adminToken);
    const { data } = await create.json();

    const res = await put(
      `/api/v1/admin/words/${data.word_id}`,
      validBody({
        related_words: [{ relation_type: 'synonym', word: { lemma: 'ngamakn' } }],
      }),
      adminToken,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.details[0].message).toContain('POST /admin/words');
  });

  it('PUT lemma jadi sama dengan kata LAIN → warnings duplikat (non-blokir)', async () => {
    await post('/api/v1/admin/words', validBody({ lemma: 'pesaing' }), adminToken);
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'asli' }), adminToken);
    const { data } = await create.json();

    const res = await put(
      `/api/v1/admin/words/${data.word_id}`,
      validBody({ lemma: 'Pesaing' }), // case-insensitive
      adminToken,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Admin + published: auto-merge ke kembaran tayang
    expect(body.data.warnings).toEqual([
      {
        field: 'lemma',
        message:
          'Lemma ini sudah ada. Makna baru digabung otomatis ke entri yang sudah tayang.',
      },
    ]);
  });

  it('PUT tanpa token → 401', async () => {
    const res = await put(`/api/v1/admin/words/${ulid26('01U2EWORDAPA')}`, validBody());
    expect(res.status).toBe(401);
  });
});
