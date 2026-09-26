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
    lemma: 'hapusaku',
    meanings: [
      {
        word_class_id: NOMINA,
        definition: 'Kata yang akan di-soft-delete',
        order_index: 1,
        translations: [
          { language_id: IDN, translation_text: 'hapus aku', translation_type: 'direct' },
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

describe.skipIf(!hasTestDb)('Word E2E v1 - Soft-delete kata (07 doc)', () => {
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

  const del = (path: string, token?: string) =>
    request(path, { method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {} });

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

  it('ALUR PENUH: create → DELETE → hilang dari publik & admin; audit tercatat', async () => {
    const create = await post('/api/v1/admin/words', validBody(), adminToken);
    const { data } = await create.json();
    const id = data.word_id as string;

    // hidup dulu di publik
    const before = await get(`/api/v1/words/${id}`);
    expect(before.status).toBe(200);

    const res = await del(`/api/v1/admin/words/${id}`, adminToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();

    // hilang dari publik DAN dari admin (soft-deleted terfilter semua query)
    expect((await get(`/api/v1/words/${id}`)).status).toBe(404);
    expect((await get(`/api/v1/admin/words/${id}`, adminToken)).status).toBe(404);

    // audit trail: action delete dengan old_data snapshot
    const logs = await get('/api/v1/admin/audit-logs', adminToken);
    const logBody = await logs.json();
    const deleteLog = logBody.data.find(
      (l: { entity_type: string; action: string }) => l.entity_type === 'word' && l.action === 'delete',
    );
    expect(deleteLog).toBeDefined();
    expect(deleteLog.entity_id).toBe(id);
    expect(deleteLog.old_data.lemma).toBe('hapusaku');
  });

  it('kata yang sudah dihapus → 404 (idempotent - bukan 200)', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'hapus dua kali' }), adminToken);
    const { data } = await create.json();

    expect((await del(`/api/v1/admin/words/${data.word_id}`, adminToken)).status).toBe(200);
    expect((await del(`/api/v1/admin/words/${data.word_id}`, adminToken)).status).toBe(404);
  });

  it('DELETE id tidak dikenal → 404 WORD_NOT_FOUND', async () => {
    const res = await del(`/api/v1/admin/words/${ulid26('01U2EWORDNGACAK')}`, adminToken);
    expect(res.status).toBe(404);
    expect((await res.json()).error_code).toBe('WORD_NOT_FOUND');
  });

  it('DELETE contributor → 403 (verifier team saja, konsisten dengan edit)', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'target delete contributor' }), adminToken);
    const { data } = await create.json();

    const res = await del(`/api/v1/admin/words/${data.word_id}`, contributorToken);
    expect(res.status).toBe(403);
    expect((await res.json()).error_code).toBe('FORBIDDEN');
  });

  it('DELETE tanpa token → 401', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'target delete anon' }), adminToken);
    const { data } = await create.json();

    const res = await del(`/api/v1/admin/words/${data.word_id}`);
    expect(res.status).toBe(401);
  });

  it('DRAFT juga bisa dihapus (semua status boleh dihapus)', async () => {
    const create = await post(
      '/api/v1/admin/words',
      validBody({ lemma: 'draft mau dihapus', status: 'draft' }),
      adminToken,
    );
    const { data } = await create.json();

    const res = await del(`/api/v1/admin/words/${data.word_id}`, adminToken);
    expect(res.status).toBe(200);

    // tidak bisa diedit lagi - findById terfilter soft-deleted → 404
    expect((await get(`/api/v1/admin/words/${data.word_id}`, adminToken)).status).toBe(404);
  });
});