import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import {
  categories,
  contributionReviews,
  contributions,
  examples,
  languages,
  meanings,
  meaningTranslations,
  wordCategories,
  users,
  wordClasses,
  words,
} from '@/shared/database/drizzle/schema';
import { eq } from 'drizzle-orm';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { WordRepositoryImpl } from '../../infrastructure/word.repository.impl';
import type { WordToSave } from '../../domain/repositories/word.repository';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

// Fixture ULID — selalu 26 karakter (varchar(26))
const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const IDN = ulid26('01TESTLANGIDN');
const NOMINA = ulid26('01TESTWCNOMINA');
const MAKANAN = ulid26('01TESTCATMAKANAN');
const ACTOR = ulid26('01TESTACTOR');

function baseWord(overrides: Partial<WordToSave> = {}): WordToSave {
  return {
    languageId: SMB,
    lemma: 'makatn',
    meanings: [
      {
        wordClassId: NOMINA,
        definition: 'memasukkan makanan ke mulut',
        orderIndex: 1,
        translations: [
          { languageId: IDN, translationText: 'makan', translationType: 'direct' },
          { languageId: IDN, translationText: 'sudah makan', translationType: 'descriptive' },
        ],
        examples: [
          {
            sourceLanguageId: SMB,
            sourceSentence: 'Kami udah makatn tadi.',
            targetLanguageId: IDN,
            targetSentence: 'Kami sudah makan tadi.',
            sourceType: 'native_speaker',
          },
        ],
      },
    ],
    wordType: 'word',
    categoryIds: [MAKANAN],
    relatedWords: [],
    status: 'published',
    ...overrides,
  };
}

