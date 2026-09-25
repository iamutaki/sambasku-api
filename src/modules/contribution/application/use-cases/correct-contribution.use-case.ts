import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { CreateWordDto } from '@/modules/word/application/dto/create-word.dto';
import {
  collectLanguageIds,
  isInlineRelation,
  isLinkRelation,
  mapMissingToDetails,
} from '@/modules/word/application/use-cases/create-word.use-case';
import type { ReviewOutcome } from '../../domain/entities/contribution.entity';
import type {
  ContributionRepository,
  ExamplePatch,
  PronunciationPatch,
  WordAudioPatch,
  WordImagePatch,
} from '../../domain/repositories/contribution.repository';

export interface CorrectContributionInput {
  /** entity_type 'word' - payload koreksi lengkap (replace semantics) */
  word?: CreateWordDto;
  pronunciation?: PronunciationPatch;
  wordImage?: WordImagePatch;
  wordAudio?: WordAudioPatch;
  example?: ExamplePatch;
}

export interface CorrectContributionCommand {
  contributionId: string;
  actorId: string;
  requestId?: string | null;
  comment: string | null;
  /**
   * true (default) = koreksi + publish + verified (kontribusi jadi 'corrected');
   * false = KOREKSI SAJA - entity ditimpa tapi tetap 'pending_review',
   * kontribusi tetap 'pending' (bisa di-approve/publish belakangan).
   */
  publish: boolean;
  input: CorrectContributionInput;
}

// Verifikator mengoreksi langsung isi kontribusi saat review.
// - publish=true: entity diperbarui + is_corrected true, lalu published +
//   verified + contributions.status='corrected'.
// - publish=false: entity diperbarui + is_corrected true TAPI tetap
//   pending_review; contributions.status TETAP 'pending' dan tidak ada
//   keputusan review (supaya bisa di-approve/di-correct lagi).
//
// Koreksi kata: validasi dulu, lalu withPendingLock memegang klaim pending
// selama updateWithRelations dan review() pada transaksi yang sama.
export class CorrectContributionUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: CorrectContributionCommand): Promise<ReviewOutcome> {
    const contrib = await this.contributionRepo.findById(cmd.contributionId);
    if (!contrib) {
      throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi dengan id tersebut tidak ditemukan');
    }
    if (contrib.status !== 'pending') {
      throw new ConflictError('CONTRIBUTION_ALREADY_REVIEWED', 'Kontribusi ini sudah diproses - sudah ada keputusan review');
    }

    const { input, publish } = cmd;
    const patchPresent: Record<string, boolean> = {
      word: !!input.word,
      pronunciation: !!input.pronunciation,
      word_image: !!input.wordImage,
      word_audio: !!input.wordAudio,
      example: !!input.example,
    };
    if (!patchPresent[contrib.entityType]) {
      throw new ValidationError([
        { field: 'entity_type', message: `entity_type tidak cocok - kontribusi ini bertipe ${contrib.entityType}` },
      ]);
    }

    // Snapshot pra-koreksi → audit old_data (WAJIB - jejak apa yang diubah)
    const oldData = await this.snapshot(contrib.entityType, contrib.entityId);

    const reviewCmd = {
      contributionId: cmd.contributionId,
      decision: 'correct' as const,
      reviewerId: cmd.actorId,
      comment: cmd.comment,
      childPatch: {
        pronunciation: input.pronunciation,
        wordImage: input.wordImage,
        wordAudio: input.wordAudio,
        example: input.example,
      },
    };

