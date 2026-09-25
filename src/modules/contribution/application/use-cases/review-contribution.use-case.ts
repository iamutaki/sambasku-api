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

export interface ImageReviewDecision {
  imageId: string;
  decision: 'approve' | 'reject';
}

export interface CensoredImageFile {
  bytes: Uint8Array;
  mimeType: string | null;
}

export interface ReviewContributionCommand {
  contributionId: string;
  decision: 'approve' | 'reject';
  /** WAJIB untuk reject (alasan penolakan) - domain rule, bukan cuma validator */
  comment: string | null;
  actorId: string;
  requestId?: string | null;
  /**
   * Hanya usulan kata + decision approve. Foto yang tidak disebut ditayangkan.
   * Pada reject seluruh kontribusi, field ini diabaikan.
   */
  imageDecisions?: ImageReviewDecision[];
  /** Bytes sensor per image id (opsional; hanya foto yang ditayangkan). */
  censoredFiles?: Record<string, CensoredImageFile>;
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
    const rejectedImageIds =
      cmd.decision === 'approve' ? await this.rejectedWordImageIds(contrib, cmd.imageDecisions) : [];
    if (contrib) {
      await this.handleStagingImages(
        contrib.entityType,
        contrib.entityId,
        cmd.decision,
        rejectedImageIds,
        cmd.censoredFiles ?? {},
      );
    }

    const outcome = await this.contributionRepo.review({
      contributionId: cmd.contributionId,
      decision: cmd.decision,
      reviewerId: cmd.actorId,
      comment: cmd.comment,
      ...(rejectedImageIds.length > 0 ? { rejectedImageIds } : {}),
    });

    // Soft-delete foto ditahan (stock + ImageKit) agar hilang dari GET publik.
    if (rejectedImageIds.length > 0) {
      await this.wordRepo.softDeleteWordImages(rejectedImageIds);
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: cmd.decision,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      newData: {
        contribution_id: outcome.contributionId,
        status: outcome.status,
        comment: cmd.comment,
        ...(rejectedImageIds.length > 0 ? { rejected_image_ids: rejectedImageIds } : {}),
      },
      requestId: cmd.requestId ?? null,
    });

    await this.inbox?.execute({
      userId: outcome.contributorUserId,
      type: cmd.decision === 'approve' ? 'contribution_approved' : 'contribution_rejected',
      targetKind: 'contribution',
      targetId: outcome.contributionId,
      actorId: cmd.actorId,
    });

    if (this.notifyUser) {
      const approved = cmd.decision === 'approve';
      // WAJIB await: di Cloudflare Workers, void/fire-and-forget sering
      // terbunuh saat response sudah dikirim. Review sedikit lebih lambat
      // (~FCM RTT) tapi push benar-benar selesai.
      await this.notifyUser.execute({
        userId: outcome.contributorUserId,
        title: approved ? 'Kontribusi disetujui' : 'Kontribusi ditolak',
        body: approved
          ? 'Usulan Anda telah disetujui dan dipublikasikan.'
          : 'Usulan Anda ditolak. Buka Kontribusi Saya untuk melihat alasan.',
        actorId: cmd.actorId,
        data: {
          type: approved ? 'contribution_approved' : 'contribution_rejected',
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

  /**
   * Keputusan foto hanya pada approve usulan kata. Tolak seluruh kontribusi
   * mengabaikan peta (semua staging ikut dihapus).
   */
  private async rejectedWordImageIds(
    contrib: { entityType: string; entityId: string } | null,
    decisions: ImageReviewDecision[] | undefined,
  ): Promise<string[]> {
    if (!decisions?.length || !contrib) return [];
    if (contrib.entityType !== 'word') {
      throw new ValidationError([
        { field: 'image_decisions', message: 'Keputusan foto hanya berlaku untuk usulan kata' },
      ]);
    }

    const seen = new Set<string>();
    for (const [index, item] of decisions.entries()) {
      if (seen.has(item.imageId)) {
        throw new ValidationError([
          {
            field: `image_decisions.${index}.image_id`,
            message: 'Foto ini sudah ada di daftar keputusan',
          },
        ]);
      }
      seen.add(item.imageId);
    }

    const images = await this.wordRepo.listWordImages(contrib.entityId);
    const owned = new Set(images.map((img) => img.id));
    for (const [index, item] of decisions.entries()) {
      if (!owned.has(item.imageId)) {
        throw new ValidationError([
          {
            field: `image_decisions.${index}.image_id`,
            message: 'Foto tidak termasuk pada kata ini',
          },
        ]);
      }
    }

    return decisions.filter((item) => item.decision === 'reject').map((item) => item.imageId);
  }

  private async handleStagingImages(
    entityType: string,
    entityId: string,
    decision: 'approve' | 'reject',
    rejectedImageIds: readonly string[],
    censoredFiles: Record<string, CensoredImageFile>,
  ): Promise<void> {
    const withheld = new Set(rejectedImageIds);
    const stagingList =
      entityType === 'word_image'
        ? await this.stagingForWordImage(entityId)
        : entityType === 'word'
          ? await this.wordRepo.listStagingWordImages(entityId)
          : [];

    const softDeleteIds: string[] = [];

    for (const img of stagingList) {
      if (img.provider !== 'imagekit') continue;
      const staging = {
        id: img.id,
        url: img.url,
        provider: img.provider,
        providerFileId: img.providerFileId,
      };

      // Tolak seluruh kontribusi, atau foto ini ditahan saat setujui kata.
      if (decision === 'reject' || withheld.has(img.id)) {
        await deleteStagingWordImage(staging, this.imageStorage);
        if (decision === 'reject' && entityType === 'word_image') {
          softDeleteIds.push(img.id);
        }
        continue;
      }

      const censored = censoredFiles[img.id];
      const promoted = await promoteWordImageFromStaging(staging, this.publicImageStorage, {
        bytes: censored?.bytes,
        mimeType: censored?.mimeType,
      });
      await this.wordRepo.applyPromotedWordImage(img.id, promoted);
      await deleteStagingWordImage(staging, this.imageStorage);
    }

    if (softDeleteIds.length > 0) {
      await this.wordRepo.softDeleteWordImages(softDeleteIds);
    }
  }

  private async stagingForWordImage(imageId: string) {
    const img = await this.wordRepo.findWordImageById(imageId);
    if (!img || img.provider !== 'imagekit' || img.isVerified) return [];
    return [img];
  }
}
