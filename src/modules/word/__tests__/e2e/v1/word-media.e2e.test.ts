import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { capturedOtpDisplayCode, e2eRegisterBody} from '@/shared/testing/e2e-auth';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');

describe.skipIf(!hasTestDb)('Word Media E2E v1 - kontribusi pronounce/gambar/contoh', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let wordId: string;
  let meaningId: string;

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
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);

    // Kata published dari admin - induk kontribusi media
    const create = await post(
      '/api/v1/admin/words',
      {
        language_id: SMB,
        lemma: 'makatn',
        word_type: 'word',
        category_ids: [],
        related_words: [],
        meanings: [
          {
            word_class_id: NOMINA,
            definition: 'memasukkan makanan ke mulut',
            order_index: 1,
            translations: [{ language_id: IDN, translation_text: 'makan', translation_type: 'direct' }],
          },
        ],
        status: 'published',
      },
      adminToken,
    );
    wordId = (await create.json()).data.word_id;
    const detail = await get(`/api/v1/words/${wordId}`);
    meaningId = (await detail.json()).data.meanings[0].id;
  });

  it('pronounce (contributor) → 201 tayang, belum terverifikasi', async () => {
    const res = await post(
      `/api/v1/words/${wordId}/pronunciations`,
      { notation: 'ipa', value: '/makatn/', speaker_name: 'Pak Daud' },
      contributorToken,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ status: 'published', is_verified: false, is_corrected: false });
    expect(body.data.id).toHaveLength(26);

    const detail = await get(`/api/v1/words/${wordId}`);
    const detailBody = await detail.json();
    expect(detailBody.data.pronunciations.some((p: { value: string }) => p.value === '/makatn/')).toBe(true);
  });

  it('gambar (admin) → 201 published + tampil di detail publik', async () => {
    const res = await post(
      `/api/v1/words/${wordId}/images`,
      {
        url: 'https://ik.imagekit.io/test/words/makatn.jpg',
        provider_file_id: `img_${Date.now()}`,
        alt_text: 'Orang makan',
        is_primary: true,
      },
      adminToken,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ status: 'published', is_verified: true });

    const detail = await get(`/api/v1/words/${wordId}`);
    const detailBody = await detail.json();
    expect(detailBody.data.images.some((i: { alt_text: string }) => i.alt_text === 'Orang makan')).toBe(true);
  });

  it('contoh kalimat (contributor) → tayang belum dicek; bahasa salah → 400', async () => {
    const ok = await post(
      `/api/v1/meanings/${meaningId}/examples`,
      { source_language_id: SMB, source_sentence: 'Kami udah makatn.' },
      contributorToken,
    );
    expect(ok.status).toBe(201);
    expect((await ok.json()).data.status).toBe('published');

    const bad = await post(
      `/api/v1/meanings/${meaningId}/examples`,
      { source_language_id: ulid26('01E2ELANGNGACAK'), source_sentence: 'x' },
      contributorToken,
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).details[0].field).toBe('source_language_id');
  });

  it('parent tidak ada → 404 WORD_NOT_FOUND / MEANING_NOT_FOUND; tanpa token → 401', async () => {
    const noWord = await post(
      `/api/v1/words/${ulid26('01E2EWORDNGACAK')}/pronunciations`,
      { notation: 'ipa', value: '/x/' },
      adminToken,
    );
    expect(noWord.status).toBe(404);
    expect((await noWord.json()).error_code).toBe('WORD_NOT_FOUND');

    const noMeaning = await post(
      `/api/v1/meanings/${ulid26('01E2EMEANINGNGACAK')}/examples`,
      { source_language_id: SMB, source_sentence: 'x' },
      adminToken,
    );
    expect(noMeaning.status).toBe(404);
    expect((await noMeaning.json()).error_code).toBe('MEANING_NOT_FOUND');

    const noToken = await post(`/api/v1/words/${wordId}/pronunciations`, { notation: 'ipa', value: '/x/' });
    expect(noToken.status).toBe(401);
  });
});