    let outcome: ReviewOutcome;
    if (contrib.entityType === 'word') {
      // Validasi dulu (tanpa kunci), lalu tulis kata + keputusan di transaksi
      // yang sama supaya koreksi dan setujui tidak saling menimpa.
      const wordSave = await this.prepareWordCorrection(contrib.entityId, input.word!, publish);
      outcome = await this.contributionRepo.withPendingLock(cmd.contributionId, async (tx) => {
        const updated = await this.wordRepo.updateWithRelations(contrib.entityId, wordSave, cmd.actorId, tx);
        if (!updated) {
          throw new NotFoundError('WORD_NOT_FOUND', 'Kata kontribusi tidak ditemukan');
        }
        if (!publish) {
          return {
            contributionId: cmd.contributionId,
            entityType: contrib.entityType,
            entityId: contrib.entityId,
            status: 'pending' as const,
            contributorUserId: contrib.userId,
          };
        }
        // alreadyClaimed: withPendingLock sudah klaim. wordAlreadyLive: anak
        // sudah published+verified lewat updateWithRelations - review hanya
        // tutup kontribusi (+ merge twin bila ada), tanpa re-publish penuh.
        return this.contributionRepo.review(
          { ...reviewCmd, alreadyClaimed: true, wordAlreadyLive: true },
          tx,
        );
      });
    } else if (publish) {
      outcome = await this.contributionRepo.review(reviewCmd);
    } else {
      // Koreksi saja: patch anak diterapkan tanpa mengubah status kontribusi.
      await this.contributionRepo.applyChildCorrection({
        entityType: contrib.entityType as 'pronunciation' | 'word_image' | 'word_audio' | 'example',
        entityId: contrib.entityId,
        actorId: cmd.actorId,
        pronunciation: input.pronunciation,
        wordImage: input.wordImage,
        wordAudio: input.wordAudio,
        example: input.example,
      });
      outcome = {
        contributionId: cmd.contributionId,
        entityType: contrib.entityType,
        entityId: contrib.entityId,
        status: 'pending',
        contributorUserId: contrib.userId,
      };
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'correct',
      entityType: contrib.entityType,
      entityId: contrib.entityId,
      oldData,
      newData: {
        contribution_id: outcome.contributionId,
        status: publish ? 'published' : 'pending',
        is_verified: publish,
        is_corrected: true,
        published: publish,
        comment: cmd.comment,
      },
      requestId: cmd.requestId ?? null,
    });

    if (publish && outcome.status === 'corrected') {
      await this.inbox?.execute({
        userId: outcome.contributorUserId,
        type: 'contribution_corrected',
        targetKind: 'contribution',
        targetId: outcome.contributionId,
        actorId: cmd.actorId,
      });
    }

    return outcome;
  }

  private async snapshot(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    if (entityType === 'word') {
      // Satu SELECT 3 kolom - jangan findDetailById (~12 RT Turso/Workers)
      const snap = await this.wordRepo.findAuditSnapshotById(entityId);
      if (!snap) return null;
      return { lemma: snap.lemma, status: snap.status, is_verified: snap.isVerified };
    }
    const child = await this.contributionRepo.findChildWithParent(
      entityType as 'pronunciation' | 'word_image' | 'word_audio' | 'example',
      entityId,
    );
    if (!child) return null;
    return { word_lemma: child.wordLemma, ...child.data, status: child.status, is_verified: child.isVerified };
  }

  // Validasi referensi (pola create-word). Tulisan terjadi di withPendingLock.
  private async prepareWordCorrection(wordId: string, dto: CreateWordDto, publish: boolean) {
    if (dto.wordType === 'word' && dto.relatedWords.some((r) => r.relationType === 'has_component')) {
      throw new ValidationError([
        { field: 'related_words', message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan' },
      ]);
    }

    // 04: koreksi (replace) TIDAK mendukung kata inline - buat kata inline
    // lewat create dulu, lalu tautkan lewat Form A (update endpoint menyusul di 01)
    const inlineIndex = dto.relatedWords.findIndex(isInlineRelation);
    if (inlineIndex >= 0) {
      throw new ValidationError([
        {
          field: `related_words.${inlineIndex}.word`,
          message: 'Kata baru inline tidak didukung pada koreksi kontribusi - buat kata terpisah lalu tautkan',
        },
      ]);
    }

    const missing = await this.wordRepo.findMissingReferences({
      languageId: dto.languageId,
      dialectId: dto.dialectId,
      wordClassIds: dto.meanings.map((m) => m.wordClassId),
      languageIds: collectLanguageIds(dto),
      categoryIds: dto.categoryIds,
      relatedWordIds: dto.relatedWords.filter(isLinkRelation).map((r) => r.wordId),
      variantDialectIds: (dto.variants ?? [])
        .map((v) => v.dialectId)
        .filter((id): id is string => !!id),
      inline: {
        wordClassIds: [],
        languageIds: [],
        categoryIds: [],
        variantDialectIds: [],
      },
    });
    const details = mapMissingToDetails(dto, missing);
    if (details.length > 0) throw new ValidationError(details);

    // publish=true → status akhir sudah pasti published; jangan load detail penuh.
    // publish=false → stayLive kalau kata sudah tayang (snapshot tipis cukup).
    let stayLive = false;
    if (!publish) {
      const current = await this.wordRepo.findAuditSnapshotById(wordId);
      stayLive = current?.status === 'published';
    }
    return {
      ...dto,
      status: (publish || stayLive ? 'published' : 'pending_review') as 'published' | 'pending_review',
      isVerified: publish,
      isCorrected: true,
    };
  }
}
