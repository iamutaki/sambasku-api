import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

// Fixture ULID — selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');
const MAKANAN = ulid26('01E2ECATMAKANAN');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    language_id: SMB,
    lemma: 'makatn',
    notes: 'contoh catatan',
    meanings: [
      {
        word_class_id: NOMINA,
        definition: 'Aktivitas memasukkan makanan ke mulut',
        order_index: 1,
        translations: [
          { language_id: IDN, translation_text: 'makan', translation_type: 'direct' },
        ],
        examples: [
          {
            source_language_id: SMB,
            source_sentence: 'Kami udah makatn tadi.',
            target_language_id: IDN,
            target_sentence: 'Kami sudah makan tadi.',
            source_type: 'native_speaker',
          },
        ],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    pronunciation: { notation: 'ipa', value: '/makatn/' },
    images: [
      {
        url: 'https://ik.imagekit.io/test/words/makatn.jpg',
        provider_file_id: `img_${Date.now()}`,
        alt_text: 'Ilustrasi makatn',
        is_primary: true,
      },
    ],
    status: 'published',
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)('Word E2E v1', () => {
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

    // admin + contributor via register, lalu role admin dinaikkan manual
    const stamp = Date.now();
    await post('/api/v1/auth/register', {
      username: `adm${stamp}`,
      email: `adm${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await post('/api/v1/auth/register', {
      username: `kon${stamp}`,
      email: `kon${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `adm${stamp}@test.com`));

    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);
  });

  it('POST /api/v1/admin/words (admin, published) → 201 langsung published', async () => {
    const res = await post('/api/v1/admin/words', validBody(), adminToken);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('published');
    expect(body.data.word_id).toHaveLength(26);
    expect(body.data.warnings).toBeUndefined(); // lemma pertama, tidak duplikat
  });

  it('POST (contributor, published) → 201 tapi pending_review', async () => {
    const res = await post('/api/v1/admin/words', validBody({ lemma: 'minum' }), contributorToken);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('pending_review');
  });

  it('POST submit kedua lemma sama → warnings duplikat', async () => {
    const res = await post('/api/v1/admin/words', validBody(), adminToken);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.warnings).toEqual([
      { field: 'lemma', message: 'Lemma serupa sudah ada di bahasa ini' },
    ]);
  });

  it('POST tanpa token → 401', async () => {
    const res = await post('/api/v1/admin/words', validBody());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('UNAUTHORIZED');
  });

  it('POST body invalid → 400 VALIDATION_ERROR + details', async () => {
    const res = await post(
      '/api/v1/admin/words',
      validBody({ lemma: '  ', meanings: [] }),
      adminToken,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details.map((d: { field: string }) => d.field)).toContain('lemma');
  });

  it('POST language_id tidak dikenal → 400 details field language_id', async () => {
    const res = await post(
      '/api/v1/admin/words',
      validBody({ language_id: ulid26('01E2ELANGNGACAK') }),
      adminToken,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('language_id');
  });

  it('GET /api/v1/words/:id → detail published + nested', async () => {
    const create = await post('/api/v1/admin/words', validBody({ lemma: 'tidur' }), adminToken);
    const { data } = await create.json();

    const res = await request(`/api/v1/words/${data.word_id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.lemma).toBe('tidur');
    expect(body.data.meanings[0].translations[0].translation_text).toBe('makan');
    expect(body.data.meanings[0].examples[0].target_sentence).toBe('Kami sudah makan tadi.');
    expect(body.data.pronunciations[0]).toMatchObject({ notation: 'ipa', value: '/makatn/' });
    expect(body.data.images[0]).toMatchObject({
      url: 'https://ik.imagekit.io/test/words/makatn.jpg',
      is_primary: true,
    });
  });

  it('GET detail kata pending → 404 WORD_NOT_FOUND', async () => {
    const create = await post(
      '/api/v1/admin/words',
      validBody({ lemma: 'rahasia', status: 'published' }),
      contributorToken, // contributor → pending_review
    );
    const { data } = await create.json();

    const res = await request(`/api/v1/words/${data.word_id}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe('WORD_NOT_FOUND');
  });

  it('GET /api/v1/words/search → 200 list + meta cursor-based (Section 13)', async () => {
    const res = await request('/api/v1/words/search?q=mak&limit=2');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta.limit).toBe(2);
    expect(typeof body.meta.has_more).toBe('boolean');
    expect(body.meta.next_cursor === null || typeof body.meta.next_cursor === 'string').toBe(true);
    if (body.meta.has_more) {
      expect(body.meta.next_cursor).toHaveLength(26);
      const res2 = await request(`/api/v1/words/search?q=mak&limit=2&cursor=${body.meta.next_cursor}`);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      for (const w of body2.data) {
        expect(body.data.map((x: { id: string }) => x.id)).not.toContain(w.id);
      }
    }
  });

  it('GET search REVERSE (Indonesia→Sambas) → temukan makatn dari "makan"', async () => {
    const res = await request('/api/v1/words/search?q=makan&search_in=translation');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    const hit = body.data.find((w: { lemma: string }) => w.lemma === 'makatn');
    expect(hit).toBeDefined();
    expect(hit.matched_translation).toBe('makan');
  });

  it('PERIBAHASA penuh: word_type + related_words has_component + appears_in invers + filter', async () => {
    const buat = async (lemma: string, extra: Record<string, unknown> = {}) => {
      const res = await post('/api/v1/admin/words', validBody({ lemma, ...extra }), adminToken);
      expect(res.status).toBe(201);
      return (await res.json()).data;
    };

    const miyang = await buat('miyang e2e');
    const rabong = await buat('rabong e2e');
    const pb = await buat('miyang rabong e2e', {
      word_type: 'peribahasa',
      related_words: [
        { word_id: miyang.word_id, relation_type: 'has_component' },
        { word_id: rabong.word_id, relation_type: 'has_component' },
      ],
      variants: [
        { form: 'mamiyang rabong', variant_type: 'reduplication', affix_type: 'reduplication', affix_value: 'ma-' },
      ],
    });
    expect(pb.word_type).toBe('peribahasa');

    // detail frasa: komponen + variant
    const detail = await request(`/api/v1/words/${pb.word_id}`);
    const body = await detail.json();
    expect(body.data.word_type).toBe('peribahasa');
    expect(body.data.related_words.map((r: { lemma: string }) => r.lemma).sort()).toEqual(['miyang e2e', 'rabong e2e']);
    expect(body.data.variants[0]).toMatchObject({ form: 'mamiyang rabong', affix_type: 'reduplication', affix_value: 'ma-' });

    // detail komponen: appears_in (invers)
    const dm = await request(`/api/v1/words/${miyang.word_id}`);
    expect((await dm.json()).data.appears_in).toEqual([
      { word_id: pb.word_id, lemma: 'miyang rabong e2e', relation_type: 'has_component' },
    ]);

    // filter word_type
    const s1 = await request('/api/v1/words/search?word_type=peribahasa');
    const b1 = await s1.json();
    expect(b1.data.every((w: { word_type: string }) => w.word_type === 'peribahasa')).toBe(true);
    expect(b1.data.map((w: { lemma: string }) => w.lemma)).toContain('miyang rabong e2e');
  });

  it('VALIDASI SILANG: has_component + word_type word → 400', async () => {
    const res = await post(
      '/api/v1/admin/words',
      validBody({
        lemma: 'frasa salah kategori',
        word_type: 'word',
        related_words: [{ word_id: ulid26('01E2EWORDLAIN'), relation_type: 'has_component' }],
      }),
      adminToken,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('related_words');
  });

  it('GET /api/v1/word-classes → 200 daftar kelas kata', async () => {
    const res = await request('/api/v1/word-classes');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toMatchObject({ code: 'n', name: 'Nomina' });
  });
});
