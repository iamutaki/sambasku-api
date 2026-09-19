import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { languages, users, words } from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { CommentRepositoryImpl } from '../../infrastructure/comment.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const AUTHOR = ulid26('01TESTCMAUTHOR');
const ADMIN = ulid26('01TESTCMADMIN');
const WORD = ulid26('01TESTCMWORD');
const WORD2 = ulid26('01TESTCMWORTWO');

describe.skipIf(!hasTestDb)('CommentRepositoryImpl (integration, 09 doc)', () => {
  const repo = new CommentRepositoryImpl(getTestDb());

  beforeEach(async () => {
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    await db.insert(users).values([
      { id: AUTHOR, email: 'cmauthor@test.com', username: 'cmauthor' },
      { id: ADMIN, email: 'cmadmin@test.com', username: 'cmadmin' },
    ]);
    await db.insert(words).values([
      { id: WORD, languageId: SMB, lemma: 'makatn' },
      { id: WORD2, languageId: SMB, lemma: 'ngamakn' },
    ]);
  });

  it('listByWord: hanya published & belum terhapus, terbaru dulu, username ter-join', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'pertama' });
    await repo.create({ wordId: WORD, userId: AUTHOR, body: 'kedua (pending)' });
    await repo.review(a.id, 'approve', ADMIN);
    // b tetap pending; a published; plus satu baris soft-deleted published
    const c = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'dihapus' });
    await repo.review(c.id, 'approve', ADMIN);
    await repo.softDelete(c.id, ADMIN);

    const page = await repo.listByWord(WORD, { limit: 20 });
    expect(page.items.map((cm) => cm.body)).toEqual(['pertama']); // pending & terhapus tak tampil
    expect(page.items[0].username).toBe('cmauthor');
    expect(page.hasMore).toBe(false);
  });

  it('listAdmin: filter status; semua status terlihat', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'a' });
    await repo.create({ wordId: WORD, userId: AUTHOR, body: 'b' });
    await repo.review(a.id, 'reject', ADMIN);

    const pending = await repo.listAdmin({ status: 'pending_review', limit: 20 });
    expect(pending.items.map((cm) => cm.body)).toEqual(['b']);

    const rejected = await repo.listAdmin({ status: 'rejected', limit: 20 });
    expect(rejected.items.map((cm) => cm.body)).toEqual(['a']);
    expect(rejected.items[0].reviewedBy).toBe(ADMIN);
  });

  it('listAdmin TANPA status = semua status; word_id = hanya komentar kata itu', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'kata satu' });
    const b = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'kata satu (2)' });
    await repo.create({ wordId: WORD2, userId: AUTHOR, body: 'kata lain' });
    await repo.review(a.id, 'approve', ADMIN);
    await repo.review(b.id, 'reject', ADMIN);

    // tanpa status: published + rejected + pending semuanya muncul
    const all = await repo.listAdmin({ limit: 20 });
    expect(all.items.map((cm) => cm.body).sort()).toEqual(['kata lain', 'kata satu', 'kata satu (2)']);

    // filter per kata (embed detail admin)
    const ofWord = await repo.listAdmin({ wordId: WORD, limit: 20 });
    expect(ofWord.items.map((cm) => cm.body).sort()).toEqual(['kata satu', 'kata satu (2)']);
  });

  it('review: WHERE status pending - review ganda → false (race 409)', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'sekali review' });
    expect(await repo.review(a.id, 'approve', ADMIN)).toBe(true);
    expect(await repo.review(a.id, 'reject', ADMIN)).toBe(false); // sudah diputuskan
  });

  it('softDelete: terhapus tak bisa direview / ditemukan findById', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'mau dihapus' });
    expect(await repo.softDelete(a.id, AUTHOR)).toBe(true);
    expect(await repo.findById(a.id)).toBeNull();
    expect(await repo.review(a.id, 'approve', ADMIN)).toBe(false);
  });
});
