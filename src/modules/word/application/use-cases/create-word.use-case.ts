import { BadRequestError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { SearchMissRepository } from '@/modules/search-miss/domain/repositories/search-miss.repository';
import { normalizeSearchMissTerm } from '@/modules/search-miss/domain/normalize-term';
import type { Word } from '../../domain/entities/word.entity';
import type {
  MissingReferences,
  ResolvedInlineRelation,
  WordRepository,
} from '../../domain/repositories/word.repository';
import type {
  CreateWordDto,
  CreateWordMeaningDto,
  CreateWordRelatedDto,
  InlineWordDto,
  MeaningOverrideDto,
} from '../dto/create-word.dto';
import { resolvePublication } from '../utils/resolve-publication';
import { assertCanContribute } from '../utils/assert-can-contribute';
import {
  DUPLICATE_LEMMA_MERGED_NOW,
  DUPLICATE_LEMMA_PENDING_MERGE,
  DUPLICATE_LEMMA_USE_TAB,
} from '../utils/duplicate-lemma-warning';

export interface InlineCreatedResult {
  /** skema, urut sesuai request - diteruskan ke respons (04) */
  inlineCreatedWords: import('../../domain/repositories/word.repository').InlineCreatedWordSummary[];
  /** warnings per kata inline, urut sama → di-pasang controller per-item */
  inlineWarnings: { field: string; message: string }[][];
}

export interface CreateWordResult extends InlineCreatedResult {
  word: Word;
  warnings: { field: string; message: string }[];
  /** Provenance miss yang tersimpan (null kalau submit biasa) */
  searchMissId: string | null;
}

export interface Actor {
  userId: string;
  role: string;
  /** dari requestIdMiddleware - menyambung audit DB ↔ log aplikasi (Section 14 & 21) */
  requestId?: string | null;
}

export class CreateWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly searchMissRepo?: SearchMissRepository,
  ) {}

  async execute(dto: CreateWordDto, actor: Actor): Promise<CreateWordResult> {
    await assertCanContribute(actor.userId);
    // 0a. Provenance search-miss (12-api) - sebelum insert
    await this.assertSearchMissProvenance(dto);

    // 0b. Aturan silang: has_component hanya untuk entri frasa (idiom/peribahasa/ungkapan)
    if (
      dto.wordType === 'word' &&
      dto.relatedWords.some((r) => r.relationType === 'has_component')
    ) {
      throw new ValidationError([
        {
          field: 'related_words',
          message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan',
        },
      ]);
    }

    const linkRelations = dto.relatedWords.filter(isLinkRelation);
    const inlineRelations = dto.relatedWords.filter(isInlineRelation);

    // 1. Validasi referensi eksternal (id harus ada di DB) → SATU panggilan
    //    gabungan (induk + semua kata inline) → field path per-kata.
    const missing = await this.wordRepo.findMissingReferences({
      languageId: dto.languageId,
      dialectId: dto.dialectId,
      wordClassIds: dto.meanings.map((m) => m.wordClassId),
      languageIds: collectLanguageIds(dto),
      categoryIds: dto.categoryIds,
      relatedWordIds: linkRelations.map((r) => r.wordId),
      variantDialectIds: (dto.variants ?? [])
        .map((v) => v.dialectId)
        .filter((id): id is string => !!id),
      inline: {
        wordClassIds: collectInlineWordClassIds(inlineRelations),
        languageIds: collectInlineLanguageIds(inlineRelations),
        categoryIds: inlineRelations.flatMap((r) => r.word.categoryIds ?? []),
        variantDialectIds: inlineRelations.flatMap((r) =>
          (r.word.variants ?? [])
            .map((v) => v.dialectId)
            .filter((id): id is string => !!id),
        ),
      },
    });
    const details = mapMissingToDetails(dto, missing);
    if (details.length > 0) throw new ValidationError(details);

    // 2. Cek duplikat - warning, bukan error (induk + tiap lemma inline).
    //    Copy + auto-merge published dijalankan SETELAH save (butuh id baru).
    const parentWasDuplicate = await this.wordRepo.findDuplicate(dto.languageId, dto.lemma);
    const inlineWarnings: { field: string; message: string }[][] = inlineRelations.map(() => []);
    for (const [index, rel] of inlineRelations.entries()) {
      const dupInline = await this.wordRepo.findDuplicate(dto.languageId, rel.word.lemma);
      if (dupInline) {
        inlineWarnings[index].push({
          field: `related_words.${index}.word.lemma`,
          message: DUPLICATE_LEMMA_PENDING_MERGE,
        });
      }
    }

    // 3. Model publikasi (Section 22) PER ENTITAS - induk & tiap kata inline
    const parentPublication = resolvePublication(dto.status, actor.role, {
      anonymous: actor.userId === ANONIM_USER_ID,
    });
    const resolvedRelations = resolveInlineRelations(dto, inlineRelations, actor);

    // 4. Simpan atomik - induk + kata inline dlm SATU transaksi (bila ada)
    const parentToSave = { ...dto, ...parentPublication };
    const hasInline = resolvedRelations.length > 0;
    const { word: saved, inlineCreatedWords } = hasInline
      ? await this.wordRepo.saveWithInlineRelations(parentToSave, actor.userId, resolvedRelations)
      : { word: await this.wordRepo.saveWithRelations(parentToSave, actor.userId), inlineCreatedWords: [] };

    // 4b. Duplikat + langsung tayang → gabung ke kembaran published (bila ada)
    const { word, warnings } = await this.resolveDuplicateAfterSave(
      saved,
      parentWasDuplicate,
      actor.userId,
      'lemma',
    );

    // 5. Audit trail (Section 21) - SATU entri per entitas yang dibuat
    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'word',
      entityId: word.id,
      newData: {
        lemma: word.lemma,
        word_type: word.wordType,
        language_id: word.languageId,
        status: word.status,
        is_verified: word.isVerified,
        meanings_count: dto.meanings.length,
        ...(dto.searchMissId ? { search_miss_id: dto.searchMissId } : {}),
        ...(word.id !== saved.id ? { source_word_id: saved.id, merged_on_create: true } : {}),
      },
      requestId: actor.requestId ?? null,
    });
    for (const inline of inlineCreatedWords) {
      await this.auditRepo.record({
        userId: actor.userId,
        action: 'create',
        entityType: 'word',
        entityId: inline.id,
        newData: {
          lemma: inline.lemma,
          word_type: inline.wordType,
          status: inline.status,
          is_verified: inline.isVerified,
          meanings_count: inline.meaningsCount,
          inherited_meanings_count: inline.inheritedMeaningsCount,
          overridden_meanings_count: inline.overriddenMeaningsCount,
        },
        requestId: actor.requestId ?? null,
      });
    }

    return {
      word,
      warnings,
      inlineCreatedWords,
      inlineWarnings,
      searchMissId: dto.searchMissId ?? null,
    };
  }

  /**
   * Setelah insert: kalau lemma duplikat & status published, coba
   * publishOrMergeMeanings (sama seperti tombol Tayang). Tanpa kembaran
   * published → arahkan ke tab Duplikasi.
   */
  private async resolveDuplicateAfterSave(
    saved: Word,
    wasDuplicate: boolean,
    actorId: string,
    field: string,
  ): Promise<{ word: Word; warnings: { field: string; message: string }[] }> {
    if (!wasDuplicate) return { word: saved, warnings: [] };

    if (saved.status !== 'published') {
      return {
        word: saved,
        warnings: [{ field, message: DUPLICATE_LEMMA_PENDING_MERGE }],
      };
    }

    const merge = await this.wordRepo.publishOrMergeMeanings(saved.id, actorId);
    if (merge?.mergedIntoWordId) {
      const kept = await this.wordRepo.findById(merge.mergedIntoWordId);
      return {
        word: kept ?? saved,
        warnings: [{ field, message: DUPLICATE_LEMMA_MERGED_NOW }],
      };
    }

    return {
      word: saved,
      warnings: [{ field, message: DUPLICATE_LEMMA_USE_TAB }],
    };
  }

  /** Validasi miss aktif + soft-check term (12-api). No-op kalau field absen. */
  private async assertSearchMissProvenance(dto: CreateWordDto): Promise<void> {
    if (!dto.searchMissId) return;
    if (!this.searchMissRepo) {
      throw new NotFoundError('SEARCH_MISS_NOT_FOUND', 'Search miss tidak ditemukan');
    }
    const miss = await this.searchMissRepo.findById(dto.searchMissId);
    if (!miss) {
      throw new NotFoundError('SEARCH_MISS_NOT_FOUND', 'Search miss tidak ditemukan');
    }
    if (miss.direction === 'lemma') {
      if (normalizeSearchMissTerm(dto.lemma) !== miss.term) {
        throw new BadRequestError(
          'SEARCH_MISS_TERM_MISMATCH',
          'Lemma tidak cocok dengan istilah search miss',
          [{ field: 'lemma', message: `Harus cocok dengan miss term "${miss.term}"` }],
        );
      }
      return;
    }
    // direction=translation → soft-check teks terjemahan pertama
    const firstText = dto.meanings[0]?.translations[0]?.translationText ?? '';
    if (normalizeSearchMissTerm(firstText) !== miss.term) {
      throw new BadRequestError(
        'SEARCH_MISS_TERM_MISMATCH',
        'Terjemahan tidak cocok dengan istilah search miss',
        [
          {
            field: 'meanings.0.translations.0.translation_text',
            message: `Harus cocok dengan miss term "${miss.term}"`,
          },
        ],
      );
    }
  }
}

