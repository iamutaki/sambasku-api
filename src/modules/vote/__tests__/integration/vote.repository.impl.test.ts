import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import {
  comments,
  examples,
  languages,
  meanings,
  pronunciations,
  users,
  votes,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { VoteRepositoryImpl } from '../../infrastructure/vote.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const USER_A = ulid26('01TESTVOTERA');
const USER_B = ulid26('01TESTVOTERB');
const WORD = ulid26('01TESTWORDTGT');
const MEANING = ulid26('01TESTMEANTGT');

describe.skipIf(!hasTestDb)('VoteRepositoryImpl (integration, 08 doc)', () => {
  const repo = new VoteRepositoryImpl(getTestDb());

  beforeEach(async () => {
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    await db.insert(users).values([
      { id: USER_A, email: 'votera@test.com', username: 'votera' },
      { id: USER_B, email: 'voterb@test.com', username: 'voterb' },
    ]);
    await db.insert(words).values({ id: WORD, languageId: SMB, lemma: 'makatn' });
  });

  it('toggle: ON → searah ulang OFF → beda arah UPDATE (bukan baris baru), counts benar tiap langkah', async () => {
    const target = { entityType: 'word' as const, entityId: WORD };

    const on = await repo.toggle(USER_A, target, 1);
    expect(on).toEqual({ myVote: 1, upvotes: 1, downvotes: 0 });

    const off = await repo.toggle(USER_A, target, 1);
    expect(off).toEqual({ myVote: null, upvotes: 0, downvotes: 0 });

    const switched = await repo.toggle(USER_A, target, -1);
    expect(switched).toEqual({ myVote: -1, upvotes: 0, downvotes: 1 });

    // ganti arah = baris yang sama di-update, bukan insert baru
    const counts = await repo.countMany([target]);
    expect(counts.get(`word:${WORD}`)).toEqual({ upvotes: 0, downvotes: 1 });
  });

  it('unique constraint: user sama target sama selalu satu baris (upsert, bukan 23505)', async () => {
    const target = { entityType: 'word' as const, entityId: WORD };
    await repo.toggle(USER_A, target, 1);
    // toggle beda arah beruntun tidak pernah melempar unique violation
    await expect(repo.toggle(USER_A, target, -1)).resolves.toMatchObject({ myVote: -1 });
  });

  it('countMany lintas jenis target; target tanpa vote tidak ikut map', async () => {
    await repo.toggle(USER_A, { entityType: 'word', entityId: WORD }, 1);
    await repo.toggle(USER_B, { entityType: 'word', entityId: WORD }, 1);
    await repo.toggle(USER_B, { entityType: 'word', entityId: WORD }, 1); // B toggle searah = OFF

    const counts = await repo.countMany([
      { entityType: 'word', entityId: WORD },
      { entityType: 'meaning', entityId: MEANING },
    ]);
    expect(counts.get(`word:${WORD}`)).toEqual({ upvotes: 1, downvotes: 0 });
    expect(counts.has(`meaning:${MEANING}`)).toBe(false);
  });

  it('findUserVotes: hanya vote milik user itu untuk target batch', async () => {
    await repo.toggle(USER_A, { entityType: 'word', entityId: WORD }, 1);
    await repo.toggle(USER_B, { entityType: 'word', entityId: WORD }, -1);

    const mine = await repo.findUserVotes(USER_A, [
      { entityType: 'word', entityId: WORD },
      { entityType: 'meaning', entityId: MEANING },
    ]);
    expect(mine.get(`word:${WORD}`)).toBe(1);
    expect(mine.size).toBe(1);
  });

  it('targetExists: word hidup true; soft-deleted & tidak dikenal false', async () => {
    expect(await repo.targetExists({ entityType: 'word', entityId: WORD })).toBe(true);
    expect(await repo.targetExists({ entityType: 'word', entityId: ulid26('01TESTNGACAK') })).toBe(false);

    const db = getTestDb();
    await db.update(words).set({ deletedAt: new Date() }).where(eq(words.id, WORD));
    expect(await repo.targetExists({ entityType: 'word', entityId: WORD })).toBe(false);
  });

  it('listByUser: hanya vote user itu, desc id, cursor LIMIT+1, filter jenis dan arah', async () => {
    const db = getTestDb();
    await db.insert(meanings).values({ id: MEANING, wordId: WORD, definition: 'arti' });
    await repo.toggle(USER_A, { entityType: 'word', entityId: WORD }, 1);
    await repo.toggle(USER_A, { entityType: 'meaning', entityId: MEANING }, -1);
    await repo.toggle(USER_B, { entityType: 'word', entityId: WORD }, 1);

    const mineB = await repo.listByUser(USER_B, { limit: 20 });
    expect(mineB.items).toHaveLength(1);
    expect(mineB.items[0].entityType).toBe('word');

    const page1 = await repo.listByUser(USER_A, { limit: 1 });
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0].word).toMatchObject({ id: WORD, lemma: 'makatn' });

    const page2 = await repo.listByUser(USER_A, { limit: 1, cursor: page1.nextCursor! });
    expect(page2.hasMore).toBe(false);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(new Set([page1.items[0].entityType, page2.items[0].entityType])).toEqual(
      new Set(['word', 'meaning']),
    );

    const onlyUp = await repo.listByUser(USER_A, { limit: 20, value: 1 });
    expect(onlyUp.items.map((item) => item.entityType)).toEqual(['word']);

    const onlyMeaning = await repo.listByUser(USER_A, { limit: 20, targetType: 'meaning' });
    expect(onlyMeaning.items).toHaveLength(1);
    expect(onlyMeaning.items[0].value).toBe(-1);
  });

  it('listByUser: word terisi untuk 6 jenis; null jika kata soft-delete atau parent hilang', async () => {
    const db = getTestDb();
    const exampleId = ulid26('01TESTEXAMP01');
    const pronId = ulid26('01TESTPRONUN1');
    const imageId = ulid26('01TESTWIMAGE1');
    const commentId = ulid26('01TESTCOMMNT1');
    const goneWord = ulid26('01TESTWORDGON');
    const missingMeaning = ulid26('01TESTMEANMIS');

    await db.insert(words).values({
      id: goneWord,
      languageId: SMB,
      lemma: 'hilang',
      wordType: 'lemma',
      isVerified: true,
    });
    await db.update(words).set({ wordType: 'lemma', isVerified: true }).where(eq(words.id, WORD));
    await db.insert(meanings).values({ id: MEANING, wordId: WORD, definition: 'arti' });
    await db.insert(examples).values({
      id: exampleId,
      meaningId: MEANING,
      sourceLanguageId: SMB,
      sourceSentence: 'contoh',
    });
    await db.insert(pronunciations).values({ id: pronId, wordId: WORD, value: 'ma.katn' });
    await db.insert(wordImages).values({
      id: imageId,
      wordId: WORD,
      providerFileId: 'file-vote-hist',
      url: 'https://example.test/a.jpg',
    });
    await db.insert(comments).values({ id: commentId, wordId: WORD, userId: USER_A, body: 'komentar' });

    const targets = [
      { entityType: 'word' as const, entityId: WORD },
      { entityType: 'meaning' as const, entityId: MEANING },
      { entityType: 'example' as const, entityId: exampleId },
      { entityType: 'pronunciation' as const, entityId: pronId },
      { entityType: 'word_image' as const, entityId: imageId },
      { entityType: 'comment' as const, entityId: commentId },
    ];
    for (const target of targets) {
      await repo.toggle(USER_A, target, 1);
    }
    await repo.toggle(USER_A, { entityType: 'word', entityId: goneWord }, 1);
    await db.insert(votes).values({
      userId: USER_A,
      entityType: 'meaning',
      entityId: missingMeaning,
      value: -1,
    });
    await db.update(words).set({ deletedAt: new Date() }).where(eq(words.id, goneWord));

    const page = await repo.listByUser(USER_A, { limit: 20 });
    const byKey = new Map(page.items.map((item) => [`${item.entityType}:${item.entityId}`, item]));

    for (const target of targets) {
      expect(byKey.get(`${target.entityType}:${target.entityId}`)?.word).toMatchObject({
        id: WORD,
        lemma: 'makatn',
        wordType: 'lemma',
        isVerified: true,
      });
    }
    expect(byKey.get(`word:${goneWord}`)?.word).toBeNull();
    expect(byKey.get(`meaning:${missingMeaning}`)?.word).toBeNull();
    expect(page.items).toHaveLength(targets.length + 2);
  });
});
