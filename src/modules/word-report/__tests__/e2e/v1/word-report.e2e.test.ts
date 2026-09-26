import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { capturedOtpDisplayCode, e2eRegisterBody} from '@/shared/testing/e2e-auth';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');

describe.skipIf(!hasTestDb)('Word report E2E', () => {
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
      ['adm', `admrep${stamp}@test.com`, 'admin'],
      ['kon', `konrep${stamp}@test.com`, 'contributor'],
    ] as const) {
      await post('/api/v1/auth/register', e2eRegisterBody({
          name: `${prefix}${stamp}`,
          email: email,
      }));
      await post('/api/v1/auth/verify-email', { email, code: capturedOtpDisplayCode() });
      if (role !== 'contributor') {
        await db.update(users).set({ role }).where(eq(users.email, email));
      }
    }
    const login = async (email: string) =>
      (await (await post('/api/v1/auth/login', { email, password: 'Password123' })).json()).data.access_token;
    adminToken = await login(`admrep${stamp}@test.com`);
    contributorToken = await login(`konrep${stamp}@test.com`);

    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'laporuji',
        word_type: 'word',
        category_ids: [],
        related_words: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'entri untuk uji laporan',
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: 'uji', translation_type: 'direct' }],
          },
        ],
        status: 'published',
      },
      adminToken,
    );
    wordId = (await create.json()).data.word_id;
  });

  it('other tanpa catatan → 400', async () => {
    const res = await post(`/api/v1/words/${wordId}/reports`, { reason_code: 'other' }, contributorToken);
    expect(res.status).toBe(400);
  });

  it('laporan → tetap tayang; takedown → 404 publik dan hilang dari search; restore tayang lagi', async () => {
    const created = await post(
      `/api/v1/words/${wordId}/reports`,
      { reason_code: 'spam', note: 'bukan kosakata' },
      contributorToken,
    );
    expect(created.status).toBe(201);
    const reportId = (await created.json()).data.id;

    const dup = await post(`/api/v1/words/${wordId}/reports`, { reason_code: 'spam' }, contributorToken);
    expect(dup.status).toBe(409);
    expect((await dup.json()).error_code).toBe('WORD_REPORT_ALREADY_OPEN');

    const stillPublic = await get(`/api/v1/words/${wordId}`);
    expect(stillPublic.status).toBe(200);

    const taken = await post(
      `/api/v1/admin/word-reports/${reportId}/takedown`,
      { reason_code: 'spam', note: 'bukan entri kamus' },
      adminToken,
    );
    expect(taken.status).toBe(200);
    expect((await taken.json()).data.status).toBe('resolved');

    const hidden = await get(`/api/v1/words/${wordId}`);
    expect(hidden.status).toBe(404);

    const search = await get('/api/v1/words/search?q=laporuji&search_in=lemma');
    const searchBody = await search.json();
    expect(searchBody.data.some((item: { id: string }) => item.id === wordId)).toBe(false);

    const restored = await post(`/api/v1/admin/words/${wordId}/restore`, undefined, adminToken);
    expect(restored.status).toBe(200);
    expect((await get(`/api/v1/words/${wordId}`)).status).toBe(200);
  });

  it('dismiss tidak mengubah status tayang', async () => {
    const created = await post(
      `/api/v1/words/${wordId}/reports`,
      { reason_code: 'inaccurate' },
      contributorToken,
    );
    expect(created.status).toBe(201);
    const reportId = (await created.json()).data.id;

    const dismissed = await post(
      `/api/v1/admin/word-reports/${reportId}/dismiss`,
      { note: 'arti sudah benar' },
      adminToken,
    );
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).data.resolution).toBe('dismissed');
    expect((await get(`/api/v1/words/${wordId}`)).status).toBe(200);
  });
});
