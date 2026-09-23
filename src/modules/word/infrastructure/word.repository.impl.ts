import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { ilikeCompat } from '@/shared/database/drizzle/ilike-compat';
import { isForeignKeyViolation, isUniqueViolation } from '@/shared/database/drizzle/sqlite-errors';
import {
  categories,
  contributions,
  dialects,
  examples,
  languages,
  lexicalRelations,
  meanings,
  meaningTranslations,
  pronunciations,
  users,
  wordCategories,
  wordClasses,
  wordImages,
  wordAudios,
  wordVariants,
  words,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase, AppTransaction } from '@/shared/database/drizzle/client';
import { ConflictError, ValidationError } from '@/shared/errors/app-error';
import { publishOrMergeMeaningsInTx } from './publish-or-merge-meanings';
import type { ChildStatus, LatestWordSummary, Word, WordDetail, WordStatus, WordSummary } from '../domain/entities/word.entity';
import type { MeaningMedia } from '../domain/entities/meaning.entity';
import type {
  CursorPage,
  ExampleMedia,
  InlineCreatedWordSummary,
  ListAtoZParams,
  ListLatestParams,
  MissingReferences,
  PronunciationMedia,
  ReferenceCheck,
  ResolvedInlineRelation,
  SaveWithInlineResult,
  SearchParams,
  WordAudioMedia,
  WordImageMedia,
  WordRepository,
  WordToSave,
} from '../domain/repositories/word.repository';
import { encodeLatestCursor, encodeListCursor } from '../domain/repositories/word.repository';
import type { CreateWordRelatedDto } from '../application/dto/create-word.dto';

function verificationCols(isVerified: boolean, actorId: string, at = new Date()) {
  return isVerified
    ? { verifiedBy: actorId, verifiedAt: at }
    : { verifiedBy: null, verifiedAt: null };
}

// Tipe transaction Drizzle (pg) - dipakai helper yang menerima tx
type Tx = AppTransaction;

function toWord(row: typeof words.$inferSelect): Word {
  return {
    id: row.id,
    languageId: row.languageId,
    lemma: row.lemma,
    notes: row.notes,
    wordType: row.wordType as Word['wordType'],
    status: row.status as WordStatus,
    isVerified: row.isVerified,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    isCorrected: row.isCorrected,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    takedownReasonCode: row.takedownReasonCode,
    takedownNote: row.takedownNote,
    takenDownBy: row.takenDownBy,
    takenDownAt: row.takenDownAt,
  };
}