// ---- Form B: resolusi makna + publikasi per entitas (04) ----

function resolveInlineRelations(
  dto: CreateWordDto,
  inlineRelations: Extract<CreateWordRelatedDto, { relationType: unknown; word: InlineWordDto }>[],
  actor: Actor,
): ResolvedInlineRelation[] {
  return inlineRelations.map((rel) => {
    // status Form B default = status yang dikirim di body induk (bisa di-override)
    const requested = rel.word.status ?? dto.status;
    const publication = resolvePublication(requested, actor.role, {
      anonymous: actor.userId === ANONIM_USER_ID,
    });

    const { meanings, inheritedFrom, inheritedMeaningsCount, overriddenMeaningsCount } =
      resolveMeanings(dto.meanings, rel.word);

    return {
      relationType: rel.relationType,
      inheritedFrom,
      inheritedMeaningsCount,
      overriddenMeaningsCount,
      inlineWord: {
        languageId: dto.languageId,
        lemma: rel.word.lemma,
        notes: rel.word.notes ?? undefined,
        wordType: rel.word.wordType ?? dto.wordType,
        usageLabels: rel.word.usageLabels ?? [],
        meanings,
        categoryIds: rel.word.categoryIds ?? [],
        relatedWords: [], // kata inline tidak menampung relasi bersarang
        variants: rel.word.variants,
        pronunciation: rel.word.pronunciation,
        images: rel.word.images,
        status: publication.status,
        isVerified: publication.isVerified,
      },
    };
  });
}

