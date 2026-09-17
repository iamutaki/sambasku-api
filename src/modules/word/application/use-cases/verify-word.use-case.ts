import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';

export interface VerifyWordCommand {
  wordId: string;
  verified: boolean;
  actorId: string;
  requestId?: string | null;
}

// Verifikator (admin/root/reviewer) memflip is_verified - Section 22.
// Role check ada di route; use case murni aksi + audit.
export class VerifyWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: VerifyWordCommand): Promise<void> {
    const ok = await this.wordRepo.setVerified(cmd.wordId, {
      isVerified: cmd.verified,
      verifiedBy: cmd.actorId,
      verifiedAt: new Date(),
    });
    if (!ok) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: cmd.verified ? 'verify' : 'unverify',
      entityType: 'word',
      entityId: cmd.wordId,
      newData: { is_verified: cmd.verified },
      requestId: cmd.requestId ?? null,
    });
  }
}
