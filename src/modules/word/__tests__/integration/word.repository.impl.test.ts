import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import {
  categories,
  contributionReviews,
  contributions,
  examples,
  languages,
  lexicalRelations,
  meanings,
  meaningTranslations,
  wordAudios,
  wordCategories,
  users,
  wordClasses,
  words,
} from '@/shared/database/drizzle/schema';
import { eq } from 'drizzle-orm';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { WordRepositoryImpl } from '../../infrastructure/word.repository.impl';
import { decodeLatestCursor, decodeListCursor } from '../../domain/repositories/word.repository';
import type { ResolvedInlineRelation } from '../../domain/repositories/word.repository';
import type { WordToSave } from '../../domain/repositories/word.repository';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

// Fixture ULID - selalu 26 karakter (varchar(26))
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
    isVerified: false,
    ...overrides,
  };
}

// 04: satu related inline (Form B) ter-resolusi - bentuk yang sama dengan
// output resolveInlineRelations use case (inherit + override).
function inlineSynonym(
  lemma: string,
  overrides: Partial<WordToSave> = {},
  inherit: { inheritedFrom?: Record<number, number>; inheritedMeaningsCount?: number; overriddenMeaningsCount?: number } = {},
): ResolvedInlineRelation {
  return {
    relationType: 'synonym',
    inlineWord: {
      languageId: SMB,
      lemma,
      wordType: 'word',
      meanings: baseWord().meanings,
      categoryIds: [],
      relatedWords: [],
      status: 'published',
      isVerified: true,
      ...overrides,
    },
    inheritedFrom: inherit.inheritedFrom ?? {},
    inheritedMeaningsCount: inherit.inheritedMeaningsCount ?? 0,
    overriddenMeaningsCount: inherit.overriddenMeaningsCount ?? 0,
  };
}