// inherit=true: salin makna induk materialized + terapkan override satu-per-
// satu (translate-and-replace). inherit=false: pakai meanings yang dikirim.
function resolveMeanings(
  parentMeanings: CreateWordMeaningDto[],
  word: InlineWordDto,
): {
  meanings: CreateWordMeaningDto[];
  inheritedFrom: Record<number, number>;
  inheritedMeaningsCount: number;
  overriddenMeaningsCount: number;
} {
  if (word.inheritMeanings === false) {
    return {
      meanings: word.meanings ?? [],
      inheritedFrom: {},
      inheritedMeaningsCount: 0,
      overriddenMeaningsCount: 0,
    };
  }

  const overrides = new Map<number, MeaningOverrideDto>();
  for (const ov of word.meaningOverrides ?? []) {
    overrides.set(ov.meaningIndex, ov);
  }

  const meanings: CreateWordMeaningDto[] = parentMeanings.map((parent, parentIndex) => {
    let meaning: CreateWordMeaningDto = parent;
    const override = overrides.get(parentIndex);
    if (override) {
      meaning = {
        ...parent,
        definition: override.definition ?? parent.definition,
        wordClassId: override.wordClassId ?? parent.wordClassId,
        translations: override.translations ?? parent.translations,
        examples: override.examples ?? parent.examples,
      };
    }
    return meaning;
  });

  // Provenance: index makna inline → index makna INDUK. Makna yang
  // di-override TIDAK masuk map (kolom NULL = sudah "selesai mengikuti").
  const inheritedFrom: Record<number, number> = {};
  for (let i = 0; i < meanings.length; i++) {
    if (!overrides.has(i)) inheritedFrom[i] = i;
  }

  return {
    meanings,
    inheritedFrom,
    inheritedMeaningsCount: parentMeanings.length,
    overriddenMeaningsCount: overrides.size,
  };
}

