import { ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import type { ReviewOutcome } from '../../domain/entities/contribution.entity';
import type { ContributionRepository } from '../../domain/repositories/contribution.repository';

export interface ReviewContributionCommand {
  contributionId: string;
  decision: 'approve' | 'reject';
  /** WAJIB untuk reject (alasan penolakan) - domain rule, bukan cuma validator */
  comment: string | null;
  actorId: string;
  requestId?: string | null;
}

// Verifikator (admin/root/reviewer) menyetujui / menolak kontribusi
// (03-api-kontribusi-verifikasi.md). Role check ada di route; use case
// murni keputusan + audit. 404/409 dilempar repository DI DALAM transaksi.
// Setelah approve: push FCM best-effort ke kontributor (multi-device).
export class ReviewContributionUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly notifyUser?: NotifyUserUseCase,
  ) {}

  async execute(cmd: ReviewContributionCommand): Promise<ReviewOutcome> {
    if (cmd.decision === 'reject' && !cmd.comment?.trim()) {
      throw new ValidationError([{ field: 'comment', message: 'Alasan penolakan wajib diisi' }]);
    }

    const outcome = await this.contributionRepo.review({
      contributionId: cmd.contributionId,
      decision: cmd.decision,
      reviewerId: cmd.actorId,
      comment: cmd.comment,
    });

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: cmd.decision,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      newData: { contribution_id: outcome.contributionId, status: outcome.status, comment: cmd.comment },
      requestId: cmd.requestId ?? null,
    });

    if (cmd.decision === 'approve' && this.notifyUser) {
      void this.notifyUser.execute({
        userId: outcome.contributorUserId,
        title: 'Kontribusi disetujui',
        body: 'Usulan Anda telah disetujui dan dipublikasikan.',
        data: {
          type: 'contribution_approved',
          contribution_id: outcome.contributionId,
          entity_type: outcome.entityType,
          entity_id: outcome.entityId,
        },
      });
    }

    return outcome;
  }
}
