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
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');
const MAKANAN = ulid26('01E2ECATMAKANAN');

function wordBody(lemma: string) {
  return {
    language_id: SMB,
    lemma,
    meanings: [
      {
        word_class_id: NOMINA,
        definition: `Definisi ${lemma}`,
        order_index: 1,
        translations: [{ language_id: IDN, translation_text: 'makan', translation_type: 'direct' }],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    status: 'published',
  };
}

describe.skipIf(!hasTestDb)('Dashboard Stats E2E', () => {
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

  const login = async (email: string) => {
    const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
    const body = await res.json();
    return body.data.access_token as string;
  };

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
        name: `dshadm${stamp}`,
        email: `dshadm${stamp}@test.com`,
    }));
    await post('/api/v1/auth/register', e2eRegisterBody({
        name: `dshkon${stamp}`,
        email: `dshkon${stamp}@test.com`,
    }));
    await db.update(users).set({ emailVerified: true });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `dshadm${stamp}@test.com`));

    adminToken = await login(`dshadm${stamp}@test.com`);
    contributorToken = await login(`dshkon${stamp}@test.com`);
  });

  it('GET /api/v1/admin/dashboard/stats (admin) → 200 struktur lengkap + angka akurat', async () => {
    // Satu kata published oleh admin → masuk hitungan total + status published
    const create = await post('/api/v1/admin/words', wordBody('makatn'), adminToken);
    expect(create.status).toBe(201);

    const res = await request('/api/v1/admin/dashboard/stats', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const d = body.data;
    expect(typeof d.words.total).toBe('number');
    expect(d.words.total).toBeGreaterThanOrEqual(1);
    expect(d.words.by_status.published).toBeGreaterThanOrEqual(1);
    for (const key of ['draft', 'pending_review', 'published', 'rejected']) {
      expect(typeof d.words.by_status[key]).toBe('number');
    }
    expect(typeof d.words.verified).toBe('number');

    // membuat kata otomatis merekam kontribusi action=create status=approved
    expect(d.contributions.by_status.approved).toBe(1);
    expect(d.contributions.by_status).toMatchObject({ pending: 0, rejected: 0, corrected: 0 });
    expect(d.contributions.total).toBe(1);

    // register mencipta 2 user aktif: admin (role di-upgrade) + contributor
    expect(d.users.active).toBe(2);
    expect(d.users.by_role.admin).toBe(1);
    expect(d.users.by_role.contributor).toBe(1);

    expect(typeof d.activity.audit_logs_last_7_days).toBe('number');
  });

  it('contributor (login) juga boleh akses - dashboard adalah halaman pertama semua role', async () => {
    const res = await request('/api/v1/admin/dashboard/stats', {
      headers: { authorization: `Bearer ${contributorToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('tanpa token → 401', async () => {
    const res = await request('/api/v1/admin/dashboard/stats');
    expect(res.status).toBe(401);
    expect((await res.json()).error_code).toBe('UNAUTHORIZED');
  });
});