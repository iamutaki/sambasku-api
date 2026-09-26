import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { BadRequestError } from '@/shared/errors/app-error';
import { FIRST_PARTY_CLIENT_IDS } from '@/modules/developer-oauth/domain/entities/api-client.entity';
import type { VoteRepository } from '../../domain/repositories/vote.repository';

const FIRST_PARTY_SET = new Set<string>(Object.values(FIRST_PARTY_CLIENT_IDS));

export interface ResetVotesByClientCommand {
  clientId: string;
  actorId: string;
  requestId?: string | null;
}

export interface ResetVotesByClientResult {
  clientId: string;
  deletedCount: number;
}

/**
 * Hapus semua vote yang diatribusikan ke client_id (revoke third-party).
 * First-party client_id ditolak - jangan hapus massal vote app resmi.
 */
export class ResetVotesByClientUseCase {
  constructor(
    private readonly voteRepo: VoteRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ResetVotesByClientCommand): Promise<ResetVotesByClientResult> {
    if (FIRST_PARTY_SET.has(cmd.clientId)) {
      throw new BadRequestError(
        'CLIENT_MISMATCH',
        'Tidak boleh reset vote massal untuk klien first-party',
        [{ field: 'client_id', message: 'Klien first-party dilindungi' }],
      );
    }

    const deletedCount = await this.voteRepo.resetByClientId(cmd.clientId);

    try {
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'reset_by_client',
        entityType: 'vote',
        entityId: cmd.clientId,
        oldData: { clientId: cmd.clientId, count: deletedCount },
        newData: { count: 0 },
        requestId: cmd.requestId ?? null,
      });
    } catch (err) {
      console.error('[audit:vote:reset-by-client] gagal rekam audit trail', err);
    }

    return { clientId: cmd.clientId, deletedCount };
  }
}
