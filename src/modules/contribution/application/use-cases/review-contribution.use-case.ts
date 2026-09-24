import { ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { ReviewOutcome } from '../../domain/entities/contribution.entity';
import type { ContributionRepository } from '../../domain/repositories/contribution.repository';
import {
  deleteStagingWordImage,
  promoteWordImageFromStaging,
} from '../utils/promote-word-image-staging';

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
// Gambar ImageKit staging: promote → GitHub sebelum approve; hapus saat reject.
export class ReviewContributionUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly wordRepo: WordRepository,
    private readonly publicImageStorage: PublicImageStoragePort,
    private readonly imageStorage: ImageStoragePort,
    private readonly notifyUser?: NotifyUserUseCase,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: ReviewContributionCommand): Promise<ReviewOutcome> {
    if (cmd.decision === 'reject' && !cmd.comment?.trim()) {
      throw new ValidationError([{ field: 'comment', message: 'Alasan penolakan wajib diisi' }]);
    }

    const contrib = await this.contributionRepo.findById(cmd.contributionId);
    if (contrib) {
      await this.handleStagingImages(contrib.entityType, contrib.entityId, cmd.decision);
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

    await this.inbox?.execute({
      userId: outcome.contributorUserId,
      type: cmd.decision === 'approve' ? 'contribution_approved' : 'contribution_rejected',
      targetKind: 'contribution',
      targetId: outcome.contributionId,
    });

    if (cmd.decision === 'approve' && this.notifyUser) {
      // WAJIB await: di Cloudflare Workers, void/fire-and-forget sering
      // terbunuh saat response sudah dikirim. Approve sedikit lebih lambat
      // (~FCM RTT) tapi push benar-benar selesai.
      await this.notifyUser.execute({
        userId: outcome.contributorUserId,
        title: 'Kontribusi disetujui',
        body: 'Usulan Anda telah disetujui dan dipublikasikan.',
        data: {
          type: 'contribution_approved',
          target_kind: 'contribution',
          target_id: outcome.contributionId,
          contribution_id: outcome.contributionId,
          entity_type: outcome.entityType,
          entity_id: outcome.entityId,
        },
      });
    }

    return outcome;
  }

  private async handleStagingImages(
    entityType: string,
    entityId: string,
    decision: 'approve' | 'reject',
  ): Promise<void> {
    const stagingList =
      entityType === 'word_image'
        ? await this.stagingForWordImage(entityId)
        : entityType === 'word'
          ? await this.wordRepo.listStagingWordImages(entityId)
          : [];

    for (const img of stagingList) {
      if (img.provider !== 'imagekit') continue;
      const staging = {
        id: img.id,
        url: img.url,
        provider: img.provider,
        providerFileId: img.providerFileId,
      };

      if (decision === 'approve') {
        const promoted = await promoteWordImageFromStaging(staging, this.publicImageStorage);
        await this.wordRepo.applyPromotedWordImage(img.id, promoted);
        await deleteStagingWordImage(staging, this.imageStorage);
      } else {
        await deleteStagingWordImage(staging, this.imageStorage);
      }
    }
  }

  private async stagingForWordImage(imageId: string) {
    const img = await this.wordRepo.findWordImageById(imageId);
    if (!img || img.provider !== 'imagekit' || img.isVerified) return [];
    return [img];
  }
}
