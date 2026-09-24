import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Word } from '../../domain/entities/word.entity';
import type { MissingReferences, WordRepository, WordToSave } from '../../domain/repositories/word.repository';
import type { UpdateWordDto } from '../dto/update-word.dto';
import type { Actor } from './create-word.use-case';
import { collectLanguageIds, mapMissingToDetails } from './create-word.use-case';
import { resolvePublication } from '../utils/resolve-publication';
import { assertContributorWordImageProvider } from '../utils/assert-word-image-provider';
import {
  DUPLICATE_LEMMA_MERGED_NOW,
  DUPLICATE_LEMMA_PENDING_MERGE,
  DUPLICATE_LEMMA_USE_TAB,
} from '../utils/duplicate-lemma-warning';

export interface UpdateWordResult {
  word: Word;
  warnings: { field: string; message: string }[];
}

// 05-api-edit-kata.md - alur menggenapi CreateWordUseCase: muat lama →
// aturan silang → validasi referensi → duplikat (exclude diri) →
// resolvePublication → transaksi replace → audit update (old + new).
// SATU-satunya method repo yang dipakai untuk menulis: updateWithRelations.
export class UpdateWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(id: string, dto: UpdateWordDto, actor: Actor): Promise<UpdateWordResult> {
    // 1. Muat kata lama (SEMUA status - form edit bisa membuka draft/
    //    pending_review/rejected; soft-deleted sudah terfilter repo → 404).
    //    Snapshot dipakai untuk audit old_data + preserve is_corrected.
    const existing = await this.wordRepo.findDetailById(id, { includeAllStatuses: true });
    if (!existing) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    // 2. Aturan silang (sama seperti create): has_component hanya entri frasa
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

    for (const img of dto.images ?? []) {
      assertContributorWordImageProvider(img.provider, actor.role);
    }

    // 3. Validasi referensi eksternal - bentuk panggilan sama dengan create
    //    (bagian inline kosong: Form B tidak ada di edit)
    const missing: MissingReferences = await this.wordRepo.findMissingReferences({
      languageId: dto.languageId,
      dialectId: dto.dialectId,
      wordClassIds: dto.meanings.map((m) => m.wordClassId),
      languageIds: collectLanguageIds(dto),
      categoryIds: dto.categoryIds,
      relatedWordIds: dto.relatedWords.map((r) => r.wordId),
      variantDialectIds: (dto.variants ?? [])
        .map((v) => v.dialectId)
        .filter((dialectId): dialectId is string => !!dialectId),
      inline: { wordClassIds: [], languageIds: [], categoryIds: [], variantDialectIds: [] },
    });
    const details = mapMissingToDetails(dto, missing);
    if (details.length > 0) throw new ValidationError(details);

    // 4. Cek duplikat - warning, bukan error; WAJIB exclude diri sendiri
    const wasDuplicate = await this.wordRepo.findDuplicate(dto.languageId, dto.lemma, id);

    // 5. Model publikasi (Section 22) - helper sama dengan create.
    //    Preserve is_corrected dari kata lama: edit biasa TIDAK boleh
    //    me-reset flag "pernah dikoreksi verifikator" (impl default false).
    const publication = resolvePublication(dto.status, actor.role);
    const toSave: WordToSave = {
      ...dto,
      status: publication.status,
      isVerified: publication.isVerified,
      isCorrected: existing.isCorrected,
    };

    // 6. Transaksi replace (impl: hapus children lama → insert baru, satu
    //    db.transaction + baris contributions action 'update' otomatis).
    //    null = kalah race soft-delete → 404
    let word = await this.wordRepo.updateWithRelations(id, toSave, actor.userId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const warnings: { field: string; message: string }[] = [];
    if (wasDuplicate) {
      if (word.status === 'published') {
        const merge = await this.wordRepo.publishOrMergeMeanings(word.id, actor.userId);
        if (merge?.mergedIntoWordId) {
          const kept = await this.wordRepo.findById(merge.mergedIntoWordId);
          if (kept) word = kept;
          warnings.push({ field: 'lemma', message: DUPLICATE_LEMMA_MERGED_NOW });
        } else {
          warnings.push({ field: 'lemma', message: DUPLICATE_LEMMA_USE_TAB });
        }
      } else {
        warnings.push({ field: 'lemma', message: DUPLICATE_LEMMA_PENDING_MERGE });
      }
    }

    // 7. Audit trail (Section 21) - update MEMBAWA old_data (snapshot pra-edit)
    await this.auditRepo.record({
      userId: actor.userId,
      action: 'update',
      entityType: 'word',
      entityId: word.id,
      oldData: {
        lemma: existing.lemma,
        word_type: existing.wordType,
        language_id: existing.languageId,
        status: existing.status,
        is_verified: existing.isVerified,
        meanings_count: existing.meanings.length,
      },
      newData: {
        lemma: word.lemma,
        word_type: word.wordType,
        language_id: word.languageId,
        status: word.status,
        is_verified: word.isVerified,
        meanings_count: dto.meanings.length,
        ...(word.id !== id ? { source_word_id: id, merged_on_update: true } : {}),
      },
      requestId: actor.requestId ?? null,
    });

    return { word, warnings };
  }
}
