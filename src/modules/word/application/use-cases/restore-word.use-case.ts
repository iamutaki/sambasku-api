import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';

export interface RestoreWordCommand {
  wordId: string;
  actorId: string;
  requestId?: string | null;
}

/** Pulihkan entri taken_down ke published. is_verified tidak diubah. */
export class RestoreWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: RestoreWordCommand): Promise<void> {
    const existing = await this.wordRepo.findById(cmd.wordId);
    if (!existing) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    if (existing.status !== 'taken_down') {
      throw new ConflictError(
        'WORD_ALREADY_MODERATED',
        'Hanya entri yang ditarik yang bisa dipulihkan',
      );
    }

    const ok = await this.wordRepo.restore(cmd.wordId, cmd.actorId);
    if (!ok) {
      throw new ConflictError(
        'WORD_ALREADY_MODERATED',
        'Hanya entri yang ditarik yang bisa dipulihkan',
      );
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'restore',
      entityType: 'word',
      entityId: cmd.wordId,
      oldData: {
        status: 'taken_down',
        lemma: existing.lemma,
        reason_code: existing.takedownReasonCode,
      },
      newData: { status: 'published', is_verified: existing.isVerified },
      requestId: cmd.requestId ?? null,
    });
  }
}
