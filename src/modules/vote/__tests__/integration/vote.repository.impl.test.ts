import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { languages, users, words } from '@/shared/database/drizzle/schema';
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
});
