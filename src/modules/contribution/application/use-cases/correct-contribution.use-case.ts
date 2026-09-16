import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { CreateWordDto } from '@/modules/word/application/dto/create-word.dto';
import {
  collectLanguageIds,
  mapMissingToDetails,
} from '@/modules/word/application/use-cases/create-word.use-case';
import type { ReviewOutcome } from '../../domain/entities/contribution.entity';
import type {
  ContributionRepository,
  ExamplePatch,
  PronunciationPatch,
  WordImagePatch,
} from '../../domain/repositories/contribution.repository';

export interface CorrectContributionInput {
  /** entity_type 'word' — payload koreksi lengkap (replace semantics) */
  word?: CreateWordDto;
  pronunciation?: PronunciationPatch;
  wordImage?: WordImagePatch;
  example?: ExamplePatch;
}

export interface CorrectContributionCommand {
  contributionId: string;
  actorId: string;
  requestId?: string | null;
  comment: string | null;
  input: CorrectContributionInput;
}

// Verifikator mengoreksi langsung isi kontribusi saat review: entity
// diperbarui + is_corrected true, lalu published + verified.
//
// Catatan non-atomik (didokumentasikan di docs/api/03): koreksi entity
// 'word' = DUA tulis — updateWithRelations dulu, baru transaksi review().
// Window kecil; koreksi entity anak sepenuhnya atomik di review().
export class CorrectContributionUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: CorrectContributionCommand): Promise<ReviewOutcome> {
    const contrib = await this.contributionRepo.findById(cmd.contributionId);
    if (!contrib) {
      throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi dengan id tersebut tidak ditemukan');
    }
    if (contrib.status !== 'pending') {
      throw new ConflictError('CONTRIBUTION_ALREADY_REVIEWED', 'Kontribusi ini sudah diproses — sudah ada keputusan review');
    }

    const { input } = cmd;
    const patchPresent: Record<string, boolean> = {
      word: !!input.word,
      pronunciation: !!input.pronunciation,
      word_image: !!input.wordImage,
      example: !!input.example,
    };
    if (!patchPresent[contrib.entityType]) {
      throw new ValidationError([
        { field: 'entity_type', message: `entity_type tidak cocok — kontribusi ini bertipe ${contrib.entityType}` },
      ]);
    }

    // Snapshot pra-koreksi → audit old_data (WAJIB — jejak apa yang diubah)
    const oldData = await this.snapshot(contrib.entityType, contrib.entityId);

    if (contrib.entityType === 'word') {
      await this.applyWordCorrection(contrib.entityId, input.word!, cmd.actorId);
    }

    const outcome = await this.contributionRepo.review({
      contributionId: cmd.contributionId,
      decision: 'correct',
      reviewerId: cmd.actorId,
      comment: cmd.comment,
      childPatch: {
        pronunciation: input.pronunciation,
        wordImage: input.wordImage,
        example: input.example,
      },
    });

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'correct',
      entityType: contrib.entityType,
      entityId: contrib.entityId,
      oldData,
      newData: {
        contribution_id: outcome.contributionId,
        status: 'published',
        is_verified: true,
        is_corrected: true,
        comment: cmd.comment,
      },
      requestId: cmd.requestId ?? null,
    });

    return outcome;
  }

  private async snapshot(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    if (entityType === 'word') {
      const detail = await this.wordRepo.findDetailById(entityId, { includeAllStatuses: true });
      if (!detail) return null;
      return { lemma: detail.lemma, status: detail.status, is_verified: detail.isVerified };
    }
    const child = await this.contributionRepo.findChildWithParent(
      entityType as 'pronunciation' | 'word_image' | 'example',
      entityId,
    );
    if (!child) return null;
    return { word_lemma: child.wordLemma, ...child.data, status: child.status, is_verified: child.isVerified };
  }

  // Validasi referensi (pola create-word) lalu replace semantics
  private async applyWordCorrection(wordId: string, dto: CreateWordDto, actorId: string): Promise<void> {
    if (dto.wordType === 'word' && dto.relatedWords.some((r) => r.relationType === 'has_component')) {
      throw new ValidationError([
        { field: 'related_words', message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan' },
      ]);
    }

    const missing = await this.wordRepo.findMissingReferences({
      languageId: dto.languageId,
      dialectId: dto.dialectId,
      wordClassIds: dto.meanings.map((m) => m.wordClassId),
      languageIds: collectLanguageIds(dto),
      categoryIds: dto.categoryIds,
      relatedWordIds: dto.relatedWords.map((r) => r.wordId),
      variantDialectIds: (dto.variants ?? [])
        .map((v) => v.dialectId)
        .filter((id): id is string => !!id),
    });
    const details = mapMissingToDetails(dto, missing);
    if (details.length > 0) throw new ValidationError(details);

    await this.wordRepo.updateWithRelations(
      wordId,
      { ...dto, status: 'published', isVerified: true, isCorrected: true },
      actorId,
    );
  }
}