describe.skipIf(!hasTestDb)('WordRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new WordRepositoryImpl(db);

  beforeEach(async () => {
    // urutan hapus: anak dulu (FK) — satu util untuk semua test
    await truncateAll(db);

    await db.insert(users).values({ id: ACTOR, username: 'actor', email: 'actor@test.com', passwordHash: 'x' });
    await db.insert(languages).values([
      { id: SMB, code: 'smb', name: 'Sambas' },
      { id: IDN, code: 'id', name: 'Indonesia' },
    ]);
    await db.insert(wordClasses).values({ id: NOMINA, code: 'n', name: 'Nomina' });
    await db.insert(categories).values({ id: MAKANAN, name: 'Makanan' });
  });

  it('saveWithRelations: insert semua tabel anak dalam satu transaksi', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);

    expect(word.status).toBe('published');
    expect(await db.select().from(words).where(eq(words.id, word.id))).toHaveLength(1);
    expect(await db.select().from(meanings).where(eq(meanings.wordId, word.id))).toHaveLength(1);
    const [meaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    expect(await db.select().from(meaningTranslations).where(eq(meaningTranslations.meaningId, meaning.id))).toHaveLength(2);
    expect(await db.select().from(examples).where(eq(examples.meaningId, meaning.id))).toHaveLength(1);
    expect(await db.select().from(wordCategories).where(eq(wordCategories.wordId, word.id))).toHaveLength(1);
    expect(await db.select().from(contributions).where(eq(contributions.entityId, word.id))).toHaveLength(1);
    // published → tidak ada baris review
    expect(await db.select().from(contributionReviews)).toHaveLength(0);
  });

  it('status pending_review → baris contribution_reviews pending dibuat', async () => {
    await repo.saveWithRelations(baseWord({ status: 'pending_review' }), ACTOR);
    const reviews = await db.select().from(contributionReviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].status).toBe('pending');
    expect(reviews[0].reviewerId).toBeNull(); // ditunggu penugasan reviewer
  });

  it('BUKTI ROLLBACK: FK violation di tengah → ValidationError dan TIDAK ada baris words tersisa', async () => {
    const badCategoryId = ulid26('01TESTCATNGACAK');

    await expect(
      repo.saveWithRelations(baseWord({ categoryIds: [badCategoryId] }), ACTOR),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR', statusCode: 400 });

    // inti transaksi: insert words sudah jalan duluan, tapi rollback total
    expect(await db.select().from(words)).toHaveLength(0);
    expect(await db.select().from(meanings)).toHaveLength(0);
    expect(await db.select().from(contributions)).toHaveLength(0);
  });

  it('findDuplicate case-insensitive terhadap lemma', async () => {
    await repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR);
    expect(await repo.findDuplicate(SMB, 'MAKATN')).toBe(true);
    expect(await repo.findDuplicate(SMB, 'lain')).toBe(false);
  });

  it('saveWithRelations + findDetailById: gambar contoh tersimpan (provider-agnostic)', async () => {
    const word = await repo.saveWithRelations(
      baseWord({
        images: [
          {
            url: 'https://ik.imagekit.io/dev/words/makan.jpg',
            provider: 'imagekit',
            providerFileId: 'file_abc123',
            altText: 'Orang sedang makan',
            isPrimary: true,
          },
        ],
      }),
      ACTOR,
    );

    const detail = await repo.findDetailById(word.id);
    expect(detail?.images).toEqual([
      { url: 'https://ik.imagekit.io/dev/words/makan.jpg', altText: 'Orang sedang makan', isPrimary: true },
    ]);
  });

  it('EDGE CASE 23505: file gambar dipakai dua kata → ValidationError (bukan 500) + rollback', async () => {
    const gambar = {
      url: 'https://ik.imagekit.io/dev/words/sama.jpg',
      provider: 'imagekit',
      providerFileId: 'file_dipakai_dua',
      isPrimary: true,
    };
    await repo.saveWithRelations(baseWord({ lemma: 'pertama', images: [gambar] }), ACTOR);

    await expect(
      repo.saveWithRelations(baseWord({ lemma: 'kedua', images: [gambar] }), ACTOR),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR', statusCode: 400 });

    // kata kedua ter-rollback — hanya kata pertama yang ada
    expect(await db.select().from(words)).toHaveLength(1);
  });

  it('PERIBAHASA + has_component: detail frasa menampilkan komponen, detail komponen menampilkan appears_in', async () => {
    const miyang = await repo.saveWithRelations(baseWord({ lemma: 'miyang' }), ACTOR);
    const rabong = await repo.saveWithRelations(baseWord({ lemma: 'rabong' }), ACTOR);

    const pb = await repo.saveWithRelations(
      baseWord({
        lemma: 'miyang rabong',
        wordType: 'peribahasa',
        relatedWords: [
          { wordId: miyang.id, relationType: 'has_component' },
          { wordId: rabong.id, relationType: 'has_component' },
        ],
        variants: [
          {
            form: 'memakan',
            variantType: 'derivation',
            affixType: 'prefix',
            affixValue: 'me-',
            notes: 'awalan me-, /m/ menyesuaikan awal kata',
          },
        ],
      }),
      ACTOR,
    );

    // Detail peribahasa: komponen + variant ber-afiks
    const detail = await repo.findDetailById(pb.id);
    expect(detail?.wordType).toBe('peribahasa');
    expect(detail?.relatedWords).toEqual([
      { wordId: miyang.id, lemma: 'miyang', relationType: 'has_component' },
      { wordId: rabong.id, lemma: 'rabong', relationType: 'has_component' },
    ]);
    expect(detail?.variants[0]).toMatchObject({
      form: 'memakan',
      variantType: 'derivation',
      affixType: 'prefix',
      affixValue: 'me-',
    });

    // Detail komponen: muncul dalam peribahasa (invers — derived, tak disimpan)
    const detailMiyang = await repo.findDetailById(miyang.id);
    expect(detailMiyang?.appearsIn).toEqual([
      { wordId: pb.id, lemma: 'miyang rabong', relationType: 'has_component' },
    ]);

    // Search filter word_type hanya menampilkan frasa
    const hanyaPb = await repo.search({ q: '', wordType: 'peribahasa', limit: 10 });
    expect(hanyaPb.items.map((w) => w.lemma)).toEqual(['miyang rabong']);
  });

  it('findDetailById: lengkap untuk published, null untuk draft', async () => {
    const published = await repo.saveWithRelations(baseWord({ lemma: 'terbit' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'konsep', status: 'draft' }), ACTOR);

    const detail = await repo.findDetailById(published.id);
    expect(detail?.lemma).toBe('terbit');
    expect(detail?.meanings[0].translations.map((t) => t.translationText)).toEqual(['makan', 'sudah makan']);
    expect(detail?.meanings[0].examples[0].targetSentence).toBe('Kami sudah makan tadi.');
    expect(detail?.categories).toEqual([{ id: MAKANAN, name: 'Makanan' }]);
    expect(detail?.wordType).toBe('word');
    expect(detail?.relatedWords).toEqual([]);
    expect(detail?.appearsIn).toEqual([]);
    expect(detail?.variants).toEqual([]);

    const draft = await db.select().from(words).where(eq(words.lemma, 'konsep'));
    expect(await repo.findDetailById(draft[0].id)).toBeNull();
  });

  it('search REVERSE (Indonesia→Sambas): cari kata Sambas dari terjemahannya', async () => {
    await repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR); // terjemahan: 'makan', 'sudah makan'
    await repo.saveWithRelations(
      baseWord({
        lemma: 'minum',
        meanings: [
          {
            wordClassId: NOMINA,
            definition: 'menelan cairan',
            orderIndex: 1,
            translations: [{ languageId: IDN, translationText: 'minum', translationType: 'direct' }],
          },
        ],
      }),
      ACTOR,
    );

    // cari "makan" dari sisi Indonesia → dapat kata Sambas 'makatn'
    const hasil = await repo.search({ q: 'makan', searchIn: 'translation', limit: 10 });
    expect(hasil.items.map((w) => w.lemma)).toEqual(['makatn']);
    expect(hasil.items[0].matchedTranslation).toBe('makan');

    // filter bahasa terjemahan bekerja
    const terfilter = await repo.search({ q: 'makan', searchIn: 'translation', translationLanguageId: IDN, limit: 10 });
    expect(terfilter.items).toHaveLength(1);
  });

  it('search: ilike + cursor-based pagination (Section 13)', async () => {
    const [w1, w2] = await Promise.all([
      repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR),
      repo.saveWithRelations(baseWord({ lemma: 'makanan' }), ACTOR),
    ]);

    const hal1 = await repo.search({ q: 'maka', limit: 1 });
    expect(hal1.items).toHaveLength(1);
    expect(hal1.items[0].languageCode).toBe('smb');
    expect(hal1.hasMore).toBe(true);
    expect(hal1.nextCursor).toBe(hal1.items[0].id);

    const hal2 = await repo.search({ q: 'maka', limit: 1, cursor: hal1.nextCursor! });
    expect(hal2.items).toHaveLength(1);
    expect(hal2.items[0].id).not.toBe(hal1.items[0].id);
    expect(new Set([hal1.items[0].id, hal2.items[0].id])).toEqual(new Set([w1.id, w2.id]));
    expect(hal2.hasMore).toBe(false);
    expect(hal2.nextCursor).toBeNull();

    const hal3 = await repo.search({ q: 'maka', limit: 10 });
    expect(hal3.items).toHaveLength(2);
    expect(hal3.hasMore).toBe(false);
    expect(hal3.nextCursor).toBeNull();
  });

  it('findMissingReferences mendeteksi id yang tidak ada', async () => {
    const missing = await repo.findMissingReferences({
      languageId: ulid26('01TESTLANGNGACAK'),
      dialectId: undefined,
      wordClassIds: [NOMINA, ulid26('01TESTWCNGACAK')],
      languageIds: [IDN],
      categoryIds: [MAKANAN],
      relatedWordIds: [ulid26('01TESTWORDNGACAK')],
      variantDialectIds: [],
    });
    expect(missing.languageId).toBe(true);
    expect(missing.wordClasses).toEqual([ulid26('01TESTWCNGACAK')]);
    expect(missing.words).toEqual([ulid26('01TESTWORDNGACAK')]);
    expect(missing.categories).toEqual([]);
  });

  it('listWordClasses mengembalikan hierarki', async () => {
    const items = await repo.listWordClasses();
    expect(items[0]).toMatchObject({ code: 'n', name: 'Nomina', parentId: null });
  });
});
