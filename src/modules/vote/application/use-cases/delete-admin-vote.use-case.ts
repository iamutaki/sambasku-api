import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { VoteRepository } from '../../domain/repositories/vote.repository';

export interface DeleteAdminVoteCommand {
  voteId: string;
  actorId: string;
  requestId?: string | null;
}

export interface DeleteAdminVoteResult {
  id: string;
}

/**
 * Delete vote individual (spam/brigading ringan). NotFoundError dari
 * repository (id tidak ada) diteruskan apa adanya. Audit log best-effort
 * (tidak throw - Section 21 base-stack).
 */
export class DeleteAdminVoteUseCase {
  constructor(
    private readonly voteRepo: VoteRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: DeleteAdminVoteCommand): Promise<DeleteAdminVoteResult> {
    // Sebelum delete, ambil oldData untuk audit (vote belum dihapus). Tidak
    // perlu findById terpisah: repository deleteById throw NotFoundError jika
    // id tidak ada. Namun untuk old_data audit kita butuh pre-snapshot.
    // Untuk sederhana & query minim: hard delete, lalu audit dengan data
    // minimal id + target yang tersedia (jika butuh detail bisa tambah
    // findById nanti, tapi MVP cukup audit id + voteId).
    await this.voteRepo.deleteById(cmd.voteId);

    try {
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'delete',
        entityType: 'vote',
        entityId: cmd.voteId,
        oldData: { id: cmd.voteId },
        newData: null,
        requestId: cmd.requestId ?? null,
      });
    } catch (err) {
      // Best-effort: audit tidak pernah gagalkan request user.
      console.error('[audit:vote:delete] gagal rekam audit trail', err);
    }

    return { id: cmd.voteId };
  }
}
