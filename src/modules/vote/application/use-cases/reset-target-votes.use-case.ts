import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { VoteRepository, VoteTarget, VoteTargetType } from '../../domain/repositories/vote.repository';

export interface ResetTargetVotesCommand {
  target: VoteTarget;
  actorId: string;
  requestId?: string | null;
}

export interface ResetTargetVotesResult {
  entityType: VoteTargetType;
  entityId: string;
  deletedCount: number;
}

/**
 * Reset SEMUA vote untuk target tertentu (anti-brigading massal). Return
 * jumlah baris yang dihapus (0 = target tidak punya vote, aman). Audit
 * trail oldData.count, best-effort tidak throw.
 */
export class ResetTargetVotesUseCase {
  constructor(
    private readonly voteRepo: VoteRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ResetTargetVotesCommand): Promise<ResetTargetVotesResult> {
    const deletedCount = await this.voteRepo.resetTarget(cmd.target);

    try {
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'reset_target',
        entityType: 'vote',
        entityId: `${cmd.target.entityType}:${cmd.target.entityId}`,
        oldData: {
          entityType: cmd.target.entityType,
          entityId: cmd.target.entityId,
          count: deletedCount,
        },
        newData: { count: 0 },
        requestId: cmd.requestId ?? null,
      });
    } catch (err) {
      console.error('[audit:vote:reset-target] gagal rekam audit trail', err);
    }

    return {
      entityType: cmd.target.entityType,
      entityId: cmd.target.entityId,
      deletedCount,
    };
  }
}