// ---- Pemilahan bentuk (Form A / Form B) ----

export function isLinkRelation(
  r: CreateWordRelatedDto,
): r is Extract<CreateWordRelatedDto, { wordId: string }> {
  return 'wordId' in r;
}

export function isInlineRelation(
  r: CreateWordRelatedDto,
): r is Extract<CreateWordRelatedDto, { word: InlineWordDto }> {
  return 'word' in r;
}

// ---- Kumpulan id referensi kata inline (Form B) ----

function collectInlineWordClassIds(
  relations: Extract<CreateWordRelatedDto, { word: InlineWordDto }>[],
): string[] {
  return relations.flatMap((r) =>
    (r.word.meaningOverrides ?? [])
      .map((o) => o.wordClassId)
      .filter((id): id is string => !!id)
      .concat(
        (r.word.meanings ?? []).map((m) => m.wordClassId).filter((id): id is string => !!id),
      ),
  );
}

function collectInlineLanguageIds(
  relations: Extract<CreateWordRelatedDto, { word: InlineWordDto }>[],
): string[] {
  const ids: string[] = [];
  for (const r of relations) {
    for (const ov of r.word.meaningOverrides ?? []) {
      for (const t of ov.translations ?? []) ids.push(t.languageId);
      for (const ex of ov.examples ?? []) {
        ids.push(ex.sourceLanguageId);
        if (ex.targetLanguageId) ids.push(ex.targetLanguageId);
      }
    }
    for (const m of r.word.meanings ?? []) {
      for (const t of m.translations) ids.push(t.languageId);
      for (const ex of m.examples ?? []) {
        ids.push(ex.sourceLanguageId);
        if (ex.targetLanguageId) ids.push(ex.targetLanguageId);
      }
    }
  }
  return [...new Set(ids)];
}

// Dipakai bersama create-word dan correct-contribution (modul contribution)
export function collectLanguageIds(dto: CreateWordDto): string[] {
  const ids: string[] = [];
  for (const meaning of dto.meanings) {
    for (const t of meaning.translations) ids.push(t.languageId);
    for (const ex of meaning.examples ?? []) {
      ids.push(ex.sourceLanguageId);
      if (ex.targetLanguageId) ids.push(ex.targetLanguageId);
    }
  }
  return [...new Set(ids)];
}

