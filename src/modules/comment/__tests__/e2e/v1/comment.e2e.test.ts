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

describe.skipIf(!hasTestDb)('Comment E2E v1 - komentar + moderasi (09 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let otherToken: string;
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

  const del = (path: string, token?: string) =>
    request(path, { method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {} });

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
    for (const name of ['adm', 'kon', 'lain']) {
      await post('/api/v1/auth/register', {
        username: `${name}${stamp}`,
        email: `${name}${stamp}@test.com`,
        password: 'Password123',
        confirm_password: 'Password123',
      });
    }
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));

    const login = async (email: string) => {
      const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
      return ((await res.json()) as { data: { access_token: string } }).data.access_token;
    };
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);
    otherToken = await login(`lain${stamp}@test.com`);

    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'kata dikomentari',
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'Kata untuk uji komentar',
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: 'kata uji', translation_type: 'direct' }],
          },
        ],
        word_type: 'word',
        category_ids: [MAKANAN],
        related_words: [],
        status: 'published',
      },
      adminToken,
    );
    const { data } = await create.json();
    wordId = data.word_id as string;
  });

  it('ALUR PENUH: POST → pending (list kosong) → approve → tampil + vote komentar', async () => {
    const created = await post(`/api/v1/words/${wordId}/comments`, { body: 'Kata ini sering saya dengar' }, contributorToken);
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.status).toBe('pending_review');
    expect(typeof data.username).toBe('string'); // username ter-join (read-back)
    const commentId = data.id as string;

    // pre-moderation: belum tampil di list publik
    const empty = await get(`/api/v1/words/${wordId}/comments`);
    expect(((await empty.json()) as { data: unknown[] }).data).toHaveLength(0);

    // antrean admin melihatnya
    const queue = await get('/api/v1/admin/comments?status=pending_review', adminToken);
    const queueBody = await queue.json();
    expect(queueBody.data.some((c: { id: string }) => c.id === commentId)).toBe(true);

    // approve → tampil publik
    const approve = await post(`/api/v1/admin/comments/${commentId}/approve`, {}, adminToken);
    expect(approve.status).toBe(200);
    expect((await approve.json()).data.status).toBe('published');

    const list = await get(`/api/v1/words/${wordId}/comments`);
    const listBody = await list.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({ id: commentId, username: expect.any(String), upvotes: 0 });

    // vote komentar → counts di list naik
    await post('/api/v1/votes', { target_type: 'comment', target_id: commentId, value: 1 }, otherToken);
    const afterVote = await get(`/api/v1/words/${wordId}/comments`);
    expect(((await afterVote.json()) as { data: { upvotes: number }[] }).data[0].upvotes).toBe(1);

    // audit approve tercatat
    const logs = await get('/api/v1/admin/audit-logs', adminToken);
    const logBody = await logs.json();
    const approveLog = logBody.data.find(
      (l: { entity_type: string; action: string }) => l.entity_type === 'comment' && l.action === 'approve',
    );
    expect(approveLog.entity_id).toBe(commentId);
  });

  it('REJECT: komentar kedua ditolak → tidak pernah tampil publik', async () => {
    const created = await post(`/api/v1/words/${wordId}/comments`, { body: 'komentar ditolak' }, contributorToken);
    const { data } = await created.json();

    const reject = await post(`/api/v1/admin/comments/${data.id}/reject`, {}, adminToken);
    expect(reject.status).toBe(200);
    expect((await reject.json()).data.status).toBe('rejected');

    const list = await get(`/api/v1/words/${wordId}/comments`);
    expect(((await list.json()) as { data: unknown[] }).data).toHaveLength(1); // hanya yang approved
  });

  it('approve dua kali → 409 COMMENT_ALREADY_REVIEWED', async () => {
    const created = await post(`/api/v1/words/${wordId}/comments`, { body: 'double review' }, contributorToken);
    const { data } = await created.json();
    await post(`/api/v1/admin/comments/${data.id}/approve`, {}, adminToken);

    const res = await post(`/api/v1/admin/comments/${data.id}/approve`, {}, adminToken);
    expect(res.status).toBe(409);
    expect((await res.json()).error_code).toBe('COMMENT_ALREADY_REVIEWED');
  });

  it('DELETE: penulis sendiri OK → hilang dari list; user lain → 403; admin bisa hapus punya orang', async () => {
    const mine = await post(`/api/v1/words/${wordId}/comments`, { body: 'hapus sendiri' }, contributorToken);
    const mineId = ((await mine.json()) as { data: { id: string } }).data.id;
    await post(`/api/v1/admin/comments/${mineId}/approve`, {}, adminToken);

    // user lain tidak boleh
    expect((await del(`/api/v1/comments/${mineId}`, otherToken)).status).toBe(403);
    // penulis boleh
    expect((await del(`/api/v1/comments/${mineId}`, contributorToken)).status).toBe(200);

    const list = await get(`/api/v1/words/${wordId}/comments`);
    const bodies = ((await list.json()) as { data: { id: string }[] }).data.map((c) => c.id);
    expect(bodies).not.toContain(mineId);

    // admin bisa hapus komentar orang lain
    const others = await post(`/api/v1/words/${wordId}/comments`, { body: 'dihapus admin' }, otherToken);
    const otherId = ((await others.json()) as { data: { id: string } }).data.id;
    await post(`/api/v1/admin/comments/${otherId}/approve`, {}, adminToken);
    expect((await del(`/api/v1/comments/${otherId}`, adminToken)).status).toBe(200);
  });

  it('gagal: 401 tanpa token, 403 contributor ke antrean admin, 404 word/komentar tidak ada, 400 body kosong', async () => {
    expect((await post(`/api/v1/words/${wordId}/comments`, { body: 'x' })).status).toBe(401);
    expect((await get('/api/v1/admin/comments', contributorToken)).status).toBe(403);
    expect((await post(`/api/v1/words/${ulid26('01U2EWORDNGACAK')}/comments`, { body: 'x' }, contributorToken)).status).toBe(404);
    expect((await del(`/api/v1/comments/${ulid26('01U2ECMNGACAK')}`, adminToken)).status).toBe(404);
    expect((await post(`/api/v1/words/${wordId}/comments`, { body: '' }, contributorToken)).status).toBe(400);
  });

  it('antrean admin: tanpa status = semua; word_id = hanya kata itu (section detail admin)', async () => {
    // dua kata: wordId (punya komentar dari test sebelumnya) + kata kedua
    const create2 = await post('/api/v1/admin/words', {
      language_id: SMB,
      lemma: 'kata kedua komentar',
      meanings: [
        {
          word_class_id: NOMINA,
          definition: 'Kata kedua uji word_id filter',
          order_index: 1,
          translations: [{ language_id: IDN, translation_text: 'kata kedua', translation_type: 'direct' }],
        },
      ],
      word_type: 'word',
      category_ids: [MAKANAN],
      related_words: [],
      status: 'published',
    }, adminToken);
    const wordId2 = ((await create2.json()) as { data: { word_id: string } }).data.word_id;
    await post(`/api/v1/words/${wordId2}/comments`, { body: 'komentar kata kedua' }, contributorToken);

    // tanpa status: semua status (published/rejected/pending) muncul
    const all = await get('/api/v1/admin/comments', adminToken);
    const allBodies = ((await all.json()) as { data: { word_id: string }[] }).data.map((cm) => cm.word_id);
    expect(allBodies).toContain(wordId);
    expect(allBodies).toContain(wordId2);

    // word_id: hanya komentar kata itu
    const ofWord = await get(`/api/v1/admin/comments?word_id=${wordId}`, adminToken);
    const bodies = ((await ofWord.json()) as { data: { word_id: string }[] }).data.map((cm) => cm.word_id);
    expect(bodies.every((w) => w === wordId)).toBe(true);
    expect(bodies.length).toBeGreaterThan(0);
  });
});
