import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed?.DATABASE_URL;

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
        definition: 'Kata untuk moderasi vote',
        order_index: 1,
        translations: [{ language_id: IDN, translation_text: 'kata moderasi', translation_type: 'direct' }],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    status: 'published',
  };
}

describe.skipIf(!hasTestDb)('Admin Votes E2E v1 - moderasi vote (root/admin/reviewer)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let reviewerToken: string;
  let editorToken: string;
  let voter1Name: string;
  let voter2Name: string;
  let voter1Token: string;
  let voter2Token: string;
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

  const del = (path: string, token?: string, body?: unknown) =>
    request(path, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

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
    voter1Name = `vot1${stamp}`;
    voter2Name = `vot2${stamp}`;
    const register = async (username: string) =>
      post('/api/v1/auth/register', {
        username,
        email: `${username}@test.com`,
        password: 'Password123',
        confirm_password: 'Password123',
      });
    await register(`adm${stamp}`);
    await register(`rev${stamp}`);
    await register(`edt${stamp}`);
    await register(voter1Name);
    await register(voter2Name);

    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));
    await db.update(users).set({ role: 'reviewer' }).where(eq(users.email, `rev${stamp}@test.com`));
    await db.update(users).set({ role: 'editor' }).where(eq(users.email, `edt${stamp}@test.com`));

    const login = async (email: string) => {
      const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
      return ((await res.json()) as { data: { access_token: string } }).data.access_token;
    };
    adminToken = await login(`adm${stamp}@test.com`);
    reviewerToken = await login(`rev${stamp}@test.com`);
    editorToken = await login(`edt${stamp}@test.com`);
    voter1Token = await login(`${voter1Name}@test.com`);
    voter2Token = await login(`${voter2Name}@test.com`);

    const create = await post('/api/v1/admin/words', validWordBody('kata dimoderasi'), adminToken);
    const { data } = await create.json();
    wordId = data.word_id as string;

    // Seed 2 vote up pada kata yang sama (bahan moderasi)
    for (const token of [voter1Token, voter2Token]) {
      const res = await post('/api/v1/votes', { target_type: 'word', target_id: wordId, value: 1 }, token);
      expect(res.status).toBe(200);
    }
  });

  it('4 endpoint tanpa token → 401', async () => {
    for (const path of ['/api/v1/admin/votes', '/api/v1/admin/votes/top-targets']) {
      expect((await get(path)).status).toBe(401);
    }
    expect((await del(`/api/v1/admin/votes/${ulid26('01NOVOTE')}`)).status).toBe(401);
    expect(
      (await del('/api/v1/admin/votes/reset-target', undefined, {
        target_type: 'word',
        target_id: wordId,
      })).status,
    ).toBe(401);
  });

  it('role editor (di bawah reviewer) → 403', async () => {
    expect((await get('/api/v1/admin/votes', editorToken)).status).toBe(403);
  });

  it('list reviewer: 200 + envelope cursor + TANPA password_hash', async () => {
    const res = await get(`/api/v1/admin/votes?q=${voter1Name}&target_type=word&limit=2`, reviewerToken);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: Record<string, unknown>[];
      meta: { limit: number; next_cursor: string | null; has_more: boolean };
    };
    expect(body.success).toBe(true);
    expect(body.meta).toMatchObject({ limit: 2 });
    expect(body.data.length).toBe(1);
    expect(body.data[0]).toMatchObject({
      voter_username: voter1Name,
      target_type: 'word',
      target_id: wordId,
      value: 1,
    });
    // NFR-5: response TIDAK pernah mengandung password_hash
    expect(Object.keys(body.data[0]).includes('password_hash')).toBe(false);
  });

  it('delete vote individual → 200 & vote hilang dari list', async () => {
    const list = await get(`/api/v1/admin/votes?q=${voter1Name}`, reviewerToken);
    const body = (await list.json()) as { data: { id: string; voter_username: string }[] };
    const vote = body.data.find((v) => v.voter_username === voter1Name);
    expect(vote).toBeDefined();

    const res = await del(`/api/v1/admin/votes/${vote!.id}`, reviewerToken);
    expect(res.status).toBe(200);

    const after = await get(`/api/v1/admin/votes?q=${voter1Name}`, reviewerToken);
    const afterBody = (await after.json()) as { data: { voter_username: string }[] };
    expect(afterBody.data.filter((v) => v.voter_username === voter1Name)).toHaveLength(0);
  });

  it('reset-target → 200 & semua vote target terhapus', async () => {
    const res = await del(
      '/api/v1/admin/votes/reset-target',
      reviewerToken,
      { target_type: 'word', target_id: wordId },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { deleted_count: number } };
    expect(body.data.deleted_count).toBe(1); // vote voter1 sudah dihapus test sebelumnya

    const after = await get(`/api/v1/admin/votes?target_id=${wordId}`, reviewerToken);
    const afterBody = (await after.json()) as { data: unknown[] };
    expect(afterBody.data).toHaveLength(0);
  });
});
