import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
// Homonim "makan": versi terverifikasi-lama harus menang vs baru-belum-verifikasi
const MAKAN_TERVERIFIKASI = ulid26('01E2WMAKANOLD');
const MAKAN_BELUM_VERIF = ulid26('01E2WMAKANNEW');
const MAKAN_DRAFT = ulid26('01E2WMAKANDRFT');
const BEDA_KATA = ulid26('01E2WLAINKATA');

describe.skipIf(!hasTestDb)('Detail kata by lemma E2E - URL publik /words/<lemma>', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  const get = (path: string) => app.request(path);

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { languages, words } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    await truncateAll(db);

    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    const lama = new Date('2024-01-01');
    const baru = new Date('2025-06-01');
    await db.insert(words).values([
      { id: MAKAN_TERVERIFIKASI, languageId: SMB, lemma: 'makan', status: 'published', isVerified: true, createdAt: lama },
      { id: MAKAN_BELUM_VERIF, languageId: SMB, lemma: 'Makan', status: 'published', isVerified: false, createdAt: baru },
      { id: MAKAN_DRAFT, languageId: SMB, lemma: 'makan angin', status: 'draft', createdAt: baru },
      { id: BEDA_KATA, languageId: SMB, lemma: 'minum', status: 'published', createdAt: baru },
    ]);

    const appModule = await import('@/app');
    app = appModule.app;
  });

  it('lemma persis → detail published', async () => {
    const res = await get('/api/v1/words/lemma/makan');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MAKAN_TERVERIFIKASI);
    expect(body.data.lemma).toBe('makan');
  });

  it('case-insensitive: MAKAN → entri sama', async () => {
    const res = await get('/api/v1/words/lemma/MAKAN');
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(MAKAN_TERVERIFIKASI);
  });

  it('lemma dengan spasi (idiom/peribahasa) → encode di path', async () => {
    // draft tidak boleh tayang → 404
    const res = await get('/api/v1/words/lemma/makan%20angin');
    expect(res.status).toBe(404);
  });

  it('lemma tak dikenal → 404', async () => {
    const res = await get('/api/v1/words/lemma/tidak-ada');
    expect(res.status).toBe(404);
  });

  it('entri lain tetap terjangkau lewat lemma-nya', async () => {
    const res = await get('/api/v1/words/lemma/minum');
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(BEDA_KATA);
  });
});
