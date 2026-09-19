import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { bookmarks, languages, users, words } from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { BookmarkRepositoryImpl } from '../../infrastructure/bookmark.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26)). Urutan leksikografis =
// urutan waktu ULID: BM_LAMA < BM_BARU (desc = terbaru duluan).
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const USER_A = ulid26('01TESTMARKERA');
const USER_B = ulid26('01TESTMARKERB');
const WORD_1 = ulid26('01TESTWRDTUJU1');
const WORD_2 = ulid26('01TESTWRDTUJU2');
const WORD_DEP = ulid26('01TESTWRDDELET');
const BM_LAMA = ulid26('01TESTBMARKAAA');
const BM_BARU = ulid26('01TESTBMARKZZZ');
const BM_DEP = ulid26('01TESTBMARKDELE');

describe.skipIf(!hasTestDb)('BookmarkRepositoryImpl (integration, 16 doc)', () => {
  const repo = new BookmarkRepositoryImpl(getTestDb());

  beforeEach(async () => {
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    await db.insert(users).values([
      { id: USER_A, email: 'markera@test.com', username: 'markera' },
      { id: USER_B, email: 'markerb@test.com', username: 'markerb' },
    ]);
    await db.insert(words).values([
      { id: WORD_1, languageId: SMB, lemma: 'makatn', isVerified: true },
      { id: WORD_2, languageId: SMB, lemma: 'minum' },
      // kata soft-deleted: tidak boleh bisa di-bookmark / tampil di list
      { id: WORD_DEP, languageId: SMB, lemma: 'hilang', deletedAt: new Date() },
    ]);
  });

  it('toggle: ON → ulang OFF (hard delete), hasil state final benar tiap langkah', async () => {
    const on = await repo.toggle(USER_A, WORD_1);
    expect(on.isBookmarked).toBe(true);
    expect(on.bookmarkedAt).toBeInstanceOf(Date);

    const off = await repo.toggle(USER_A, WORD_1);
    expect(off).toEqual({ isBookmarked: false, bookmarkedAt: null });

    // baris benar-benar terhapus hard
    const list = await repo.listByUser(USER_A, { limit: 20 });
    expect(list.items).toHaveLength(0);
  });

  it('toggle user berbeda independen; bookmark per user per kata tunggal (unik)', async () => {
    await repo.toggle(USER_A, WORD_1);
    await repo.toggle(USER_B, WORD_1); // user lain boleh bookmark kata sama

    const mineA = await repo.listByUser(USER_A, { limit: 20 });
    const mineB = await repo.listByUser(USER_B, { limit: 20 });
    expect(mineA.items.map((i) => i.wordId)).toEqual([WORD_1]);
    expect(mineB.items.map((i) => i.wordId)).toEqual([WORD_1]);

    // toggle ulang user B tidak mengganggu bookmark user A
    await repo.toggle(USER_B, WORD_1);
    expect((await repo.listByUser(USER_A, { limit: 20 })).items).toHaveLength(1);
  });

  it('wordExists: hanya kata hidup (deleted_at IS NULL)', async () => {
    expect(await repo.wordExists(WORD_1)).toBe(true);
    expect(await repo.wordExists(WORD_DEP)).toBe(false);
    expect(await repo.wordExists(ulid26('01TESTWRDNGLON'))).toBe(false);
  });

  it('listByUser: terbaru duluan (desc id), cursor halaman kedua, LIMIT+1 has_more', async () => {
    const db = getTestDb();
    // id eksplisit supaya urutan deterministik (BM_BARU > BM_LAMA)
    await db.insert(bookmarks).values([
      { id: BM_LAMA, userId: USER_A, wordId: WORD_1 },
      { id: BM_BARU, userId: USER_A, wordId: WORD_2 },
      { id: ulid26('01TESTBMARKOTHR'), userId: USER_B, wordId: WORD_1 },
    ]);

    const page1 = await repo.listByUser(USER_A, { limit: 1 });
    expect(page1.items.map((i) => i.wordId)).toEqual([WORD_2]);
    expect(page1.items[0].word.lemma).toBe('minum');
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe(BM_BARU);

    const page2 = await repo.listByUser(USER_A, { limit: 1, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.wordId)).toEqual([WORD_1]);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();
  });

  it('listByUser mode wordIds: filter batch tanpa paginasi (hasMore selalu false)', async () => {
    const db = getTestDb();
    await db.insert(bookmarks).values([
      { id: BM_LAMA, userId: USER_A, wordId: WORD_1 },
      { id: BM_BARU, userId: USER_A, wordId: WORD_2 },
    ]);

    const res = await repo.listByUser(USER_A, { limit: 20, wordIds: [WORD_1] });
    expect(res.items.map((i) => i.wordId)).toEqual([WORD_1]);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it('listByUser: kata soft-deleted TIDAK ikut list walau baris bookmark ada', async () => {
    const db = getTestDb();
    await db.insert(bookmarks).values({ id: BM_DEP, userId: USER_A, wordId: WORD_DEP });

    const res = await repo.listByUser(USER_A, { limit: 20 });
    expect(res.items).toHaveLength(0);
  });
});