export function mapMissingToDetails(
  dto: CreateWordDto,
  missing: MissingReferences,
): { field: string; message: string }[] {
  const details: { field: string; message: string }[] = [];

  if (missing.languageId) {
    details.push({ field: 'language_id', message: 'Bahasa tidak ditemukan' });
  }
  if (missing.dialectId) {
    details.push({ field: 'dialect_id', message: 'Dialek tidak ditemukan' });
  }
  for (const id of missing.wordClasses) {
    const idx = dto.meanings.findIndex((m) => m.wordClassId === id);
    const field = idx >= 0 ? `meanings.${idx}.word_class_id` : 'word_class_id';
    details.push({ field, message: `Kelas kata tidak ditemukan (${id})` });
  }
  for (const id of missing.languages) {
    details.push({ field: 'language_id', message: `Bahasa tidak ditemukan (${id})` });
  }
  for (const id of missing.categories) {
    details.push({ field: 'category_ids', message: `Kategori tidak ditemukan (${id})` });
  }
  for (const id of missing.words) {
    const idx = dto.relatedWords.findIndex((r) => 'wordId' in r && r.wordId === id);
    const field = idx >= 0 ? `related_words.${idx}.word_id` : 'related_words';
    details.push({ field, message: `Kata tidak ditemukan (${id})` });
  }
  if (missing.dialects.length > 0) {
    details.push({ field: 'variants', message: `Dialek tidak ditemukan (${missing.dialects.join(', ')})` });
  }

  // ---- Kata inline (Form B), field path related_words.N.word.* ----
  const inlineRefs = collectInlineRefPaths(dto);
  for (const id of missing.inlineWordClasses) {
    for (const ref of inlineRefs.filter((r) => r.type === 'word_class' && r.id === id)) {
      details.push({ field: ref.path, message: `Kelas kata tidak ditemukan (${id})` });
    }
  }
  for (const id of missing.inlineLanguages) {
    for (const ref of inlineRefs.filter((r) => r.type === 'language' && r.id === id)) {
      details.push({ field: ref.path, message: `Bahasa tidak ditemukan (${id})` });
    }
  }
  for (const id of missing.inlineCategories) {
    for (const ref of inlineRefs.filter((r) => r.type === 'category' && r.id === id)) {
      details.push({ field: ref.path, message: `Kategori tidak ditemukan (${id})` });
    }
  }
  if (missing.inlineDialects.length > 0) {
    details.push({
      field: 'related_words.word.variants',
      message: `Dialek tidak ditemukan (${missing.inlineDialects.join(', ')})`,
    });
  }

  return details;
}

interface InlineRefPath {
  type: 'word_class' | 'language' | 'category';
  id: string;
  path: string;
}

// Semua id referensi eksternal per kata inline + field path-nya - untuk
// memetakan missing id ke path yang benar saat VALIDATION_ERROR.
function collectInlineRefPaths(dto: CreateWordDto): InlineRefPath[] {
  const refs: InlineRefPath[] = [];
  dto.relatedWords.forEach((rel, n) => {
    if (!isInlineRelation(rel)) return;
    const word = rel.word;

    rel.word.meaningOverrides?.forEach((ov, m) => {
      if (ov.wordClassId) {
        refs.push({
          type: 'word_class',
          id: ov.wordClassId,
          path: `related_words.${n}.word.meaning_overrides.${m}.word_class_id`,
        });
      }
      for (const [k, t] of (ov.translations ?? []).entries()) {
        refs.push({ type: 'language', id: t.languageId, path: `related_words.${n}.word.meaning_overrides.${m}.translations.${k}.language_id` });
      }
      for (const [k, ex] of (ov.examples ?? []).entries()) {
        refs.push({ type: 'language', id: ex.sourceLanguageId, path: `related_words.${n}.word.meaning_overrides.${m}.examples.${k}.source_language_id` });
        if (ex.targetLanguageId) {
          refs.push({ type: 'language', id: ex.targetLanguageId, path: `related_words.${n}.word.meaning_overrides.${m}.examples.${k}.target_language_id` });
        }
      }
    });

    rel.word.meanings?.forEach((meaning, m) => {
      refs.push({ type: 'word_class', id: meaning.wordClassId, path: `related_words.${n}.word.meanings.${m}.word_class_id` });
      for (const [k, t] of meaning.translations.entries()) {
        refs.push({ type: 'language', id: t.languageId, path: `related_words.${n}.word.meanings.${m}.translations.${k}.language_id` });
      }
      for (const [k, ex] of (meaning.examples ?? []).entries()) {
        refs.push({ type: 'language', id: ex.sourceLanguageId, path: `related_words.${n}.word.meanings.${m}.examples.${k}.source_language_id` });
        if (ex.targetLanguageId) {
          refs.push({ type: 'language', id: ex.targetLanguageId, path: `related_words.${n}.word.meanings.${m}.examples.${k}.target_language_id` });
        }
      }
    });

    for (const [k, categoryId] of (word.categoryIds ?? []).entries()) {
      refs.push({ type: 'category', id: categoryId, path: `related_words.${n}.word.category_ids.${k}` });
    }
  });
  return refs;
}