describe.skipIf(!hasTestDb)('WordRepositoryImpl', () => {
  const db = hasTestDb ? getTestDb() : null!;
  const repo = new WordRepositoryImpl(db);

  beforeEach(async () => {
    // urutan hapus: anak dulu (FK) - satu util untuk semua test
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

  it('Section 22 approval gate: baris review HANYA dibuat saat keputusan - status antrean turunan', async () => {
    // input 'published' (setara submit verifikator) → contributions.status approved
    const word = await repo.saveWithRelations(baseWord(), ACTOR);
    const [contribRow] = await db.select().from(contributions).where(eq(contributions.entityId, word.id));
    expect(contribRow.status).toBe('approved');

    // input 'pending_review' (setara submit contributor) → contributions.status pending
    const pending = await repo.saveWithRelations(
      baseWord({ lemma: 'kalintiak', status: 'pending_review' }),
      ACTOR,
    );
    expect(pending.status).toBe('pending_review');
    const [pendingContrib] = await db.select().from(contributions).where(eq(contributions.entityId, pending.id));
    expect(pendingContrib.status).toBe('pending');

    // tetap: tidak ada baris review otomatis saat submit
    expect(await db.select().from(contributionReviews)).toHaveLength(0);
  });

  it('kontribusi media: add* menulis status gerbang + baris contributions turunan', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);

    const pron = await repo.addPronunciation(
      word.id,
      { notation: 'ipa', value: '/baru/', status: 'pending_review', isVerified: false },
      ACTOR,
    );
    expect(pron.status).toBe('pending_review');
    const [pronContrib] = await db.select().from(contributions).where(eq(contributions.entityId, pron.id));
    expect(pronContrib).toMatchObject({ entityType: 'pronunciation', status: 'pending' });

    const img = await repo.addWordImage(
      word.id,
      {
        url: 'https://x.test/a.jpg',
        provider: 'github',
        providerFileId: 'pf-1',
        isPrimary: false,
        status: 'published',
        isVerified: true,
      },
      ACTOR,
    );
    const [imgContrib] = await db.select().from(contributions).where(eq(contributions.entityId, img.id));
    expect(imgContrib).toMatchObject({ entityType: 'word_image', status: 'approved' });

    const [meaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    const ex = await repo.addExample(
      meaning.id,
      { sourceLanguageId: SMB, sourceSentence: 'contoh baru', status: 'pending_review', isVerified: false },
      ACTOR,
    );
    const [exContrib] = await db.select().from(contributions).where(eq(contributions.entityId, ex.id));
    expect(exContrib).toMatchObject({ entityType: 'example', status: 'pending' });

    // filter publik: anak pending TIDAK tampil di detail, tampil saat includeAllStatuses
    const publik = await repo.findDetailById(word.id);
    const contohPublik = publik?.meanings.flatMap((m) => m.examples.map((e) => e.sourceSentence)) ?? [];
    expect(publik?.pronunciations.map((p) => p.value)).not.toContain('/baru/');
    expect(contohPublik).not.toContain('contoh baru');
    expect(publik?.images.map((i) => i.url)).toContain('https://x.test/a.jpg'); // published → tampil

    const review = await repo.findDetailById(word.id, { includeAllStatuses: true });
    expect(review?.pronunciations.map((p) => p.value)).toContain('/baru/');
    const contohReview = review?.meanings.flatMap((m) => m.examples) ?? [];
    expect(contohReview.find((e) => e.sourceSentence === 'contoh baru')?.status).toBe('pending_review');
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

  // ---- 05-api-edit-kata.md: update + duplikat exclude diri ----

  it('findDuplicate excludeWordId mengabaikan kata itu sendiri (edit ≠ duplikat diri)', async () => {
    const word = await repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR);
    expect(await repo.findDuplicate(SMB, 'makatn', word.id)).toBe(false); // diri sendiri
    expect(await repo.findDuplicate(SMB, 'makatn')).toBe(true); // tanpa exclude (perilaku create)
  });

  it('updateWithRelations: replace children lama → baru + baris contributions update', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);
    const [oldMeaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));

    const updated = await repo.updateWithRelations(
      word.id,
      baseWord({
        lemma: 'makatn',
        notes: 'catatan baru',
        meanings: [
          {
            wordClassId: NOMINA,
            definition: 'definisi BARU hasil edit',
            orderIndex: 1,
            translations: [
              { languageId: IDN, translationText: 'makan (edit)', translationType: 'direct' },
            ],
          },
        ],
        categoryIds: [],
      }),
      ACTOR,
    );

    expect(updated?.id).toBe(word.id);
    // children lama hilang, children baru muncul (full replace)
    const newMeanings = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    expect(newMeanings).toHaveLength(1);
    expect(newMeanings[0].id).not.toBe(oldMeaning.id);
    expect(newMeanings[0].definition).toBe('definisi BARU hasil edit');
    expect(await db.select().from(meaningTranslations).where(eq(meaningTranslations.meaningId, oldMeaning.id))).toHaveLength(0);
    expect(await db.select().from(wordCategories).where(eq(wordCategories.wordId, word.id))).toHaveLength(0);
    // jejak kontribusi update (action 'update')
    const rows = await db.select().from(contributions).where(eq(contributions.entityId, word.id));
    expect(rows.map((r) => r.action)).toContain('update');
  });

  it('updateWithRelations mempertahankan audio lemma dan audio contoh (id sama, example_id baru)', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);
    const [meaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    const [example] = await db.select().from(examples).where(eq(examples.meaningId, meaning.id));

    const lemmaAudioId = ulid26('01TESTAUDIOLEMMA');
    const exampleAudioId = ulid26('01TESTAUDIOCONTOH');
    await db.insert(wordAudios).values([
      {
        id: lemmaAudioId,
        wordId: word.id,
        provider: 'github',
        providerFileId: 'assets/audio/umum/makatn/lemma.m4a',
        url: 'https://cdn.example/lemma.m4a',
        mimeType: 'audio/mp4',
        fileSize: 1200,
        isPrimary: true,
        speakerName: 'Ani',
      },
      {
        id: exampleAudioId,
        wordId: word.id,
        exampleId: example.id,
        provider: 'github',
        providerFileId: 'assets/audio/umum/makatn/contoh.m4a',
        url: 'https://cdn.example/contoh.m4a',
        mimeType: 'audio/mp4',
        fileSize: 800,
        isPrimary: true,
      },
    ]);

    const updated = await repo.updateWithRelations(word.id, baseWord({ notes: 'tetap ada audio' }), ACTOR);
    expect(updated?.id).toBe(word.id);

    const audios = await db.select().from(wordAudios).where(eq(wordAudios.wordId, word.id));
    expect(audios.map((a) => a.id).sort()).toEqual([exampleAudioId, lemmaAudioId].sort());

    const lemma = audios.find((a) => a.id === lemmaAudioId);
    expect(lemma?.exampleId).toBeNull();
    expect(lemma?.speakerName).toBe('Ani');

    const [newMeaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    const [newExample] = await db.select().from(examples).where(eq(examples.meaningId, newMeaning.id));
    expect(newExample.id).not.toBe(example.id);
    expect(audios.find((a) => a.id === exampleAudioId)?.exampleId).toBe(newExample.id);
  });

  it('updateWithRelations membuang audio contoh jika kalimatnya dihapus, audio lemma tetap', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);
    const [meaning] = await db.select().from(meanings).where(eq(meanings.wordId, word.id));
    const [example] = await db.select().from(examples).where(eq(examples.meaningId, meaning.id));

    const lemmaAudioId = ulid26('01TESTAUDIOLEMMA');
    const exampleAudioId = ulid26('01TESTAUDIOCONTOH');
    await db.insert(wordAudios).values([
      {
        id: lemmaAudioId,
        wordId: word.id,
        provider: 'github',
        providerFileId: 'assets/audio/umum/makatn/lemma.m4a',
        url: 'https://cdn.example/lemma.m4a',
        mimeType: 'audio/mp4',
        fileSize: 1200,
        isPrimary: true,
      },
      {
        id: exampleAudioId,
        wordId: word.id,
        exampleId: example.id,
        provider: 'github',
        providerFileId: 'assets/audio/umum/makatn/contoh.m4a',
        url: 'https://cdn.example/contoh.m4a',
        mimeType: 'audio/mp4',
        fileSize: 800,
        isPrimary: false,
      },
    ]);

    const [keptMeaning] = baseWord().meanings;
    await repo.updateWithRelations(
      word.id,
      baseWord({ meanings: [{ ...keptMeaning, examples: [] }] }),
      ACTOR,
    );

    const audios = await db.select().from(wordAudios).where(eq(wordAudios.wordId, word.id));
    expect(audios).toHaveLength(1);
    expect(audios[0]?.id).toBe(lemmaAudioId);
    expect(audios[0]?.exampleId).toBeNull();
  });

  it('BUKTI ROLLBACK update: FK invalid di tengah → ValidationError dan data LAMA utuh', async () => {
    const word = await repo.saveWithRelations(baseWord(), ACTOR);
    const badCategoryId = ulid26('01TESTCATNGACAK');

    await expect(
      repo.updateWithRelations(
        word.id,
        baseWord({ notes: 'harusnya batal', categoryIds: [badCategoryId] }),
        ACTOR,
      ),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR', statusCode: 400 });

    // data lama TIDAK berubah: lemma/notes tetap, children lama tetap utuh
    const [row] = await db.select().from(words).where(eq(words.id, word.id));
    expect(row.notes).toBeNull();
    expect(await db.select().from(meanings).where(eq(meanings.wordId, word.id))).toHaveLength(1);
    expect(await db.select().from(wordCategories).where(eq(wordCategories.wordId, word.id))).toHaveLength(1);
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
      {
        id: expect.any(String),
        url: 'https://ik.imagekit.io/dev/words/makan.jpg',
        providerFileId: 'file_abc123', // wajib ikut: round-trip PUT edit
        altText: 'Orang sedang makan',
        isPrimary: true,
      },
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

    // kata kedua ter-rollback - hanya kata pertama yang ada
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

    // Detail komponen: muncul dalam peribahasa (invers - derived, tak disimpan)
    const detailMiyang = await repo.findDetailById(miyang.id);
    expect(detailMiyang?.appearsIn).toEqual([
      { wordId: pb.id, lemma: 'miyang rabong', relationType: 'has_component' },
    ]);

    // Search filter word_type hanya menampilkan frasa (publik = published)
    const hanyaPb = await repo.search({ q: '', wordType: 'peribahasa', limit: 10, published: true });
    expect(hanyaPb.items.map((w) => w.lemma)).toEqual(['miyang rabong']);
  });

  it('findDetailById: lengkap untuk published, null untuk draft', async () => {
    const published = await repo.saveWithRelations(baseWord({ lemma: 'terbit' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'konsep', status: 'draft' }), ACTOR);

    const detail = await repo.findDetailById(published.id);
    expect(detail?.lemma).toBe('terbit');
    expect(detail?.meanings[0].wordClass).toMatchObject({ id: NOMINA, code: 'n', name: 'Nomina' });
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
    const hasil = await repo.search({ q: 'makan', searchIn: 'translation', limit: 10, published: true });
    expect(hasil.items.map((w) => w.lemma)).toEqual(['makatn']);
    expect(hasil.items[0].matchedTranslation).toBe('makan');

    // filter bahasa terjemahan bekerja
    const terfilter = await repo.search({
      q: 'makan',
      searchIn: 'translation',
      translationLanguageId: IDN,
      limit: 10,
      published: true,
    });
    expect(terfilter.items).toHaveLength(1);
  });

  it('EDGE CASE: kata DRAFT tidak muncul di search publik (lemma maupun reverse)', async () => {
    await repo.saveWithRelations(baseWord({ lemma: 'publik1' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'draft1', status: 'draft' }), ACTOR);

    // lemma search: hanya publik1
    const hasil = await repo.search({ q: '', limit: 10, published: true });
    expect(hasil.items.map((w) => w.lemma)).toEqual(['publik1']);

    // reverse search: draft1 punya terjemahan 'makan' tapi tidak boleh muncul
    const reverse = await repo.search({ q: 'makan', searchIn: 'translation', limit: 10, published: true });
    expect(reverse.items.map((w) => w.lemma)).toEqual(['publik1']);

    // admin filter: tidak tayang → hanya draft
    const unpub = await repo.search({ q: '', limit: 10, published: false });
    expect(unpub.items.map((w) => w.lemma)).toEqual(['draft1']);

    // admin semua status
    const all = await repo.search({ q: '', limit: 10 });
    expect(all.items.map((w) => w.lemma).sort()).toEqual(['draft1', 'publik1']);
  });

  it('search: ilike + cursor-based pagination (Section 13)', async () => {
    // Sequential: SQLite single-writer — Promise.all dua transaksi tulis = SQLITE_BUSY
    const w1 = await repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR);
    const w2 = await repo.saveWithRelations(baseWord({ lemma: 'makanan' }), ACTOR);

    const hal1 = await repo.search({ q: 'maka', limit: 1, published: true });
    expect(hal1.items).toHaveLength(1);
    expect(hal1.items[0].languageCode).toBe('smb');
    expect(hal1.hasMore).toBe(true);
    expect(hal1.nextCursor).toBe(hal1.items[0].id);

    const hal2 = await repo.search({ q: 'maka', limit: 1, cursor: hal1.nextCursor!, published: true });
    expect(hal2.items).toHaveLength(1);
    expect(hal2.items[0].id).not.toBe(hal1.items[0].id);
    expect(new Set([hal1.items[0].id, hal2.items[0].id])).toEqual(new Set([w1.id, w2.id]));
    expect(hal2.hasMore).toBe(false);
    expect(hal2.nextCursor).toBeNull();

    const hal3 = await repo.search({ q: 'maka', limit: 10, published: true });
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
      inline: { wordClassIds: [], languageIds: [], categoryIds: [], variantDialectIds: [] },
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

  it('04: saveWithInlineRelations - SATU transaksi: induk + kata inline + relasi + contributions', async () => {
    const result = await repo.saveWithInlineRelations(baseWord(), ACTOR, [
      inlineSynonym('ngamakn'),
      inlineSynonym('badikn'),
    ]);

    // kata induk + 2 inline tersimpan
    expect(await db.select().from(words)).toHaveLength(3);
    expect(result.inlineCreatedWords).toHaveLength(2);
    expect(result.inlineCreatedWords.map((i) => i.lemma)).toEqual(['ngamakn', 'badikn']);

    const [parentRow] = await db.select().from(words).where(eq(words.id, result.word.id));
    expect(parentRow.status).toBe('published');

    // relasi source=induk → target=masing-masing inline
    const rels = await db.select().from(lexicalRelations);
    expect(rels).toHaveLength(2);
    expect(new Set(rels.map((r) => r.sourceWordId))).toEqual(new Set([result.word.id]));
    expect(new Set(rels.map((r) => r.targetWordId))).toEqual(
      new Set(result.inlineCreatedWords.map((i) => i.id)),
    );
    expect(rels.every((r) => r.relationType === 'synonym')).toBe(true);

    // contributions SATU per entitas (induk + 2 inline) - semua 'create'
    const contribs = await db.select().from(contributions);
    expect(contribs).toHaveLength(3);
    expect(new Set(contribs.map((c) => c.entityId))).toEqual(
      new Set([result.word.id, ...result.inlineCreatedWords.map((i) => i.id)]),
    );
    expect(contribs.every((c) => c.action === 'create' && c.entityType === 'word')).toBe(true);
  });

  it('04: provenance - makna inline berisi inherited_from_meaning_id yang mengarah ke makna induk', async () => {
    // induk 2 makna, inline menyalin 2 makna (inheritedFrom 0→0 dan 1→1)
    const duaMakna = [
      {
        wordClassId: NOMINA,
        definition: 'makna satu',
        orderIndex: 1,
        translations: [{ languageId: IDN, translationText: 'satu', translationType: 'direct' }],
      },
      {
        wordClassId: NOMINA,
        definition: 'makna dua',
        orderIndex: 2,
        translations: [{ languageId: IDN, translationText: 'dua', translationType: 'direct' }],
      },
    ];
    const result = await repo.saveWithInlineRelations(
      baseWord({ lemma: 'induk42', meanings: duaMakna }),
      ACTOR,
      [
        {
          relationType: 'synonym',
          inlineWord: {
            languageId: SMB,
            lemma: 'ngamakn',
            wordType: 'word',
            meanings: duaMakna,
            categoryIds: [],
            relatedWords: [],
            status: 'published',
            isVerified: true,
          },
          inheritedFrom: { 0: 0, 1: 1 },
          inheritedMeaningsCount: 2,
          overriddenMeaningsCount: 0,
        },
      ],
    );

    const [parentMeaning1, parentMeaning2] = await db
      .select({ id: meanings.id })
      .from(meanings)
      .where(eq(meanings.wordId, result.word.id))
      .orderBy(meanings.orderIndex);

    const inlineMeanings = await db
      .select()
      .from(meanings)
      .where(eq(meanings.wordId, result.inlineCreatedWords[0].id))
      .orderBy(meanings.orderIndex);
    expect(inlineMeanings).toHaveLength(2);
    expect(inlineMeanings[0].inheritedFromMeaningId).toBe(parentMeaning1.id);
    expect(inlineMeanings[1].inheritedFromMeaningId).toBe(parentMeaning2.id);
    // makna inline membawa definisi salinan induk
    expect(inlineMeanings[0].definition).toBe('makna satu');
    expect(inlineMeanings[0].wordClassId).toBe(NOMINA);
  });

  it('04: rollback - kata inline kedua pakai word_class FK palsu', async () => {
    await expect(
      repo.saveWithInlineRelations(baseWord({ lemma: 'induk' }), ACTOR, [
        inlineSynonym('ngamakn'),
        inlineSynonym('badikn', {
          meanings: [
            {
              wordClassId: ulid26('01TESTWCNGACAK'), // FK tidak ada → 23503
              definition: 'x',
              orderIndex: 1,
              translations: [{ languageId: IDN, translationText: 'y', translationType: 'direct' }],
            },
          ],
        }),
      ]),
    ).rejects.toBeTruthy();

    // rollback total: TIDAK ada kata (induk pun), tidak ada meanings/relasi/contribs
    expect(await db.select().from(words)).toHaveLength(0);
    expect(await db.select().from(meanings)).toHaveLength(0);
    expect(await db.select().from(lexicalRelations)).toHaveLength(0);
    expect(await db.select().from(contributions)).toHaveLength(0);
  });

  it('04: findDetailById - makna inline memuat provenance; inline pending_review belumlah related_words induk', async () => {
    const result = await repo.saveWithInlineRelations(baseWord({ lemma: 'induk4' }), ACTOR, [
      inlineSynonym('inlinepublik', {}, { inheritedFrom: { 0: 0 }, inheritedMeaningsCount: 1, overriddenMeaningsCount: 0 }),
      // contributor-style: pending_review - TIDAK tayang
      inlineSynonym('inlinepending', { status: 'pending_review', isVerified: false }),
    ]);

    const detail = await repo.findDetailById(result.word.id);
    expect(detail).not.toBeNull();
    // hanya synonym publik yang tampil sebagai related_words (relasi filter published)
    expect(detail!.relatedWords.map((r) => r.lemma)).toEqual(['inlinepublik']);

    // detail kata inline (publik): makna memuat provenance ke makna induk
    const inlineDetail = await repo.findDetailById(result.inlineCreatedWords[0].id);
    expect(inlineDetail).not.toBeNull();
    expect(inlineDetail!.meanings[0].inheritedFromMeaningId).toBeTypeOf('string');

    // kata inline pending_review: tidak tampil lewat detail publik (404), tapi
    // tampil lewat includeAllStatuses (layar review) dengan provenance null
    const pendingDetail = await repo.findDetailById(result.inlineCreatedWords[1].id);
    expect(pendingDetail).toBeNull();
    const pendingReview = await repo.findDetailById(result.inlineCreatedWords[1].id, { includeAllStatuses: true });
    expect(pendingReview).not.toBeNull();
    expect(pendingReview!.meanings[0].inheritedFromMeaningId).toBeNull();
  });

  // ---- 18-api-list-words.md: listAtoZ (browsing A-Z, keyset komposit) ----

  it('listAtoZ: urut (lemma, id) ASC, hanya published, keyset lintas halaman tanpa duplikat', async () => {
    const budu = await repo.saveWithRelations(baseWord({ lemma: 'budu' }), ACTOR);
    const apam1 = await repo.saveWithRelations(baseWord({ lemma: 'apam' }), ACTOR);
    const apam2 = await repo.saveWithRelations(baseWord({ lemma: 'apam' }), ACTOR); // lemma kembar
    await repo.saveWithRelations(baseWord({ lemma: 'zeta', status: 'draft' }), ACTOR); // tidak tayang

    const p1 = await repo.listAtoZ({ q: '', limit: 2 });
    expect(p1.items.map((w) => w.lemma)).toEqual(['apam', 'apam']);
    // tie-breaker id: kembar urut id ASC (string compare = urutan b-tree)
    expect(p1.items[0]!.id < p1.items[1]!.id).toBe(true);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).not.toBeNull();
    // cursor decode → pasangan (lemma, id) item terakhir halaman
    expect(decodeListCursor(p1.nextCursor!)).toEqual({
      lemma: 'apam',
      id: p1.items[1]!.id,
    });

    const p2 = await repo.listAtoZ({ q: '', limit: 2, cursor: decodeListCursor(p1.nextCursor!) });
    expect(p2.items.map((w) => w.id)).toEqual([budu.id]); // draft zeta tidak ikut
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();

    // gabungan = A-Z penuh, tiap kata tepat sekali (apam kembar keduanya)
    expect([...p1.items, ...p2.items].map((w) => w.id).sort()).toEqual(
      [apam1.id, apam2.id, budu.id].sort(),
    );
  });

  it('listAtoZ: urut lower(lemma) case-insensitive (bukan collation C mentah)', async () => {
    // Collation "C" pada lemma mentah: "Zebra" < "apam" (Z ASCII sebelum a).
    // Sort A-Z kamus harus: apam → Zebra (via lower()).
    await repo.saveWithRelations(baseWord({ lemma: 'Zebra' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'apam' }), ACTOR);

    const page = await repo.listAtoZ({ q: '', limit: 10 });
    expect(page.items.map((w) => w.lemma)).toEqual(['apam', 'Zebra']);
  });

  it('listAtoZ: q ILIKE case-insensitive memfilter + karakter LIKE di-escape', async () => {
    await repo.saveWithRelations(baseWord({ lemma: 'makatn' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'miyang' }), ACTOR);

    const hit = await repo.listAtoZ({ q: 'MAK', limit: 10 });
    expect(hit.items.map((w) => w.lemma)).toEqual(['makatn']);
    expect(hit.items[0]!.languageCode).toBe('smb');

    // q = '%' TIDAK boleh match semua (escapeLike)
    const escaped = await repo.listAtoZ({ q: '%', limit: 10 });
    expect(escaped.items).toHaveLength(0);
  });

  it('listAtoZ: word_type memfilter', async () => {
    await repo.saveWithRelations(baseWord({ lemma: 'kiasan', wordType: 'peribahasa' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'biasa' }), ACTOR);

    const tipe = await repo.listAtoZ({ q: '', limit: 10, wordType: 'peribahasa' });
    expect(tipe.items.map((w) => w.lemma)).toEqual(['kiasan']);
  });

  it('listAtoZ: sense = [kode] terjemahan dipisah koma lintas makna', async () => {
    const VERBA = ulid26('01TESTWCVERBA');
    await db.insert(wordClasses).values({ id: VERBA, code: 'v', name: 'Verba' });

    await repo.saveWithRelations(
      baseWord({
        lemma: 'makatn',
        meanings: [
          {
            wordClassId: NOMINA,
            definition: '-',
            isHaveDefinition: false,
            orderIndex: 1,
            translations: [
              { languageId: IDN, translationText: 'makan', translationType: 'direct' },
            ],
          },
          {
            wordClassId: VERBA,
            definition: '-',
            isHaveDefinition: false,
            orderIndex: 2,
            translations: [
              { languageId: IDN, translationText: 'santap', translationType: 'direct' },
            ],
          },
        ],
      }),
      ACTOR,
    );
    // Placeholder "-" tidak ikut gloss.
    await repo.saveWithRelations(
      baseWord({
        lemma: 'polos',
        meanings: [
          {
            wordClassId: NOMINA,
            definition: '-',
            isHaveDefinition: false,
            orderIndex: 1,
            translations: [
              { languageId: IDN, translationText: '-', translationType: 'direct' },
            ],
          },
        ],
      }),
      ACTOR,
    );

    const page = await repo.listAtoZ({ q: '', limit: 10 });
    const byLemma = new Map(page.items.map((w) => [w.lemma, w]));
    expect(byLemma.get('makatn')?.sense).toBe('[n] makan,[v] santap');
    expect(byLemma.get('polos')?.sense).toBeNull();
  });

  it('listLatest: urut persetujuan DESC, keyset tanpa duplikat, pending tidak ikut, sense terisi', async () => {
    const lama = await repo.saveWithRelations(baseWord({ lemma: 'lama' }), ACTOR);
    const tengah = await repo.saveWithRelations(baseWord({ lemma: 'tengah' }), ACTOR);
    const baru = await repo.saveWithRelations(baseWord({ lemma: 'baru' }), ACTOR);
    await repo.saveWithRelations(baseWord({ lemma: 'antre', status: 'pending_review' }), ACTOR);

    await repo.setVerified(lama.id, {
      isVerified: true,
      verifiedBy: ACTOR,
      verifiedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await repo.setVerified(tengah.id, {
      isVerified: true,
      verifiedBy: ACTOR,
      verifiedAt: new Date('2021-06-01T00:00:00.000Z'),
    });
    await repo.setVerified(baru.id, {
      isVerified: true,
      verifiedBy: ACTOR,
      verifiedAt: new Date('2022-03-01T00:00:00.000Z'),
    });

    const p1 = await repo.listLatest({ limit: 2 });
    expect(p1.items.map((w) => w.lemma)).toEqual(['baru', 'tengah']);
    expect(p1.items[0]!.sense).toBe('memasukkan makanan ke mulut');
    expect(p1.hasMore).toBe(true);
    expect(decodeLatestCursor(p1.nextCursor!)).toEqual({
      approvedAt: p1.items[1]!.approvedAt,
      id: p1.items[1]!.id,
    });

    const p2 = await repo.listLatest({
      limit: 2,
      cursor: decodeLatestCursor(p1.nextCursor!),
    });
    expect(p2.items.map((w) => w.lemma)).toEqual(['lama']);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();
    expect([...p1.items, ...p2.items].map((w) => w.id).sort()).toEqual(
      [baru.id, tengah.id, lama.id].sort(),
    );
  });

  it('listLatest: waktu persetujuan sama dipecah id DESC', async () => {
    const first = await repo.saveWithRelations(baseWord({ lemma: 'satu' }), ACTOR);
    const second = await repo.saveWithRelations(baseWord({ lemma: 'dua' }), ACTOR);
    const at = new Date('2024-01-01T00:00:00.000Z');
    await repo.setVerified(first.id, { isVerified: true, verifiedBy: ACTOR, verifiedAt: at });
    await repo.setVerified(second.id, { isVerified: true, verifiedBy: ACTOR, verifiedAt: at });

    const higher = first.id > second.id ? first : second;
    const lower = higher.id === first.id ? second : first;
    const page = await repo.listLatest({ limit: 10 });
    expect(page.items.map((w) => w.id)).toEqual([higher.id, lower.id]);
  });

  it('listLatest: definisi kosong jatuh ke terjemahan; verified_at null tetap tayang', async () => {
    const plain = await repo.saveWithRelations(baseWord({ lemma: 'polos', isVerified: false }), ACTOR);
    await repo.saveWithRelations(
      baseWord({
        lemma: 'tanpadef',
        meanings: [
          {
            wordClassId: NOMINA,
            definition: '-',
            isHaveDefinition: false,
            orderIndex: 1,
            translations: [{ languageId: IDN, translationText: 'makan', translationType: 'direct' }],
          },
        ],
      }),
      ACTOR,
    );

    const page = await repo.listLatest({ limit: 10 });
    const byLemma = new Map(page.items.map((w) => [w.lemma, w]));
    expect(byLemma.get('tanpadef')?.sense).toBe('makan');
    expect(byLemma.get('polos')?.sense).toBe('memasukkan makanan ke mulut');
    expect(byLemma.get('polos')?.approvedAt.getTime()).toBe(plain.createdAt.getTime());
  });
});