function toPronunciation(row: typeof pronunciations.$inferSelect): PronunciationMedia {
  return {
    id: row.id,
    wordId: row.wordId,
    dialectId: row.dialectId,
    notation: row.notation,
    value: row.value,
    audioUrl: row.audioUrl,
    speakerName: row.speakerName,
    notes: row.notes,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function toWordImage(row: typeof wordImages.$inferSelect): WordImageMedia {
  return {
    id: row.id,
    wordId: row.wordId,
    provider: row.provider,
    providerFileId: row.providerFileId,
    sha: row.sha ?? null,
    url: row.url,
    altText: row.altText,
    isPrimary: row.isPrimary,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function toWordAudio(row: typeof wordAudios.$inferSelect): WordAudioMedia {
  return {
    id: row.id,
    wordId: row.wordId,
    exampleId: row.exampleId,
    dialectId: row.dialectId,
    provider: row.provider,
    providerFileId: row.providerFileId,
    sha: row.sha,
    url: row.url,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    durationMs: row.durationMs,
    speakerName: row.speakerName,
    isPrimary: row.isPrimary,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function toExample(row: typeof examples.$inferSelect): ExampleMedia {
  return {
    id: row.id,
    meaningId: row.meaningId,
    sourceLanguageId: row.sourceLanguageId,
    sourceSentence: row.sourceSentence,
    targetLanguageId: row.targetLanguageId,
    targetSentence: row.targetSentence,
    sourceType: row.sourceType,
    notes: row.notes,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// Anak yang ikut submit kata mengikuti gerbang kata-nya (Section 22 -
// approval gate): kata pending → anak pending; approve/reject kata ikut
// memutuskan nasib anak-anaknya (lihat ContributionRepositoryImpl.review).
function childStatusOf(wordStatus: WordStatus): ChildStatus {
  return wordStatus === 'published' ? 'published' : 'pending_review';
}

// Antrean mengikuti "perlu dicek", bukan "belum tayang".
// pending_review (tamu) dan published yang belum diverifikasi masuk pending.
// Draft dan publikasi verifikator (published + verified) tidak mengantre.
function contributionStatusOf(status: string, isVerified: boolean): 'pending' | 'approved' {
  if (status === 'pending_review') return 'pending';
  if (status === 'published' && !isVerified) return 'pending';
  return 'approved';
}

// Mapping error PostgreSQL untuk insert kontribusi media - jangan bocor 500
function mapMediaViolation(err: unknown, uniqueField: string): void {
  if (isForeignKeyViolation(err)) {
    throw new ValidationError([
      { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
    ]);
  }
  if (isUniqueViolation(err)) {
    throw new ValidationError([{ field: uniqueField, message: 'Data duplikat - sudah ada entri yang sama' }]);
  }
}

export class WordRepositoryImpl implements WordRepository {
  constructor(private readonly db: AppDatabase) {}

  async saveWithRelations(word: WordToSave, actorId: string): Promise<Word> {
    try {
      return await this.db.transaction(async (tx) => {
        const [wordRow] = await tx
          .insert(words)
          .values({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            createdBy: actorId,
            ...verificationCols(word.isVerified, actorId),
          })
          .returning();
        const wordId = wordRow.id;

        await this.insertChildren(tx, wordId, word, actorId);

        // Catat kontribusi (Section 22 - approval gate): status antrean
        // turunan dari status entity; baris contribution_reviews dibuat
        // saat verifikator mengambil keputusan (modul contribution)
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: wordId,
          action: 'create',
          status: contributionStatusOf(word.status, word.isVerified),
          ...(word.searchMissId ? { searchMissId: word.searchMissId } : {}),
        });

        return toWord(wordRow);
      });
    } catch (err) {
      // Race FK: id valid saat pre-check, tapi terhapus sebelum transaksi
      // jalan - petakan ke VALIDATION_ERROR, jangan bocor jadi 500
      if (isForeignKeyViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      // Duplikat unik (kategori sama 2×, terjemahan identik, file gambar
      // sudah dipakai kata lain) → juga 400, bukan 500
      if (isUniqueViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  /**
   * 04-api-sinonim-inline.md - induk + N kata inline dalam SATU transaksi:
   * 1) induk + anak2 + id makna induk utk provenance; 2) tiap kata inline
   * + makna hasil resolusi (kelola inherited_from_meaning_id); 3) relasi
   * lexical (source=induk, target=inline); 4) contributions satu per entitas.
   */
  async saveWithInlineRelations(
    word: WordToSave,
    actorId: string,
    related: ResolvedInlineRelation[],
  ): Promise<SaveWithInlineResult> {
    try {
      return await this.db.transaction(async (tx) => {
        // 1) INDUK + children; kumpulkan id makna induk (index = posisi array)
        const [wordRow] = await tx
          .insert(words)
          .values({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            createdBy: actorId,
            ...verificationCols(word.isVerified, actorId),
          })
          .returning();
        const wordId = wordRow.id;

        const parentMeaningIds: string[] = [];
        await this.insertChildren(tx, wordId, word, actorId, { meaningIdsOut: parentMeaningIds });
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: wordId,
          action: 'create',
          status: contributionStatusOf(word.status, word.isVerified),
          ...(word.searchMissId ? { searchMissId: word.searchMissId } : {}),
        });

        // 2) tiap kata inline
        const inlineCreatedWords: InlineCreatedWordSummary[] = [];
        for (const rel of related) {
          const [inlineRow] = await tx
            .insert(words)
            .values({
              languageId: word.languageId,
              lemma: rel.inlineWord.lemma.trim(),
              notes: rel.inlineWord.notes ?? null,
              wordType: rel.inlineWord.wordType,
              status: rel.inlineWord.status,
              isVerified: rel.inlineWord.isVerified,
              isCorrected: rel.inlineWord.isCorrected ?? false,
              createdBy: actorId,
              ...verificationCols(rel.inlineWord.isVerified, actorId),
            })
            .returning();
          const inlineId = inlineRow.id;

          // provenan: index makna inline → id makna INDUK (self-FK meanings).
          // Override TIDAK masuk map → kolom NULL (makna sudah mandiri).
          const inheritedByIdx: Record<number, string> = {};
          for (const [inlineIdx, parentIdx] of Object.entries(rel.inheritedFrom ?? {})) {
            const parentId = parentMeaningIds[parentIdx];
            if (parentId) inheritedByIdx[Number(inlineIdx)] = parentId;
          }
          await this.insertChildren(tx, inlineId, rel.inlineWord, actorId, {
            inheritedFrom: inheritedByIdx,
          });

          // 3) relasi: source = induk → target = inline
          await tx.insert(lexicalRelations).values({
            sourceWordId: wordId,
            targetWordId: inlineId,
            relationType: rel.relationType,
            createdBy: actorId,
          });

          // 4) contributions per entitas inline
          await tx.insert(contributions).values({
            userId: actorId,
            entityType: 'word',
            entityId: inlineId,
            action: 'create',
            status: contributionStatusOf(rel.inlineWord.status, rel.inlineWord.isVerified),
          });

          inlineCreatedWords.push({
            id: inlineId,
            lemma: inlineRow.lemma,
            relationType: rel.relationType,
            wordType: inlineRow.wordType as Word['wordType'],
            status: inlineRow.status as WordStatus,
            isVerified: inlineRow.isVerified,
            meaningsCount: rel.inlineWord.meanings.length,
            inheritedMeaningsCount: rel.inheritedMeaningsCount,
            overriddenMeaningsCount: rel.overriddenMeaningsCount,
          });
        }

        return { word: toWord(wordRow), inlineCreatedWords };
      });
    } catch (err) {
      // Race FK / duplikat unik - petakan ke 400, jangan bocor jadi 500
      if (isForeignKeyViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      if (isUniqueViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  async findDuplicate(
    languageId: string,
    lemma: string,
    excludeWordId?: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: words.id })
      .from(words)
      .where(
        and(
          eq(words.languageId, languageId),
          sql`lower(${words.lemma}) = lower(${lemma.trim()})`,
          isNull(words.deletedAt),
          // 05-api-edit-kata.md: edit mengabaikan dirinya sendiri
          ...(excludeWordId ? [ne(words.id, excludeWordId)] : []),
        ),
      )
      .limit(1);
    return !!row;
  }

  async findPublishedIdByLemma(lemma: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: words.id })
      .from(words)
      .where(
        and(
          sql`lower(${words.lemma}) = lower(${lemma.trim()})`,
          eq(words.status, 'published'),
          isNull(words.deletedAt),
        ),
      )
      // Homonim: entri terverifikasi duluan, lalu terlama (deterministik)
      .orderBy(desc(words.isVerified), words.createdAt)
      .limit(1);
    return row?.id ?? null;
  }

  async findDetailById(
    id: string,
    opts?: { includeAllStatuses?: boolean },
  ): Promise<WordDetail | null> {
    const includeAll = opts?.includeAllStatuses === true;
    const verifierUsers = alias(users, 'word_verifier');
    const creatorUsers = alias(users, 'word_creator');
    const [joined] = await this.db
      .select({
        word: words,
        verifierUsername: verifierUsers.username,
        verifierRole: verifierUsers.role,
        creatorUsername: creatorUsers.username,
        creatorRole: creatorUsers.role,
      })
      .from(words)
      .leftJoin(verifierUsers, eq(words.verifiedBy, verifierUsers.id))
      .leftJoin(creatorUsers, eq(words.createdBy, creatorUsers.id))
      .where(
        includeAll
          ? and(eq(words.id, id), isNull(words.deletedAt))
          : and(eq(words.id, id), eq(words.status, 'published'), isNull(words.deletedAt)),
      )
      .limit(1);
    if (!joined) return null;
    const wordRow = joined.word;

    const meaningRows = await this.db
      .select()
      .from(meanings)
      .where(
        and(
          eq(meanings.wordId, id),
          isNull(meanings.deletedAt),
          // 17: makna kontribusi (pending_review) tidak tayang publik -
          // pola examples/pronunciations di bawah; admin memakai includeAll
          includeAll ? undefined : eq(meanings.status, 'published'),
        ),
      )
      .orderBy(meanings.orderIndex);

    // Kelas kata tersemat per makna (Nomina/Verba/…) - satu query, map by id
    const wordClassIds = [...new Set(meaningRows.map((m) => m.wordClassId).filter((x): x is string => !!x))];
    const wcRows =
      wordClassIds.length > 0
        ? await this.db.select().from(wordClasses).where(inArray(wordClasses.id, wordClassIds))
        : [];
    const wcById = new Map(wcRows.map((wc) => [wc.id, wc]));

    const meaningIds = meaningRows.map((m) => m.id);

    const translationRows =
      meaningIds.length > 0
        ? await this.db
            .select()
            .from(meaningTranslations)
            .where(
              and(inArray(meaningTranslations.meaningId, meaningIds), isNull(meaningTranslations.deletedAt)),
            )
        : [];

    const exampleRows =
      meaningIds.length > 0
        ? await this.db
            .select()
            .from(examples)
            .where(
              and(
                inArray(examples.meaningId, meaningIds),
                isNull(examples.deletedAt),
                // Approval gate: anak pending/rejected tidak tayang di publik
                includeAll ? undefined : eq(examples.status, 'published'),
              ),
            )
        : [];

    const categoryRows = await this.db
      .select({ id: categories.id, name: categories.name })
      .from(wordCategories)
      .innerJoin(categories, eq(wordCategories.categoryId, categories.id))
      .where(eq(wordCategories.wordId, id));

    const pronRows = await this.db
      .select()
      .from(pronunciations)
      .where(
        and(
          eq(pronunciations.wordId, id),
          isNull(pronunciations.deletedAt),
          includeAll ? undefined : eq(pronunciations.status, 'published'),
        ),
      );

    const imageRows = await this.db
      .select()
      .from(wordImages)
      .where(
        and(
          eq(wordImages.wordId, id),
          isNull(wordImages.deletedAt),
          includeAll ? undefined : eq(wordImages.status, 'published'),
        ),
      );

    const audioRows = await this.db
      .select()
      .from(wordAudios)
      .where(
        and(
          eq(wordAudios.wordId, id),
          isNull(wordAudios.deletedAt),
          includeAll ? undefined : eq(wordAudios.status, 'published'),
        ),
      );

    // Relasi maju (entri ini → entri lain) + lemma target. Hanya tampil saat
    // TARGET juga published (Section 7.7: sinonim pending_review belum muncul).
    const relatedRows = await this.db
      .select({
        wordId: lexicalRelations.targetWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.targetWordId))
      .where(
        and(
          eq(lexicalRelations.sourceWordId, id),
          isNull(lexicalRelations.deletedAt),
          includeAll ? undefined : and(eq(words.status, 'published'), isNull(words.deletedAt)),
        ),
      )
      // Alfabetis lemma, BUKAN id relasi: ULID se-milidetik berurutan acak
      // (komponen randomness) - order by id bikin urutan flip-flop antar run
      .orderBy(asc(words.lemma));

    // Relasi invers (entri lain → entri ini): "muncul dalam" - derived, tak disimpan.
    // Hanya tampil saat SUMBER relasi published.
    const appearsRows = await this.db
      .select({
        wordId: lexicalRelations.sourceWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.sourceWordId))
      .where(
        and(
          eq(lexicalRelations.targetWordId, id),
          isNull(lexicalRelations.deletedAt),
          includeAll ? undefined : and(eq(words.status, 'published'), isNull(words.deletedAt)),
        ),
      )
      // Alfabetis lemma (konsisten dengan relatedWords di atas)
      .orderBy(asc(words.lemma));

    const variantRows = await this.db
      .select()
      .from(wordVariants)
      .where(and(eq(wordVariants.wordId, id), isNull(wordVariants.deletedAt)));

    return {
      ...toWord(wordRow),
      verifier:
        joined.verifierUsername != null && joined.verifierRole != null
          ? { username: joined.verifierUsername, role: joined.verifierRole }
          : null,
      creator:
        joined.creatorUsername != null && joined.creatorRole != null
          ? { username: joined.creatorUsername, role: joined.creatorRole }
          : null,
      meanings: meaningRows.map((m) => ({
        id: m.id,
        wordId: m.wordId,
        wordClass: m.wordClassId
          ? (() => {
              const wc = wcById.get(m.wordClassId)!;
              return {
                id: wc.id,
                code: wc.code,
                name: wc.name,
                alias: wc.alias,
                description: wc.description,
                parentId: wc.parentId,
              };
            })()
          : null,
        // 04: provenance - null = makna mandiri/sudah di-override
        inheritedFromMeaningId: m.inheritedFromMeaningId,
        definition: m.definition,
        isHaveDefinition: m.isHaveDefinition,
        isHaveTranslation: m.isHaveTranslation,
        orderIndex: m.orderIndex,
        notes: m.notes,
        translations: translationRows
          .filter((t) => t.meaningId === m.id)
          .map((t) => ({
            languageId: t.languageId,
            translationText: t.translationText,
            translationType: t.translationType,
          })),
        examples: exampleRows
          .filter((e) => e.meaningId === m.id)
          .map((e) => {
            const exampleAudios = audioRows
              .filter((a) => a.exampleId === e.id)
              .map((a) => ({
                id: a.id,
                url: a.url,
                dialectId: a.dialectId,
                speakerName: a.speakerName,
                durationMs: a.durationMs,
                isPrimary: a.isPrimary,
                mimeType: a.mimeType,
                ...(includeAll
                  ? {
                      status: a.status as ChildStatus,
                      isVerified: a.isVerified,
                      isCorrected: a.isCorrected,
                    }
                  : {}),
              }));
            // Primary dulu, lalu terbaru (createdAt desc via ULID id)
            exampleAudios.sort((x, y) => {
              if (x.isPrimary !== y.isPrimary) return x.isPrimary ? -1 : 1;
              return y.id.localeCompare(x.id);
            });
            return {
              id: e.id,
              sourceLanguageId: e.sourceLanguageId,
              sourceSentence: e.sourceSentence,
              targetLanguageId: e.targetLanguageId,
              targetSentence: e.targetSentence,
              sourceType: e.sourceType,
              audios: exampleAudios,
              ...(includeAll
                ? {
                    status: e.status as ChildStatus,
                    isVerified: e.isVerified,
                    isCorrected: e.isCorrected,
                  }
                : {}),
            };
          }),
      })),
      categories: categoryRows,
      pronunciations: pronRows.map((p) => ({
        id: p.id,
        notation: p.notation,
        value: p.value,
        dialectId: p.dialectId,
        ...(includeAll
          ? { status: p.status as ChildStatus, isVerified: p.isVerified, isCorrected: p.isCorrected }
          : {}),
      })),
      images: imageRows.map((i) => ({
        id: i.id,
        url: i.url,
        // Untuk round-trip PUT edit: provider_file_id WAJIB dikirim ulang
        // di images[] (full-replace) - tanpa ini gambar terhapus senyap
        providerFileId: i.providerFileId,
        sha: i.sha ?? null,
        altText: i.altText,
        isPrimary: i.isPrimary,
        ...(includeAll
          ? { status: i.status as ChildStatus, isVerified: i.isVerified, isCorrected: i.isCorrected }
          : {}),
      })),
      audios: (() => {
        const wordLevel = audioRows
          .filter((a) => a.exampleId == null)
          .map((a) => ({
            id: a.id,
            url: a.url,
            dialectId: a.dialectId,
            speakerName: a.speakerName,
            durationMs: a.durationMs,
            isPrimary: a.isPrimary,
            mimeType: a.mimeType,
            ...(includeAll
              ? {
                  status: a.status as ChildStatus,
                  isVerified: a.isVerified,
                  isCorrected: a.isCorrected,
                }
              : {}),
          }));
        wordLevel.sort((x, y) => {
          if (x.isPrimary !== y.isPrimary) return x.isPrimary ? -1 : 1;
          return y.id.localeCompare(x.id);
        });
        return wordLevel;
      })(),
      relatedWords: relatedRows,
      appearsIn: appearsRows,
      variants: variantRows.map((v) => ({
        id: v.id,
        form: v.form,
        variantType: v.variantType,
        affixType: v.affixType,
        affixValue: v.affixValue,
        dialectId: v.dialectId,
        notes: v.notes,
      })),
    };
  }

  // 28-api-word-of-the-day.md: deterministik per tanggal WIB.
  // SQLite tidak punya md5() — SHA-256 di app (Web Crypto, Workers-safe).
  async findWordOfDayId(date: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: words.id })
      .from(words)
      .where(and(eq(words.status, 'published'), eq(words.isVerified, true), isNull(words.deletedAt)));
    if (rows.length === 0) return null;

    const encoder = new TextEncoder();
    async function sha256Hex(input: string): Promise<string> {
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    let bestId = rows[0].id;
    let bestHash = await sha256Hex(`${bestId}:${date}`);
    for (let i = 1; i < rows.length; i++) {
      const id = rows[i].id;
      const h = await sha256Hex(`${id}:${date}`);
      if (h < bestHash) {
        bestHash = h;
        bestId = id;
      }
    }
    return bestId;
  }

  // Cursor-based (Section 13): cursor = ULID id item terakhir, id DESC,
  // fetch limit+1 untuk has_more - tanpa OFFSET, tanpa COUNT(*).
  // Dua arah: 'lemma' (Sambas→Indonesia, default) atau 'translation'
  // (Indonesia→Sambas: cari meaning_translations.translation_text,
  // hasil = kata Sambas-nya + teks terjemahan yang cocok)
  async search(params: SearchParams): Promise<CursorPage<WordSummary>> {
    if (params.searchIn === 'translation') {
      return this.searchByTranslation(params);
    }

    const where = and(
      isNull(words.deletedAt),
      // Publik: published only. Admin: published? true|false|all (omit)
      params.published === true
        ? eq(words.status, 'published')
        : params.published === false
          ? ne(words.status, 'published')
          : undefined,
      // 11-api-variasi-penulisan.md: q cocok lemma ATAU bentuk variasi
      // (mis. cari "ketex" menemukan entri "ketek"). EXISTS - bukan JOIN -
      // supaya hasil tetap satu baris per kata (cursor words.id aman).
      params.q
        ? or(
            ilikeCompat(words.lemma, `%${escapeLike(params.q.trim())}%`),
            sql`EXISTS (SELECT 1 FROM ${wordVariants} v WHERE v.word_id = ${words.id} AND v.deleted_at IS NULL AND lower(v.form) LIKE ${`%${escapeLike(params.q.trim()).toLowerCase()}%`})`,
          )
        : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.isVerified === undefined ? undefined : eq(words.isVerified, params.isVerified),
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        isVerified: words.isVerified,
        status: words.status,
      })
      .from(words)
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .orderBy(desc(words.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page: WordSummary[] = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      isVerified: r.isVerified,
      status: r.status as WordStatus,
      sense: null,
    }));

    // 11: isi matched_variant HANYA untuk item yang match lewat variasi
    // (bukan lemma) - satu query tambahan untuk ≤ limit baris, bukan N+1.
    if (params.q && page.length > 0) {
      const pattern = `%${escapeLike(params.q.trim())}%`;
      const qLower = params.q.trim().toLowerCase();
      const variantRows = await this.db
        .select({ wordId: wordVariants.wordId, form: wordVariants.form })
        .from(wordVariants)
        .where(
          and(
            inArray(
              wordVariants.wordId,
              page.map((p) => p.id),
            ),
            isNull(wordVariants.deletedAt),
            ilikeCompat(wordVariants.form, pattern),
          ),
        );
      const variantByWord = new Map<string, string>();
      for (const v of variantRows) {
        if (!variantByWord.has(v.wordId)) variantByWord.set(v.wordId, v.form);
      }
      for (const p of page) {
        // match lemma (penentu JS setara ilike untuk alfabet Latin) → tanpa
        // matched_variant (kontrak: field hanya saat cocok via variasi)
        if (p.lemma.toLowerCase().includes(qLower)) continue;
        const matched = variantByWord.get(p.id);
        if (matched) p.matchedVariant = matched;
      }
    }

    await this.attachListGlosses(page);

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  // 18-api-list-words.md - browsing A-Z: keyset (lower(lemma) COLLATE "C", id).
  // Bukan ORDER BY lemma mentah: collation DB (staging sering "C") membuat
  // "Zebra" < "apam" (ASCII kapital sebelum huruf kecil) → list tampak acak.
  // Index words_lemma_az_idx menopang ekspresi yang sama.
  async listAtoZ(params: ListAtoZParams): Promise<CursorPage<WordSummary>> {
    const lemmaAz = sql`lower(${words.lemma})`;
    const where = and(
      isNull(words.deletedAt),
      // Endpoint publik - selalu published (bukan opsional seperti search())
      eq(words.status, 'published'),
      params.q ? ilikeCompat(words.lemma, `%${escapeLike(params.q.trim())}%`) : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.cursor
        ? sql`(${lemmaAz}, ${words.id}) > (lower(${params.cursor.lemma}), ${params.cursor.id})`
        : undefined,
    );

    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        isVerified: words.isVerified,
        status: words.status,
      })
      .from(words)
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .orderBy(lemmaAz, asc(words.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page: WordSummary[] = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      isVerified: r.isVerified,
      status: r.status as WordStatus,
      sense: null,
    }));

    await this.attachListGlosses(page);

    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasMore && last ? encodeListCursor({ lemma: last.lemma, id: last.id }) : null,
      hasMore,
    };
  }

  /**
   * Gloss daftar A-Z / search: `[n] makan,[v] santap`.
   * Semua makna published × terjemahan valid, urut orderIndex makna lalu id terjemahan.
   * Batch (bukan N+1) — pola sama attachSenses feed.
   */
  private async attachListGlosses(page: WordSummary[]): Promise<void> {
    if (page.length === 0) return;

    const meaningRows = await this.db
      .select({
        id: meanings.id,
        wordId: meanings.wordId,
        wordClassId: meanings.wordClassId,
      })
      .from(meanings)
      .where(
        and(
          inArray(
            meanings.wordId,
            page.map((p) => p.id),
          ),
          isNull(meanings.deletedAt),
          eq(meanings.status, 'published'),
        ),
      )
      .orderBy(asc(meanings.orderIndex), asc(meanings.id));

    if (meaningRows.length === 0) return;

    // wordClassId nullable - inArray tidak menerima elemen nullable (pola
    // sama seperti findDetailById di atas)
    const classIds = [
      ...new Set(meaningRows.map((m) => m.wordClassId).filter((x): x is string => !!x)),
    ];
    const classRows = await this.db
      .select({ id: wordClasses.id, code: wordClasses.code })
      .from(wordClasses)
      .where(inArray(wordClasses.id, classIds));
    const codeByClassId = new Map(classRows.map((c) => [c.id, c.code]));

    const meaningIds = meaningRows.map((m) => m.id);
    const translationRows = await this.db
      .select({
        meaningId: meaningTranslations.meaningId,
        translationText: meaningTranslations.translationText,
      })
      .from(meaningTranslations)
      .where(
        and(
          inArray(meaningTranslations.meaningId, meaningIds),
          isNull(meaningTranslations.deletedAt),
          ne(meaningTranslations.translationText, '-'),
        ),
      )
      .orderBy(asc(meaningTranslations.id));

    const textsByMeaning = new Map<string, string[]>();
    for (const row of translationRows) {
      const text = row.translationText.trim();
      if (!text) continue;
      const list = textsByMeaning.get(row.meaningId);
      if (list) list.push(text);
      else textsByMeaning.set(row.meaningId, [text]);
    }

    const meaningsByWord = new Map<string, typeof meaningRows>();
    for (const row of meaningRows) {
      const list = meaningsByWord.get(row.wordId);
      if (list) list.push(row);
      else meaningsByWord.set(row.wordId, [row]);
    }

    for (const item of page) {
      const wordMeanings = meaningsByWord.get(item.id);
      if (!wordMeanings) continue;
      const parts: string[] = [];
      for (const meaning of wordMeanings) {
        if (!meaning.wordClassId) continue;
        const code = codeByClassId.get(meaning.wordClassId)?.trim();
        if (!code) continue;
        const texts = textsByMeaning.get(meaning.id);
        if (!texts) continue;
        for (const text of texts) {
          parts.push(`[${code}] ${text}`);
        }
      }
      item.sense = parts.length > 0 ? parts.join(',') : null;
    }
  }

  // Feed beranda: published, keyset (COALESCE(verified_at, created_at), id) DESC.
  // verified_at = waktu persetujuan; kata yang langsung tayang mengisi field
  // yang sama. Null → created_at supaya baris lama tetap muncul.
  async listLatest(params: ListLatestParams): Promise<CursorPage<LatestWordSummary>> {
    const approvedAtExpr = sql`COALESCE(${words.verifiedAt}, ${words.createdAt})`;
    const cursorEpoch = params.cursor
      ? Math.floor(params.cursor.approvedAt.getTime() / 1000)
      : undefined;

    const where = and(
      isNull(words.deletedAt),
      eq(words.status, 'published'),
      params.cursor
        ? sql`(${approvedAtExpr}, ${words.id}) < (${cursorEpoch}, ${params.cursor.id})`
        : undefined,
    );

    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        isVerified: words.isVerified,
        status: words.status,
        verifiedAt: words.verifiedAt,
        createdAt: words.createdAt,
      })
      .from(words)
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .orderBy(desc(approvedAtExpr), desc(words.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page: LatestWordSummary[] = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      isVerified: r.isVerified,
      status: r.status as WordStatus,
      approvedAt: r.verifiedAt ?? r.createdAt,
      sense: null,
    }));

    await this.attachSenses(page);

    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasMore && last ? encodeLatestCursor({ approvedAt: last.approvedAt, id: last.id }) : null,
      hasMore,
    };
  }

  /** Satu batch makna + terjemahan untuk halaman feed. Bukan N+1. */
  private async attachSenses(page: LatestWordSummary[]): Promise<void> {
    if (page.length === 0) return;

    const meaningRows = await this.db
      .select({
        id: meanings.id,
        wordId: meanings.wordId,
        definition: meanings.definition,
        isHaveDefinition: meanings.isHaveDefinition,
      })
      .from(meanings)
      .where(
        and(
          inArray(
            meanings.wordId,
            page.map((p) => p.id),
          ),
          isNull(meanings.deletedAt),
          eq(meanings.status, 'published'),
        ),
      )
      .orderBy(asc(meanings.orderIndex), asc(meanings.id));

    const firstByWord = new Map<string, (typeof meaningRows)[number]>();
    for (const row of meaningRows) {
      if (!firstByWord.has(row.wordId)) firstByWord.set(row.wordId, row);
    }

    const needTranslation: string[] = [];
    const meaningIdByWord = new Map<string, string>();
    for (const item of page) {
      const meaning = firstByWord.get(item.id);
      if (!meaning) continue;
      const definition = meaning.definition.trim();
      if (meaning.isHaveDefinition && definition.length > 0 && definition !== '-') {
        item.sense = definition;
        continue;
      }
      needTranslation.push(meaning.id);
      meaningIdByWord.set(item.id, meaning.id);
    }

    if (needTranslation.length === 0) return;

    const translationRows = await this.db
      .select({
        meaningId: meaningTranslations.meaningId,
        translationText: meaningTranslations.translationText,
      })
      .from(meaningTranslations)
      .where(
        and(
          inArray(meaningTranslations.meaningId, needTranslation),
          isNull(meaningTranslations.deletedAt),
          ne(meaningTranslations.translationText, '-'),
        ),
      )
      .orderBy(asc(meaningTranslations.id));

    const textByMeaning = new Map<string, string>();
    for (const row of translationRows) {
      const text = row.translationText.trim();
      if (!text || textByMeaning.has(row.meaningId)) continue;
      textByMeaning.set(row.meaningId, text);
    }

    for (const item of page) {
      if (item.sense) continue;
      const meaningId = meaningIdByWord.get(item.id);
      if (!meaningId) continue;
      item.sense = textByMeaning.get(meaningId) ?? null;
    }
  }

  private async searchByTranslation(params: SearchParams): Promise<CursorPage<WordSummary>> {
    const where = and(
      isNull(words.deletedAt),
      params.published === true
        ? eq(words.status, 'published')
        : params.published === false
          ? ne(words.status, 'published')
          : undefined,
      isNull(meanings.deletedAt),
      // 17: makna kontribusi pending tidak boleh bocor ke pencarian;
      // sentinel "-" (placeholder tanpa definisi) juga bukan hasil yang
      // bermakna untuk pencarian terjemahan.
      eq(meanings.status, 'published'),
      ne(meaningTranslations.translationText, '-'),
      isNull(meaningTranslations.deletedAt),
      params.q
        ? ilikeCompat(meaningTranslations.translationText, `%${escapeLike(params.q.trim())}%`)
        : undefined,
      params.translationLanguageId
        ? eq(meaningTranslations.languageId, params.translationLanguageId)
        : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.isVerified === undefined ? undefined : eq(words.isVerified, params.isVerified),
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    // Satu kata bisa punya banyak makna yang cocok — GROUP BY words.id
    // + min(translation_text) (setara DISTINCT ON + ORDER BY translation ASC).
    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        isVerified: words.isVerified,
        status: words.status,
        matchedTranslation: sql<string>`min(${meaningTranslations.translationText})`,
      })
      .from(words)
      .innerJoin(meanings, eq(meanings.wordId, words.id))
      .innerJoin(meaningTranslations, eq(meaningTranslations.meaningId, meanings.id))
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .groupBy(
        words.id,
        words.lemma,
        words.languageId,
        languages.code,
        words.wordType,
        words.isVerified,
        words.status,
      )
      .orderBy(desc(words.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page: WordSummary[] = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      isVerified: r.isVerified,
      status: r.status as WordStatus,
      matchedTranslation: r.matchedTranslation,
      sense: null,
    }));

    await this.attachListGlosses(page);

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async findMissingReferences(refs: ReferenceCheck): Promise<MissingReferences> {
    const languageExists = await this.exists(languages, refs.languageId);
    const dialectExists = refs.dialectId ? await this.exists(dialects, refs.dialectId) : true;

    const uniqueIds = (ids: string[]) => [...new Set(ids)];
    const inline = refs.inline;

    // Gabungan id induk + kata inline - SATU query per tabel (04: validasi
    // referensi bersama lalu error dipetakan ke field path yang benar)
    const allWordClassIds = uniqueIds([...refs.wordClassIds, ...inline.wordClassIds]);
    const allLanguageIds = uniqueIds([...refs.languageIds, ...inline.languageIds]);
    const allCategoryIds = uniqueIds([...refs.categoryIds, ...inline.categoryIds]);
    const allVariantDialectIds = uniqueIds([...refs.variantDialectIds, ...inline.variantDialectIds]);

    // Entri terkait (Form A) harus ada DAN belum soft-deleted
    const relatedIds = uniqueIds(refs.relatedWordIds);
    let missingRelated: string[] = [];
    if (relatedIds.length > 0) {
      const rows = await this.db
        .select({ id: words.id })
        .from(words)
        .where(and(inArray(words.id, relatedIds), isNull(words.deletedAt)));
      const found = new Set(rows.map((r) => r.id));
      missingRelated = relatedIds.filter((id) => !found.has(id));
    }

    // Dialek yang dipakai variants (kata induk; dialect utama dicek di atas)
    let missingDialects: string[] = [];
    let missingInlineDialects: string[] = [];
    if (allVariantDialectIds.length > 0) {
      const rows = await this.db
        .select({ id: dialects.id })
        .from(dialects)
        .where(inArray(dialects.id, allVariantDialectIds));
      const found = new Set(rows.map((r) => r.id));
      missingDialects = uniqueIds(refs.variantDialectIds).filter((id) => !found.has(id));
      missingInlineDialects = uniqueIds(inline.variantDialectIds).filter((id) => !found.has(id));
    }

    // Filter soft-deleted (Section 7: semua tabel wajib soft delete)
    const wcRows = await this.db
      .select({ id: wordClasses.id })
      .from(wordClasses)
      .where(and(inArray(wordClasses.id, allWordClassIds), isNull(wordClasses.deletedAt)));
    const catRows = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, allCategoryIds), isNull(categories.deletedAt)));
    const langRows = await this.db
      .select({ id: languages.id })
      .from(languages)
      .where(inArray(languages.id, allLanguageIds));
    const wcFound = new Set(wcRows.map((r) => r.id));
    const catFound = new Set(catRows.map((r) => r.id));
    const langFound = new Set(langRows.map((r) => r.id));

    return {
      languageId: !languageExists,
      dialectId: !dialectExists,
      languages: uniqueIds(refs.languageIds).filter((id) => !langFound.has(id)),
      wordClasses: uniqueIds(refs.wordClassIds).filter((id) => !wcFound.has(id)),
      categories: uniqueIds(refs.categoryIds).filter((id) => !catFound.has(id)),
      words: missingRelated,
      dialects: missingDialects,
      inlineWordClasses: uniqueIds(inline.wordClassIds).filter((id) => !wcFound.has(id)),
      inlineLanguages: uniqueIds(inline.languageIds).filter((id) => !langFound.has(id)),
      inlineCategories: uniqueIds(inline.categoryIds).filter((id) => !catFound.has(id)),
      inlineDialects: missingInlineDialects,
    };
  }

  async setVerified(
    id: string,
    data: { isVerified: boolean; verifiedBy: string; verifiedAt: Date },
  ): Promise<boolean> {
    // Hanya baris yang nilainya masih beda. Panggilan kedua (sudah sama)
    // mengembalikan false supaya use case bisa 409 tanpa menimpa verified_by.
    const updated = await this.db
      .update(words)
      .set({ isVerified: data.isVerified, verifiedBy: data.verifiedBy, verifiedAt: data.verifiedAt })
      .where(and(eq(words.id, id), isNull(words.deletedAt), ne(words.isVerified, data.isVerified)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  async setPublished(
    id: string,
    data: { published: boolean; actorId: string },
  ): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(words)
      .set(
        data.published
          ? {
              status: 'published',
              isVerified: true,
              verifiedBy: data.actorId,
              verifiedAt: now,
              updatedBy: data.actorId,
              updatedAt: now,
            }
          : {
              status: 'draft',
              isVerified: false,
              verifiedBy: null,
              verifiedAt: null,
              updatedBy: data.actorId,
              updatedAt: now,
            },
      )
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  async publishOrMergeMeanings(
    id: string,
    actorId: string,
  ): Promise<{ wordId: string; mergedIntoWordId: string | null } | null> {
    return this.db.transaction((tx) => publishOrMergeMeaningsInTx(tx, id, actorId));
  }

  async findMeaningById(meaningId: string): Promise<{ id: string; wordId: string } | null> {
    const [row] = await this.db
      .select({ id: meanings.id, wordId: meanings.wordId })
      .from(meanings)
      .where(and(eq(meanings.id, meaningId), isNull(meanings.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async addPronunciation(
    wordId: string,
    data: {
      dialectId?: string | null;
      notation: string;
      value: string;
      audioUrl?: string | null;
      speakerName?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<PronunciationMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(pronunciations)
          .values({
            wordId,
            dialectId: data.dialectId ?? null,
            notation: data.notation,
            value: data.value,
            audioUrl: data.audioUrl ?? null,
            speakerName: data.speakerName ?? null,
            notes: data.notes ?? null,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'pronunciation',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status, data.isVerified),
        });
        return toPronunciation(row);
      });
    } catch (err) {
      mapMediaViolation(err, 'value');
      throw err;
    }
  }

  async addWordImage(
    wordId: string,
    data: {
      url: string;
      providerFileId: string;
      provider: string;
      sha?: string | null;
      altText?: string | null;
      isPrimary: boolean;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordImageMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(wordImages)
          .values({
            wordId,
            provider: data.provider,
            providerFileId: data.providerFileId,
            sha: data.sha ?? null,
            url: data.url,
            altText: data.altText ?? null,
            isPrimary: data.isPrimary,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word_image',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status, data.isVerified),
        });
        return toWordImage(row);
      });
    } catch (err) {
      mapMediaViolation(err, 'provider_file_id');
      throw err;
    }
  }

  async addWordAudio(
    wordId: string,
    data: {
      exampleId?: string | null;
      dialectId?: string | null;
      provider: string;
      providerFileId: string;
      sha: string | null;
      url: string;
      mimeType: string;
      fileSize: number;
      durationMs?: number | null;
      speakerName?: string | null;
      isPrimary: boolean;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordAudioMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(wordAudios)
          .values({
            wordId,
            exampleId: data.exampleId ?? null,
            dialectId: data.dialectId ?? null,
            provider: data.provider,
            providerFileId: data.providerFileId,
            sha: data.sha,
            url: data.url,
            mimeType: data.mimeType,
            fileSize: data.fileSize,
            durationMs: data.durationMs ?? null,
            speakerName: data.speakerName ?? null,
            isPrimary: data.isPrimary,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word_audio',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status, data.isVerified),
        });
        return toWordAudio(row);
      });
    } catch (err) {
      mapMediaViolation(err, 'provider_file_id');
      throw err;
    }
  }

  async softDeleteWordAudio(wordId: string, audioId: string): Promise<WordAudioMedia | null> {
    const [existing] = await this.db
      .select()
      .from(wordAudios)
      .where(
        and(
          eq(wordAudios.id, audioId),
          eq(wordAudios.wordId, wordId),
          isNull(wordAudios.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) return null;

    const [row] = await this.db
      .update(wordAudios)
      .set({ deletedAt: new Date() })
      .where(eq(wordAudios.id, audioId))
      .returning();
    return row ? toWordAudio(row) : null;
  }

  async countWordAudios(wordId: string, exampleId?: string | null): Promise<number> {
    const exampleFilter =
      exampleId == null || exampleId === undefined
        ? isNull(wordAudios.exampleId)
        : eq(wordAudios.exampleId, exampleId);
    const rows = await this.db
      .select({ id: wordAudios.id })
      .from(wordAudios)
      .where(and(eq(wordAudios.wordId, wordId), isNull(wordAudios.deletedAt), exampleFilter));
    return rows.length;
  }

  async findExampleWithWord(
    exampleId: string,
  ): Promise<{ id: string; meaningId: string; wordId: string } | null> {
    const [row] = await this.db
      .select({
        id: examples.id,
        meaningId: examples.meaningId,
        wordId: meanings.wordId,
      })
      .from(examples)
      .innerJoin(meanings, eq(meanings.id, examples.meaningId))
      .where(and(eq(examples.id, exampleId), isNull(examples.deletedAt), isNull(meanings.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findDialectCode(dialectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: dialects.code })
      .from(dialects)
      .where(and(eq(dialects.id, dialectId), isNull(dialects.deletedAt)))
      .limit(1);
    return row?.code ?? null;
  }

  async addExample(
    meaningId: string,
    data: {
      sourceLanguageId: string;
      sourceSentence: string;
      targetLanguageId?: string | null;
      targetSentence?: string | null;
      sourceType?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<ExampleMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(examples)
          .values({
            meaningId,
            sourceLanguageId: data.sourceLanguageId,
            sourceSentence: data.sourceSentence,
            targetLanguageId: data.targetLanguageId ?? null,
            targetSentence: data.targetSentence ?? null,
            sourceType: data.sourceType ?? null,
            notes: data.notes ?? null,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'example',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status, data.isVerified),
        });
        return toExample(row);
      });
    } catch (err) {
      mapMediaViolation(err, '');
      throw err;
    }
  }

  async addMeaning(
    wordId: string,
    data: {
      wordClassId?: string | null;
      definition: string;
      translations: { languageId: string; translationText: string; translationType: string }[];
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<MeaningMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        // Urut setelah makna terakhir - kontribusi definisi tidak menimpa
        // urutan makna yang sudah ada.
        const [last] = await tx
          .select({ maxOrder: sql<number>`coalesce(max(${meanings.orderIndex}), 0)`.mapWith(Number) })
          .from(meanings)
          .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)));

        const [row] = await tx
          .insert(meanings)
          .values({
            wordId,
            wordClassId: data.wordClassId ?? null,
            definition: data.definition,
            isHaveDefinition: true,
            isHaveTranslation: data.translations.length > 0,
            orderIndex: (last?.maxOrder ?? 0) + 1,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();

        if (data.translations.length > 0) {
          await tx.insert(meaningTranslations).values(
            data.translations.map((t) => ({
              meaningId: row.id,
              languageId: t.languageId,
              translationText: t.translationText,
              translationType: t.translationType,
              createdBy: actorId,
            })),
          );
        }

        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'meaning',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status, data.isVerified),
        });

        return {
          id: row.id,
          wordId: row.wordId,
          wordClassId: row.wordClassId,
          definition: row.definition,
          orderIndex: row.orderIndex,
          status: row.status as ChildStatus,
          isVerified: row.isVerified,
          isCorrected: row.isCorrected,
        };
      });
    } catch (err) {
      mapMediaViolation(err, '');
      throw err;
    }
  }

  async addVariant(
    wordId: string,
    data: { form: string; variantType?: string; notes?: string | null },
    actorId: string,
  ): Promise<{ id: string; form: string; variantType: string }> {
    try {
      const [row] = await this.db
        .insert(wordVariants)
        .values({
          wordId,
          form: data.form.trim(),
          variantType: data.variantType ?? 'alternative',
          notes: data.notes ?? null,
          createdBy: actorId,
        })
        .returning();
      return { id: row.id, form: row.form, variantType: row.variantType };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'WORD_VARIANT_CONFLICT',
          'Variasi penulisan ini sudah ada pada kata tersebut',
        );
      }
      mapMediaViolation(err, 'form');
      throw err;
    }
  }

  async createSynonymWord(
    targetWordId: string,
    lemma: string,
    actorId: string,
    opts?: { searchMissId?: string | null },
  ): Promise<{ id: string; lemma: string }> {
    const detail = await this.findDetailById(targetWordId, { includeAllStatuses: true });
    if (!detail || detail.status !== 'published') {
      throw new ValidationError([
        { field: 'word_id', message: 'Kata target harus published dan masih ada' },
      ]);
    }
    if (detail.meanings.length === 0) {
      throw new ValidationError([
        { field: 'word_id', message: 'Kata target belum punya makna untuk diwariskan' },
      ]);
    }

    const trimmed = lemma.trim();
    if (await this.findDuplicate(detail.languageId, trimmed)) {
      throw new ConflictError(
        'WORD_LEMMA_CONFLICT',
        'Lemma ini sudah dipakai kata lain di bahasa yang sama',
      );
    }

    try {
      return await this.db.transaction(async (tx) => {
        const [wordRow] = await tx
          .insert(words)
          .values({
            languageId: detail.languageId,
            lemma: trimmed,
            notes: `Sinonim dari ${detail.lemma}`,
            wordType: detail.wordType,
            status: 'published',
            isVerified: true,
            verifiedBy: actorId,
            verifiedAt: new Date(),
            createdBy: actorId,
          })
          .returning();
        const newId = wordRow.id;

        for (const [idx, m] of detail.meanings.entries()) {
          const [meaningRow] = await tx
            .insert(meanings)
            .values({
              wordId: newId,
              wordClassId: m.wordClass?.id ?? null,
              inheritedFromMeaningId: m.id,
              definition: m.definition,
              isHaveDefinition: m.isHaveDefinition,
              isHaveTranslation: m.isHaveTranslation,
              orderIndex: idx,
              notes: m.notes,
              createdBy: actorId,
            })
            .returning();
          if (m.translations.length > 0) {
            await tx.insert(meaningTranslations).values(
              m.translations.map((t) => ({
                meaningId: meaningRow.id,
                languageId: t.languageId,
                translationText: t.translationText,
                translationType: t.translationType,
              })),
            );
          }
        }

        // sinonim dua arah supaya detail kedua kata saling menampilkan
        await tx.insert(lexicalRelations).values([
          {
            sourceWordId: newId,
            targetWordId: targetWordId,
            relationType: 'synonym',
            createdBy: actorId,
          },
          {
            sourceWordId: targetWordId,
            targetWordId: newId,
            relationType: 'synonym',
            createdBy: actorId,
          },
        ]);

        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: newId,
          action: 'create',
          status: 'approved',
          ...(opts?.searchMissId ? { searchMissId: opts.searchMissId } : {}),
        });

        return { id: newId, lemma: wordRow.lemma };
      });
    } catch (err) {
      if (err instanceof ConflictError || err instanceof ValidationError) throw err;
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'WORD_LEMMA_CONFLICT',
          'Lemma ini sudah dipakai kata lain di bahasa yang sama',
        );
      }
      mapMediaViolation(err, 'lemma');
      throw err;
    }
  }

  async addTranslation(
    wordId: string,
    data: { languageId: string; translationText: string; meaningId?: string },
    actorId: string,
  ): Promise<{ meaningId: string; languageId: string; translationText: string }> {
    let meaningId = data.meaningId;
    if (!meaningId) {
      const [first] = await this.db
        .select({ id: meanings.id })
        .from(meanings)
        .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)))
        .orderBy(asc(meanings.orderIndex))
        .limit(1);
      if (!first) {
        throw new ValidationError([
          { field: 'word_id', message: 'Kata belum punya makna untuk menampung terjemahan' },
        ]);
      }
      meaningId = first.id;
    } else {
      const m = await this.findMeaningById(meaningId);
      if (!m || m.wordId !== wordId) {
        throw new ValidationError([
          { field: 'meaning_id', message: 'Makna tidak ditemukan pada kata tersebut' },
        ]);
      }
    }

    try {
      await this.db.insert(meaningTranslations).values({
        meaningId,
        languageId: data.languageId,
        translationText: data.translationText.trim(),
        translationType: 'direct',
        createdBy: actorId,
      });
      return {
        meaningId,
        languageId: data.languageId,
        translationText: data.translationText.trim(),
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'TRANSLATION_CONFLICT',
          'Terjemahan ini sudah ada pada makna tersebut',
        );
      }
      mapMediaViolation(err, 'translation_text');
      throw err;
    }
  }

  async findById(id: string): Promise<Word | null> {
    const [row] = await this.db
      .select()
      .from(words)
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .limit(1);
    return row ? toWord(row) : null;
  }

  async updateWithRelations(id: string, word: WordToSave, actorId: string, tx?: unknown): Promise<Word | null> {
    const run = async (tx: Tx): Promise<Word | null> => {
        // Update baris words
        const now = new Date();
        const [wordRow] = await tx
          .update(words)
          .set({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            updatedBy: actorId,
            updatedAt: now,
            verifiedBy: word.isVerified ? sql`COALESCE(${words.verifiedBy}, ${actorId})` : null,
            verifiedAt: word.isVerified ? sql`COALESCE(${words.verifiedAt}, ${now})` : null,
          })
          .where(and(eq(words.id, id), isNull(words.deletedAt)))
          .returning();
        if (!wordRow) return null;

        // Audio multi-take tidak ikut body PUT. Snapshot dulu, hapus SEBELUM
        // examples (FK example_id → examples, ON DELETE no action), lalu
        // sisipkan ulang dengan id yang sama setelah contoh baru ada.
        const audioSnapshots = await tx
          .select({
            id: wordAudios.id,
            wordId: wordAudios.wordId,
            exampleId: wordAudios.exampleId,
            dialectId: wordAudios.dialectId,
            provider: wordAudios.provider,
            providerFileId: wordAudios.providerFileId,
            sha: wordAudios.sha,
            url: wordAudios.url,
            mimeType: wordAudios.mimeType,
            fileSize: wordAudios.fileSize,
            durationMs: wordAudios.durationMs,
            speakerName: wordAudios.speakerName,
            isPrimary: wordAudios.isPrimary,
            status: wordAudios.status,
            isVerified: wordAudios.isVerified,
            isCorrected: wordAudios.isCorrected,
            createdBy: wordAudios.createdBy,
            createdAt: wordAudios.createdAt,
            sourceSentence: examples.sourceSentence,
          })
          .from(wordAudios)
          .leftJoin(examples, eq(wordAudios.exampleId, examples.id))
          .where(and(eq(wordAudios.wordId, id), isNull(wordAudios.deletedAt)));

        // Termasuk baris soft-delete: mereka tetap memegang FK ke examples.
        await tx.delete(wordAudios).where(eq(wordAudios.wordId, id));

        // Replace children: hapus lama (urutan FK-safe) lalu insert baru
        await tx.delete(examples).where(
          inArray(examples.meaningId, tx.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, id)),
        ));
        await tx.delete(meaningTranslations).where(
          inArray(meaningTranslations.meaningId, tx.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, id)),
        ));
        await tx.delete(meanings).where(eq(meanings.wordId, id));
        await tx.delete(wordCategories).where(eq(wordCategories.wordId, id));
        await tx.delete(lexicalRelations).where(eq(lexicalRelations.sourceWordId, id));
        await tx.delete(wordVariants).where(eq(wordVariants.wordId, id));
        await tx.delete(wordImages).where(eq(wordImages.wordId, id));
        await tx.delete(pronunciations).where(eq(pronunciations.wordId, id));

        // Insert children baru (pola sama dengan saveWithRelations)
        await this.insertChildren(tx, id, word, actorId);
        await this.restoreWordAudios(tx, id, audioSnapshots);

        // Catat kontribusi update - status antrean turunan dari status entity
        // (correct oleh verifikator → published → 'approved', tidak mengotori antrean)
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: id,
          action: 'update',
          status: contributionStatusOf(word.status, word.isVerified),
        });

        return toWord(wordRow);
    };

    try {
      if (tx) return await run(tx as Tx);
      return await this.db.transaction(run);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      if (isUniqueViolation(err)) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(words)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  async takedown(
    id: string,
    data: { actorId: string; reasonCode: string; note: string | null },
  ): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(words)
      .set({
        status: 'taken_down',
        takedownReasonCode: data.reasonCode,
        takedownNote: data.note,
        takenDownBy: data.actorId,
        takenDownAt: now,
        updatedBy: data.actorId,
        updatedAt: now,
      })
      .where(and(eq(words.id, id), eq(words.status, 'published'), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  async restore(id: string, actorId: string): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(words)
      .set({
        status: 'published',
        takedownReasonCode: null,
        takedownNote: null,
        takenDownBy: null,
        takenDownAt: null,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(and(eq(words.id, id), eq(words.status, 'taken_down'), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  /**
   * Tulis ulang audio yang di-snapshot sebelum replace anak.
   * Lemma (example_id null) tetap. Audio contoh hanya kembali jika kalimat
   * yang sama masih ada di contoh baru — id baris audio tidak berubah.
   */
  private async restoreWordAudios(
    tx: Tx,
    wordId: string,
    snapshots: {
      id: string;
      wordId: string;
      exampleId: string | null;
      dialectId: string | null;
      provider: string;
      providerFileId: string;
      sha: string | null;
      url: string;
      mimeType: string;
      fileSize: number;
      durationMs: number | null;
      speakerName: string | null;
      isPrimary: boolean;
      status: string;
      isVerified: boolean;
      isCorrected: boolean;
      createdBy: string | null;
      createdAt: Date;
      sourceSentence: string | null;
    }[],
  ): Promise<void> {
    if (snapshots.length === 0) return;

    const newExamples = await tx
      .select({ id: examples.id, sourceSentence: examples.sourceSentence })
      .from(examples)
      .innerJoin(meanings, eq(examples.meaningId, meanings.id))
      .where(eq(meanings.wordId, wordId));

    const exampleIdBySentence = new Map<string, string>();
    for (const ex of newExamples) {
      const key = ex.sourceSentence.trim();
      if (key && !exampleIdBySentence.has(key)) exampleIdBySentence.set(key, ex.id);
    }

    const rows = [];
    for (const snap of snapshots) {
      let exampleId: string | null = null;
      if (snap.exampleId) {
        const key = snap.sourceSentence?.trim() ?? '';
        const nextId = key ? exampleIdBySentence.get(key) : undefined;
        if (!nextId) continue;
        exampleId = nextId;
      }
      rows.push({
        id: snap.id,
        wordId: snap.wordId,
        exampleId,
        dialectId: snap.dialectId,
        provider: snap.provider,
        providerFileId: snap.providerFileId,
        sha: snap.sha,
        url: snap.url,
        mimeType: snap.mimeType,
        fileSize: snap.fileSize,
        durationMs: snap.durationMs,
        speakerName: snap.speakerName,
        isPrimary: snap.isPrimary,
        status: snap.status,
        isVerified: snap.isVerified,
        isCorrected: snap.isCorrected,
        createdBy: snap.createdBy,
        createdAt: snap.createdAt,
      });
    }
    if (rows.length > 0) await tx.insert(wordAudios).values(rows);
  }

  // Helper: insert children untuk save & update (dipakai bersama)
  // opts.inheritedFrom = index makna → id makna INDUK (kolom provenance,
  // 04 - sinonim inline); opts.meaningIdsOut = kumpulan id makna sesuai
  // urutan array (dipakai induk utk memetakan provenance).
  private async insertChildren(
    tx: Tx,
    wordId: string,
    word: WordToSave,
    actorId: string,
    opts?: { inheritedFrom?: Record<number, string>; meaningIdsOut?: string[] },
  ): Promise<void> {
    for (const [index, meaning] of word.meanings.entries()) {
      const [meaningRow] = await tx
        .insert(meanings)
        .values({
          wordId,
          wordClassId: meaning.wordClassId,
          inheritedFromMeaningId: opts?.inheritedFrom?.[index] ?? null,
          definition: meaning.definition,
          isHaveDefinition: meaning.isHaveDefinition ?? true,
          isHaveTranslation: meaning.isHaveTranslation ?? (meaning.translations.length > 0),
          orderIndex: meaning.orderIndex,
          // Gerbang anak (17): makna ikut status kata - contoh kalimat di
          // bawah memakai pola yang sama (childStatusOf + isVerified kata)
          status: childStatusOf(word.status),
          isVerified: word.isVerified,
          createdBy: actorId,
        })
        .returning();
      const meaningId = meaningRow.id;
      opts?.meaningIdsOut?.push(meaningId);

      if (meaning.translations.length > 0) {
        await tx.insert(meaningTranslations).values(
          meaning.translations.map((t) => ({
            meaningId,
            languageId: t.languageId,
            translationText: t.translationText,
            translationType: t.translationType,
            createdBy: actorId,
          })),
        );
      }
      if (meaning.examples && meaning.examples.length > 0) {
        await tx.insert(examples).values(
          meaning.examples.map((e) => ({
            meaningId,
            sourceLanguageId: e.sourceLanguageId,
            sourceSentence: e.sourceSentence,
            targetLanguageId: e.targetLanguageId ?? null,
            targetSentence: e.targetSentence ?? null,
            sourceType: e.sourceType ?? null,
            status: childStatusOf(word.status),
            isVerified: word.isVerified,
            createdBy: actorId,
          })),
        );
      }
    }

    if (word.categoryIds.length > 0) {
      await tx.insert(wordCategories).values(word.categoryIds.map((categoryId) => ({ wordId, categoryId })));
    }
    // Hanya link ke kata existing (Form A). Kata inline (Form B) relasinya
    // dibuat terpisah di saveWithInlineRelations (source=induk → target=inline).
    const linkRels = word.relatedWords.filter(
      (rel): rel is Extract<CreateWordRelatedDto, { wordId: string }> => 'wordId' in rel,
    );
    if (linkRels.length > 0) {
      await tx.insert(lexicalRelations).values(
        linkRels.map((rel) => ({
          sourceWordId: wordId,
          targetWordId: rel.wordId,
          relationType: rel.relationType,
          createdBy: actorId,
        })),
      );
    }
    if (word.variants && word.variants.length > 0) {
      await tx.insert(wordVariants).values(
        word.variants.map((v) => ({
          wordId,
          form: v.form,
          variantType: v.variantType,
          affixType: v.affixType ?? null,
          affixValue: v.affixValue ?? null,
          dialectId: v.dialectId ?? null,
          notes: v.notes ?? null,
          createdBy: actorId,
        })),
      );
    }
    if (word.pronunciation) {
      await tx.insert(pronunciations).values({
        wordId,
        dialectId: word.dialectId ?? null,
        notation: word.pronunciation.notation,
        value: word.pronunciation.value,
        status: childStatusOf(word.status),
        isVerified: word.isVerified,
        createdBy: actorId,
      });
    }
    if (word.images && word.images.length > 0) {
      await tx.insert(wordImages).values(
        word.images.map((img) => ({
          wordId,
          provider: img.provider,
          providerFileId: img.providerFileId,
          sha: img.sha ?? null,
          url: img.url,
          altText: img.altText ?? null,
          isPrimary: img.isPrimary ?? false,
          status: childStatusOf(word.status),
          isVerified: word.isVerified,
          createdBy: actorId,
        })),
      );
    }
  }

  async listWordClasses() {
    const rows = await this.db
      .select()
      .from(wordClasses)
      .where(isNull(wordClasses.deletedAt))
      .orderBy(wordClasses.code);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      alias: r.alias,
      description: r.description,
      parentId: r.parentId,
    }));
  }

  private async exists(table: typeof languages | typeof dialects, id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
    return !!row;
  }
}
