import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import {
  contributionReviews,
  contributions,
  examples,
  languages,
  meanings,
  pronunciations,
  users,
  wordClasses,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { ContributionRepositoryImpl } from '../../infrastructure/contribution.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const NOMINA = ulid26('01TESTWCNOMINA');
const KONTRIBUTOR = ulid26('01TESTKONTRIB');
const REVIEWER = ulid26('01TESTREVIEW');

describe.skipIf(!hasTestDb)('ContributionRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new ContributionRepositoryImpl(db);
  let wordId: string;

  beforeEach(async () => {
    await truncateAll(db);
    await db.insert(users).values([
      { id: KONTRIBUTOR, username: 'kontributor', email: 'kon@test.com', passwordHash: 'x' },
      { id: REVIEWER, username: 'reviewer', email: 'rev@test.com', passwordHash: 'x' },
    ]);
    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    await db.insert(wordClasses).values({ id: NOMINA, code: 'n', name: 'Nomina' });

    // Kata pending dari contributor (gerbang masuk antrean)
    await db.insert(words).values({
      id: ulid26('01TESTWORDKLN'),
      languageId: SMB,
      lemma: 'kalintiak',
      status: 'pending_review',
      createdBy: KONTRIBUTOR,
    });
    const [w] = await db.select().from(words).where(eq(words.lemma, 'kalintiak'));
    wordId = w.id;
    await db.insert(contributions).values({
      userId: KONTRIBUTOR,
      entityType: 'word',
      entityId: wordId,
      action: 'create',
      status: 'pending',
    });
  });

  async function contributionIdOf(entityId: string): Promise<string> {
    const [row] = await db.select().from(contributions).where(eq(contributions.entityId, entityId));
    return row.id;
  }

  it('list: filter status pending + username kontributor tersemat', async () => {
    const page = await repo.list({ status: 'pending', limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      entityType: 'word',
      entityId: wordId,
      status: 'pending',
      contributorUsername: 'kontributor',
      wordLemma: 'kalintiak',
    });
  });

  it('review approve (word): kata published + verified + anak ikut keputusan + review row', async () => {
    // anak-anak kata ikut submit kata → pending_review
    const [meaning] = await db
      .insert(meanings)
      .values({ wordId, wordClassId: NOMINA, definition: 'ikan kecil', orderIndex: 1, createdBy: KONTRIBUTOR })
      .returning();
    await db.insert(examples).values({
      meaningId: meaning.id,
      sourceLanguageId: SMB,
      sourceSentence: 'kalintiak di gorong',
      status: 'pending_review',
      createdBy: KONTRIBUTOR,
    });
    await db.insert(pronunciations).values({
      wordId,
      notation: 'ipa',
      value: '/kalintiak/',
      status: 'pending_review',
      createdBy: KONTRIBUTOR,
    });

    const cid = await contributionIdOf(wordId);
    const outcome = await repo.review({ contributionId: cid, decision: 'approve', reviewerId: REVIEWER, comment: null });

    expect(outcome).toMatchObject({ status: 'approved', entityType: 'word', entityId: wordId });

    const [wordRow] = await db.select().from(words).where(eq(words.id, wordId));
    expect(wordRow).toMatchObject({ status: 'published', isVerified: true, verifiedBy: REVIEWER });
    expect(wordRow.verifiedAt).not.toBeNull();

    const [exampleRow] = await db.select().from(examples);
    expect(exampleRow).toMatchObject({ status: 'published', isVerified: true });
    const [pronRow] = await db.select().from(pronunciations);
    expect(pronRow).toMatchObject({ status: 'published', isVerified: true });

    const [contribRow] = await db.select().from(contributions).where(eq(contributions.id, cid));
    expect(contribRow.status).toBe('approved');
    const [reviewRow] = await db.select().from(contributionReviews);
    expect(reviewRow).toMatchObject({ contributionId: cid, reviewerId: REVIEWER, status: 'approved' });
  });

  it('review reject (word): kata rejected + comment tersimpan; anak ikut rejected', async () => {
    const cid = await contributionIdOf(wordId);
    await repo.review({ contributionId: cid, decision: 'reject', reviewerId: REVIEWER, comment: 'bukan kosakata Sambas' });

    const [wordRow] = await db.select().from(words).where(eq(words.id, wordId));
    expect(wordRow.status).toBe('rejected');
    const [reviewRow] = await db.select().from(contributionReviews);
    expect(reviewRow).toMatchObject({ status: 'rejected', comment: 'bukan kosakata Sambas' });
  });

  it('double review → 409 CONTRIBUTION_ALREADY_REVIEWED (race-safe di dalam transaksi)', async () => {
    const cid = await contributionIdOf(wordId);
    await repo.review({ contributionId: cid, decision: 'approve', reviewerId: REVIEWER, comment: null });
    await expect(
      repo.review({ contributionId: cid, decision: 'reject', reviewerId: REVIEWER, comment: 'terlambat' }),
    ).rejects.toMatchObject({ errorCode: 'CONTRIBUTION_ALREADY_REVIEWED', statusCode: 409 });
  });

  it('review tidak ditemukan → 404 CONTRIBUTION_NOT_FOUND', async () => {
    await expect(
      repo.review({ contributionId: ulid26('01TESTNGACAK'), decision: 'approve', reviewerId: REVIEWER, comment: null }),
    ).rejects.toMatchObject({ errorCode: 'CONTRIBUTION_NOT_FOUND', statusCode: 404 });
  });

  it('review correct (anak pronunciation): patch diterapkan + is_corrected true + published', async () => {
    const [pron] = await db
      .insert(pronunciations)
      .values({ wordId, notation: 'ipa', value: '/salah/', status: 'pending_review', createdBy: KONTRIBUTOR })
      .returning();
    await db.insert(contributions).values({
      userId: KONTRIBUTOR,
      entityType: 'pronunciation',
      entityId: pron.id,
      action: 'create',
      status: 'pending',
    });

    const cid = await contributionIdOf(pron.id);
    const outcome = await repo.review({
      contributionId: cid,
      decision: 'correct',
      reviewerId: REVIEWER,
      comment: 'perbaiki pelafalan',
      childPatch: {
        pronunciation: { notation: 'ipa', value: '/kalintiak/', dialectId: null, audioUrl: null, speakerName: null, notes: null },
      },
    });

    expect(outcome).toMatchObject({ status: 'corrected', entityType: 'pronunciation' });
    const [pronRow] = await db.select().from(pronunciations).where(eq(pronunciations.id, pron.id));
    expect(pronRow).toMatchObject({ value: '/kalintiak/', status: 'published', isVerified: true, isCorrected: true });
  });

  it('findChildWithParent: gambar + referensi kata parent', async () => {
    const [img] = await db
      .insert(wordImages)
      .values({ wordId, providerFileId: 'pf-x', url: 'https://x.test/k.jpg', status: 'pending_review', createdBy: KONTRIBUTOR })
      .returning();
    const child = await repo.findChildWithParent('word_image', img.id);
    expect(child).toMatchObject({
      wordId,
      wordLemma: 'kalintiak',
      status: 'pending_review',
    });
    expect(child?.data).toMatchObject({ url: 'https://x.test/k.jpg' });
  });

  it('approve word saat lemma published sudah ada → merge meanings + soft-delete sumber', async () => {
    const publishedId = ulid26('01TESTWORDPUB');
    await db.insert(words).values({
      id: publishedId,
      languageId: SMB,
      lemma: 'kalintiak',
      status: 'published',
      isVerified: true,
      createdBy: REVIEWER,
    });
    await db.insert(meanings).values({
      wordId: publishedId,
      wordClassId: NOMINA,
      definition: 'makna A (sudah tayang)',
      orderIndex: 0,
      createdBy: REVIEWER,
    });

    const [pendingMeaning] = await db
      .insert(meanings)
      .values({
        wordId,
        wordClassId: NOMINA,
        definition: 'makna B (kontribusi kedua)',
        orderIndex: 0,
        createdBy: KONTRIBUTOR,
      })
      .returning();

    const cid = await contributionIdOf(wordId);
    const outcome = await repo.review({
      contributionId: cid,
      decision: 'approve',
      reviewerId: REVIEWER,
      comment: null,
    });

    expect(outcome).toMatchObject({
      status: 'approved',
      entityId: publishedId,
      mergedIntoWordId: publishedId,
    });

    const publishedMeanings = await db
      .select()
      .from(meanings)
      .where(eq(meanings.wordId, publishedId));
    expect(publishedMeanings.map((m) => m.definition).sort()).toEqual([
      'makna A (sudah tayang)',
      'makna B (kontribusi kedua)',
    ]);
    expect(publishedMeanings.find((m) => m.id === pendingMeaning.id)?.orderIndex).toBe(1);

    const [source] = await db.select().from(words).where(eq(words.id, wordId));
    expect(source.deletedAt).not.toBeNull();
    expect(source.status).toBe('rejected');

    const stillPublished = await db
      .select()
      .from(words)
      .where(eq(words.status, 'published'));
    expect(stillPublished).toHaveLength(1);
    expect(stillPublished[0].id).toBe(publishedId);
  });
});
