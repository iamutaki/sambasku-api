import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';

export interface SoftDeleteWordCommand {
  wordId: string;
  actorId: string;
  requestId?: string | null;
}

// Soft-delete kata (07-api-delete-kata.md). Efek sama dengan hapus bagi
// publik & admin (semua query memfilter deleted_at) tapi baris + children
// dipertahankan untuk audit/recovery. Role check ada di route; use case
// murni: muat snapshot → softDelete → audit 'delete' dengan old_data
// (aksi destruktif layak jejak lengkap - 02-api-audit-logs.md Section 21).
// idempotent: kata yang sudah soft-deleted → findById null → 404.
export class SoftDeleteWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: SoftDeleteWordCommand): Promise<void> {
    // 1. Snapshot pra-hapus untuk audit old_data (semua status boleh dihapus;
    //    soft-deleted sudah terfilter repo → null = 404).
    const existing = await this.wordRepo.findById(cmd.wordId);
    if (!existing) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    // 2. Soft-delete (set deleted_at + deleted_by). false = kalah race
    //    (sudah dihapus antar langkah 1 & 2) → 404.
    const ok = await this.wordRepo.softDelete(cmd.wordId, cmd.actorId);
    if (!ok) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    // 3. Audit trail - aksi destruktif membawa old_data snapshot pra-hapus
    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'word',
      entityId: cmd.wordId,
      oldData: {
        lemma: existing.lemma,
        word_type: existing.wordType,
        language_id: existing.languageId,
        status: existing.status,
        is_verified: existing.isVerified,
      },
      requestId: cmd.requestId ?? null,
    });
  }
}