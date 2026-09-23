import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { ANONIM_EMAIL, ANONIM_USER_ID, ANONIM_USERNAME } from '@/shared/constants/anonim';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');
const MAKANAN = ulid26('01E2ECATMAKANAN');

describe.skipIf(!hasTestDb)('Variasi Penulisan E2E v1 (11 doc) - search + validasi create', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;

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
    const email = `adm${stamp}@test.com`;
    await post('/api/v1/auth/register', {
      name: `adm${stamp}`,
      email,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ role: 'admin', emailVerified: true }).where(eq(users.email, email));

    // User sistem Anonim - penampung kontribusi tanpa login (03 doc)
    await db.insert(users).values({
      id: ANONIM_USER_ID,
      username: ANONIM_USERNAME,
      email: ANONIM_EMAIL,
      passwordHash: 'bukan-hash-login',
      role: 'contributor',
    });

    const login = await post('/api/v1/auth/login', { email, password: 'Password123' });
    adminToken = ((await login.json()) as { data: { access_token: string } }).data.access_token;
  });

  const wordBody = (lemma: string, variants: unknown[]) => ({
    language_id: SMB,
    lemma,
    meanings: [
      {
        word_class_id: NOMINA,
        definition: 'Kata uji variasi penulisan',
        order_index: 1,
        translations: [{ language_id: IDN, translation_text: lemma, translation_type: 'direct' }],
      },
    ],
    word_type: 'word',
    category_ids: [MAKANAN],
    related_words: [],
    variants,
    status: 'published',
  });

  it('create dengan variasi valid → 201; search via variasi menemukan induk + matched_variant', async () => {
    const create = await post(
      '/api/v1/admin/words',
      wordBody('ketek', [
        { form: 'ketex', variant_type: 'alternative' },
        { form: 'kettek', variant_type: 'alternative' },
      ]),
      adminToken,
    );
    expect(create.status).toBe(201);

    // Cari dengan ejaan variasi → entri induk ketek ditemukan
    const byVariant = await get('/api/v1/words/search?q=ketex&search_in=lemma&limit=10');
    expect(byVariant.status).toBe(200);
    const variantBody = (await byVariant.json()) as {
      data: Array<{ lemma: string; matched_variant?: string }>;
    };
    const hit = variantBody.data.find((w) => w.lemma === 'ketek');
    expect(hit).toBeDefined();
    expect(hit?.matched_variant).toBe('ketex');

    // Cari dengan lemma induk → ditemukan TANPA matched_variant
    const byLemma = await get('/api/v1/words/search?q=ketek&search_in=lemma&limit=10');
    const lemmaBody = (await byLemma.json()) as {
      data: Array<{ lemma: string; matched_variant?: string }>;
    };
    const lemmaHit = lemmaBody.data.find((w) => w.lemma === 'ketek');
    expect(lemmaHit).toBeDefined();
    expect(lemmaHit?.matched_variant).toBeUndefined();

    // Prefix variasi (ilike %q%) juga cocok
    const byPrefix = await get("/api/v1/words/search?q=kete&search_in=lemma&limit=10");
    const prefixBody = (await byPrefix.json()) as { data: Array<{ lemma: string }> };
    expect(prefixBody.data.some((w) => w.lemma === 'ketek')).toBe(true);
  });

  it('variasi sama dengan lemma → 400 VALIDATION_ERROR', async () => {
    const res = await post(
      '/api/v1/admin/words',
      wordBody('tangkal', [{ form: 'Tangkal', variant_type: 'alternative' }]),
      adminToken,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });

  it('ejaan alternatif dengan afiks → 400; duplikat variasi → 400', async () => {
    const affix = await post(
      '/api/v1/admin/words',
      wordBody('rabong', [
        { form: 'rabox', variant_type: 'alternative', affix_type: 'suffix', affix_value: '-x' },
      ]),
      adminToken,
    );
    expect(affix.status).toBe(400);

    const dup = await post(
      '/api/v1/admin/words',
      wordBody('miyang', [
        { form: 'miyanx', variant_type: 'alternative' },
        { form: 'Miyanx', variant_type: 'alternative' },
      ]),
      adminToken,
    );
    expect(dup.status).toBe(400);
  });

  it('kontribusi anonim: variasi valid diterima + tercari (mewarisi schema)', async () => {
    const res = await post(
      '/api/v1/contributions/words',
      wordBody('lamas', [{ form: 'lamasx', variant_type: 'alternative' }]),
    );
    expect(res.status).toBe(201);

    // pending_review → tidak tayang di search publik sampai di-approve;
    // cukup pastikan tidak 400 (varian diterima pintu anonim)
    const search = await get('/api/v1/words/search?q=lamasx&search_in=lemma&limit=10');
    expect(search.status).toBe(200);
  });
});
