import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01U2ELANGSMB');
const IDN = ulid26('01U2ELANGIDN');
const NOMINA = ulid26('01U2EWCNOMINA');
const MAKANAN = ulid26('01U2ECATMAKANAN');

describe.skipIf(!hasTestDb)('Comment E2E v1 - post-moderation (09 doc)', () => {
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
        name: `${name}${stamp}`,
        email: `${name}${stamp}@test.com`,
        password: 'Password123',
        confirm_password: 'Password123',
      });
    }
    await db.update(users).set({ emailVerified: true });
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

  it('ALUR: POST → published langsung + vote; takedown → body null di publik', async () => {
    const created = await post(
      `/api/v1/words/${wordId}/comments`,
      { body: 'Kata ini sering saya dengar' },
      contributorToken,
    );
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.status).toBe('published');
    const commentId = data.id as string;

    const list = await get(`/api/v1/words/${wordId}/comments`);
    const listBody = await list.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({
      id: commentId,
      status: 'published',
      body: 'Kata ini sering saya dengar',
      upvotes: 0,
    });

    await post('/api/v1/votes', { target_type: 'comment', target_id: commentId, value: 1 }, otherToken);
    const afterVote = await get(`/api/v1/words/${wordId}/comments`);
    expect(((await afterVote.json()) as { data: { upvotes: number }[] }).data[0].upvotes).toBe(1);

    const td = await post(`/api/v1/admin/comments/${commentId}/takedown`, {}, adminToken);
    expect(td.status).toBe(200);
    expect((await td.json()).data.status).toBe('taken_down');

    const afterTd = await get(`/api/v1/words/${wordId}/comments`);
    const afterTdBody = await afterTd.json();
    expect(afterTdBody.data[0]).toMatchObject({ id: commentId, status: 'taken_down', body: null });

    const logs = await get('/api/v1/admin/audit-logs', adminToken);
    const logBody = await logs.json();
    const tdLog = logBody.data.find(
      (l: { entity_type: string; action: string }) =>
        l.entity_type === 'comment' && l.action === 'takedown',
    );
    expect(tdLog.entity_id).toBe(commentId);
  });

  it('takedown dua kali → 409 COMMENT_ALREADY_MODERATED', async () => {
    const created = await post(`/api/v1/words/${wordId}/comments`, { body: 'double td' }, contributorToken);
    const { data } = await created.json();
    await post(`/api/v1/admin/comments/${data.id}/takedown`, {}, adminToken);

    const res = await post(`/api/v1/admin/comments/${data.id}/takedown`, {}, adminToken);
    expect(res.status).toBe(409);
    expect((await res.json()).error_code).toBe('COMMENT_ALREADY_MODERATED');
  });

  it('DELETE penulis → deleted_by_author (body null); user lain/admin → 403', async () => {
    const mine = await post(`/api/v1/words/${wordId}/comments`, { body: 'hapus sendiri' }, contributorToken);
    const mineId = ((await mine.json()) as { data: { id: string } }).data.id;

    expect((await del(`/api/v1/comments/${mineId}`, otherToken)).status).toBe(403);
    expect((await del(`/api/v1/comments/${mineId}`, adminToken)).status).toBe(403);
    expect((await del(`/api/v1/comments/${mineId}`, contributorToken)).status).toBe(200);

    const list = await get(`/api/v1/words/${wordId}/comments`);
    const item = ((await list.json()) as { data: { id: string; status: string; body: string | null }[] }).data.find(
      (c) => c.id === mineId,
    );
    expect(item).toMatchObject({ status: 'deleted_by_author', body: null });
  });

  it('blocklist: kata terlarang diganti *** saat create', async () => {
    const add = await post('/api/v1/admin/comment-blocklist', { word: 'bodoh' }, adminToken);
    expect(add.status).toBe(201);

    const created = await post(
      `/api/v1/words/${wordId}/comments`,
      { body: 'Jangan bilang Bodoh ya' },
      contributorToken,
    );
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.body).toBe('Jangan bilang *** ya');
  });

  it('gagal: 401, 403 contributor admin, 404, 400', async () => {
    expect((await post(`/api/v1/words/${wordId}/comments`, { body: 'x' })).status).toBe(401);
    expect((await get('/api/v1/admin/comments', contributorToken)).status).toBe(403);
    expect(
      (await post(`/api/v1/words/${ulid26('01U2EWORDNGACAK')}/comments`, { body: 'x' }, contributorToken))
        .status,
    ).toBe(404);
    expect((await del(`/api/v1/comments/${ulid26('01U2ECMNGACAK')}`, contributorToken)).status).toBe(404);
    expect((await post(`/api/v1/words/${wordId}/comments`, { body: '' }, contributorToken)).status).toBe(400);
  });

  it('GET /comments/my: milik pemohon; filter taken_down', async () => {
    expect((await get('/api/v1/comments/my')).status).toBe(401);

    const mine = await get('/api/v1/comments/my', contributorToken);
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as {
      data: { body: string; status: string; user_id?: string; word_lemma: string | null }[];
    };
    expect(body.data.some((row) => row.body.includes('sering saya dengar'))).toBe(true);
    expect(body.data.some((row) => row.status === 'deleted_by_author' && row.body === 'hapus sendiri')).toBe(true);
    expect(body.data[0]).not.toHaveProperty('user_id');
    expect(body.data[0]).not.toHaveProperty('username');

    const taken = await get('/api/v1/comments/my?status=taken_down', contributorToken);
    const takenBody = ((await taken.json()) as { data: { status: string; body: string }[] }).data;
    expect(takenBody.length).toBeGreaterThan(0);
    expect(takenBody.every((row) => row.status === 'taken_down')).toBe(true);

    const other = await get('/api/v1/comments/my', otherToken);
    const otherBodies = ((await other.json()) as { data: { body: string }[] }).data.map((row) => row.body);
    expect(otherBodies).not.toContain('hapus sendiri');

    const page = await get('/api/v1/comments/my?limit=1', contributorToken);
    const pageBody = (await page.json()) as { meta: { limit: number; has_more: boolean; next_cursor: string | null } };
    expect(pageBody.meta).toMatchObject({ limit: 1, has_more: true });
    expect(pageBody.meta.next_cursor).toHaveLength(26);

    const publicList = await get(`/api/v1/words/${wordId}/comments`);
    const publicItem = (
      (await publicList.json()) as { data: { status: string; body: string | null }[] }
    ).data.find((row) => row.status === 'taken_down');
    expect(publicItem?.body).toBeNull();
  });
});
