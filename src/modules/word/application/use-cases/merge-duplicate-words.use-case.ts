import { BadRequestError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';

export interface MergeDuplicateWordsCommand {
  keepWordId: string;
  mergeWordIds: string[];
  actorId: string;
  requestId?: string | null;
}

export class MergeDuplicateWordsUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: MergeDuplicateWordsCommand): Promise<{
    keepWordId: string;
    mergedWordIds: string[];
  }> {
    const mergeIds = [...new Set(cmd.mergeWordIds.filter((id) => id !== cmd.keepWordId))];
    if (mergeIds.length === 0) {
      throw new ValidationError([
        { field: 'merge_word_ids', message: 'Pilih minimal satu entri untuk digabung' },
      ]);
    }

    const keep = await this.wordRepo.findById(cmd.keepWordId);
    if (!keep) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Entri yang dipertahankan tidak ditemukan');
    }

    try {
      const result = await this.wordRepo.mergeDuplicateWords(
        cmd.keepWordId,
        mergeIds,
        cmd.actorId,
      );

      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'merge',
        entityType: 'word',
        entityId: result.keepWordId,
        newData: {
          lemma: keep.lemma,
          merged_word_ids: result.mergedWordIds,
        },
        requestId: cmd.requestId ?? null,
      });

      return result;
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'KEEP_NOT_FOUND' || code === 'SOURCE_NOT_FOUND') {
        throw new NotFoundError('WORD_NOT_FOUND', 'Salah satu entri tidak ditemukan atau sudah dihapus');
      }
      if (code === 'LEMMA_MISMATCH') {
        throw new BadRequestError(
          'WORD_MERGE_LEMMA_MISMATCH',
          'Semua entri harus lemma dan bahasa yang sama',
        );
      }
      throw err;
    }
  }
}
