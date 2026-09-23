import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/shared/database/drizzle/client';
import { wordEditSuggestions } from '@/shared/database/drizzle/schema';
import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
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
    const existing = await this.wordRepo.findById(cmd.wordId);
    if (!existing) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    if (existing.isVerified === cmd.verified) {
      throw new ConflictError(
        cmd.verified ? 'WORD_ALREADY_VERIFIED' : 'WORD_ALREADY_UNVERIFIED',
        cmd.verified
          ? 'Kata ini sudah terverifikasi'
          : 'Kata ini belum terverifikasi',
      );
    }

    if (cmd.verified) {
      const [open] = await db
        .select({ id: wordEditSuggestions.id })
        .from(wordEditSuggestions)
        .where(
          and(
            eq(wordEditSuggestions.wordId, cmd.wordId),
            eq(wordEditSuggestions.status, 'pending'),
            isNotNull(wordEditSuggestions.baselineSnapshot),
            isNull(wordEditSuggestions.deletedAt),
          ),
        )
        .limit(1);
      if (open) {
        throw new ConflictError(
          'SUGGESTION_ALREADY_PENDING',
          'Selesaikan usulan yang sudah menimpa kata ini sebelum menandai terverifikasi.',
        );
      }
    }
    const ok = await this.wordRepo.setVerified(cmd.wordId, {
      isVerified: cmd.verified,
      verifiedBy: cmd.actorId,
      verifiedAt: new Date(),
    });
    if (!ok) {
      const again = await this.wordRepo.findById(cmd.wordId);
      if (again && again.isVerified === cmd.verified) {
        throw new ConflictError(
          cmd.verified ? 'WORD_ALREADY_VERIFIED' : 'WORD_ALREADY_UNVERIFIED',
          cmd.verified
            ? 'Kata ini sudah terverifikasi'
            : 'Kata ini belum terverifikasi',
        );
      }
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
