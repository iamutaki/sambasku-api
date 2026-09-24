import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { NotFoundError } from '@/shared/errors/app-error';
import type { ImageContentWarning } from '@/shared/constants/image-content-warnings';
import type { WordRepository, WordImageMedia } from '../../domain/repositories/word.repository';

export interface SetWordImageContentWarningsDto {
  contentWarnings: ImageContentWarning[];
  actorId: string;
  requestId?: string | null;
}

/** Set/clear content_warnings pada satu foto + audit trail. */
export class SetWordImageContentWarningsUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(imageId: string, dto: SetWordImageContentWarningsDto): Promise<WordImageMedia> {
    const existing = await this.wordRepo.findWordImageById(imageId);
    if (!existing) {
      throw new NotFoundError('WORD_IMAGE_NOT_FOUND', 'Gambar kata tidak ditemukan');
    }

    const updated = await this.wordRepo.setWordImageContentWarnings(
      imageId,
      dto.contentWarnings,
    );
    if (!updated) {
      throw new NotFoundError('WORD_IMAGE_NOT_FOUND', 'Gambar kata tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: dto.actorId,
      action: 'content_warnings.update',
      entityType: 'word_image',
      entityId: imageId,
      oldData: {
        word_id: existing.wordId,
        content_warnings: existing.contentWarnings,
      },
      newData: {
        word_id: updated.wordId,
        content_warnings: updated.contentWarnings,
      },
      requestId: dto.requestId ?? null,
    });

    return updated;
  }
}
