import { BadRequestError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { NotificationRepository } from '@/modules/notification/domain/repositories/notification.repository';
import type { DeviceTokenRepository } from '@/modules/device/domain/repositories/device-token.repository';
import type { PushSenderPort } from '@/modules/device/application/ports/push-sender.port';
import {
  buildCampaignPushData,
  CAMPAIGN_CHUNK_SIZE,
  CAMPAIGN_FCM_TOPIC,
  CAMPAIGN_MAX_CHUNKS_PER_RUN,
  type CampaignAudienceType,
  type DeepLinkKind,
  type NotificationCampaign,
} from '../../domain/entities/campaign.entity';
import type { NotificationCampaignRepository } from '../../domain/repositories/notification-campaign.repository';

function assertDeepLink(kind: DeepLinkKind, value: string | null | undefined) {
  if (kind === 'none') return;
  if (!value?.trim()) {
    throw new BadRequestError('VALIDATION_ERROR', 'Deep link wajib diisi untuk jenis yang dipilih', [
      { field: 'deep_link_value', message: 'Isi target deep link' },
    ]);
  }
}

export class CreateCampaignDraftUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(input: {
    templateId?: string | null;
    title?: string;
    body?: string;
    deepLinkKind?: DeepLinkKind;
    deepLinkValue?: string | null;
    audienceType: CampaignAudienceType;
    userIds?: string[];
    sendAt?: Date | null;
    createdBy: string;
  }) {
    let title = input.title?.trim() ?? '';
    let body = input.body?.trim() ?? '';
    let deepLinkKind: DeepLinkKind = input.deepLinkKind ?? 'none';
    let deepLinkValue = input.deepLinkValue?.trim() || null;
    let templateId: string | null = input.templateId ?? null;

    if (templateId) {
      const template = await this.repo.findTemplateById(templateId);
      if (!template) {
        throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan');
      }
      if (!title) title = template.title;
      if (!body) body = template.body;
      if (!input.deepLinkKind) deepLinkKind = template.deepLinkKind;
      if (input.deepLinkValue === undefined) deepLinkValue = template.deepLinkValue;
    }

    if (!title || !body) {
      throw new BadRequestError('VALIDATION_ERROR', 'Judul dan isi wajib diisi', [
        ...(!title ? [{ field: 'title', message: 'Judul wajib diisi' }] : []),
        ...(!body ? [{ field: 'body', message: 'Isi wajib diisi' }] : []),
      ]);
    }
    assertDeepLink(deepLinkKind, deepLinkValue);

    if (input.audienceType === 'selected') {
      const ids = [...new Set((input.userIds ?? []).filter(Boolean))];
      if (ids.length === 0) {
        throw new BadRequestError('VALIDATION_ERROR', 'Pilih minimal satu pengguna', [
          { field: 'user_ids', message: 'Pilih minimal satu pengguna' },
        ]);
      }
    }

    const campaign = await this.repo.createCampaign({
      templateId,
      title,
      body,
      deepLinkKind,
      deepLinkValue,
      audienceType: input.audienceType,
      sendAt: input.sendAt ?? null,
      createdBy: input.createdBy,
    });

    if (input.audienceType === 'selected' && input.userIds?.length) {
      const unique = [...new Set(input.userIds.filter(Boolean))];
      await this.repo.insertRecipients(campaign.id, unique);
      await this.repo.setTargetedUsers(campaign.id, unique.length);
    } else if (input.audienceType === 'all') {
      const count = await this.repo.countUsersWithActiveDevices();
      await this.repo.setTargetedUsers(campaign.id, count);
    }

    return this.repo.findCampaignById(campaign.id);
  }
}

export class ListCampaignsUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(opts: { limit: number; cursor?: string; status?: NotificationCampaign['status'] }) {
    return this.repo.listCampaigns(opts);
  }
}

export class GetCampaignDetailUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(id: string) {
    const campaign = await this.repo.findCampaignById(id);
    if (!campaign) {
      throw new NotFoundError('CAMPAIGN_NOT_FOUND', 'Campaign tidak ditemukan');
    }
    const recipientCounts =
      campaign.audienceType === 'selected'
        ? await this.repo.countRecipientsByStatus(id)
        : null;
    const failures = await this.repo.listFailedRecipients(id, 20);
    return { campaign, recipientCounts, failures };
  }
}

export class CancelCampaignUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: { id: string; actorId: string; requestId?: string | null }) {
    const campaign = await this.repo.findCampaignById(input.id);
    if (!campaign) {
      throw new NotFoundError('CAMPAIGN_NOT_FOUND', 'Campaign tidak ditemukan');
    }
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestError(
        'CAMPAIGN_NOT_CANCELLABLE',
        'Hanya draft atau terjadwal yang bisa dibatalkan',
      );
    }
    await this.repo.updateCampaignStatus(input.id, 'cancelled');
    await this.auditRepo.record({
      userId: input.actorId,
      action: 'cancel',
      entityType: 'notification_campaign',
      entityId: input.id,
      oldData: { status: campaign.status },
      newData: { status: 'cancelled' },
      requestId: input.requestId ?? null,
    });
    return this.repo.findCampaignById(input.id);
  }
}

export class SendCampaignUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly processDelivery: ProcessCampaignDeliveryUseCase,
  ) {}

  async execute(input: {
    id: string;
    actorId: string;
    requestId?: string | null;
    /** Jika true, proses chunk pertama sekarang. */
    processNow?: boolean;
  }) {
    const campaign = await this.repo.findCampaignById(input.id);
    if (!campaign) {
      throw new NotFoundError('CAMPAIGN_NOT_FOUND', 'Campaign tidak ditemukan');
    }
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestError(
        'CAMPAIGN_NOT_SENDABLE',
        'Campaign ini tidak bisa dikirim dari status saat ini',
      );
    }

    const sendAt = campaign.sendAt;
    const now = new Date();
    if (sendAt && sendAt.getTime() > now.getTime()) {
      await this.repo.updateCampaignStatus(input.id, 'scheduled', { sendAt });
      await this.auditRepo.record({
        userId: input.actorId,
        action: 'schedule',
        entityType: 'notification_campaign',
        entityId: input.id,
        newData: { send_at: sendAt.toISOString(), audience: campaign.audienceType },
        requestId: input.requestId ?? null,
      });
      return this.repo.findCampaignById(input.id);
    }

    await this.repo.updateCampaignStatus(input.id, 'sending', { lastError: null });
    await this.auditRepo.record({
      userId: input.actorId,
      action: 'send',
      entityType: 'notification_campaign',
      entityId: input.id,
      newData: { audience: campaign.audienceType, targeted: campaign.targetedUsers },
      requestId: input.requestId ?? null,
    });

    if (input.processNow !== false) {
      await this.processDelivery.execute({ campaignId: input.id });
    }
    return this.repo.findCampaignById(input.id);
  }
}

export class RetryFailedCampaignRecipientsUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly processDelivery: ProcessCampaignDeliveryUseCase,
  ) {}

  async execute(input: { id: string }) {
    const campaign = await this.repo.findCampaignById(input.id);
    if (!campaign) {
      throw new NotFoundError('CAMPAIGN_NOT_FOUND', 'Campaign tidak ditemukan');
    }
    if (campaign.audienceType !== 'selected') {
      throw new BadRequestError(
        'RETRY_NOT_SUPPORTED',
        'Retry hanya untuk audience pengguna terpilih',
      );
    }
    if (campaign.status !== 'completed' && campaign.status !== 'failed') {
      throw new BadRequestError(
        'CAMPAIGN_NOT_RETRYABLE',
        'Retry hanya setelah campaign selesai atau gagal',
      );
    }
    const reset = await this.repo.resetFailedToPending(input.id);
    if (reset === 0) {
      throw new BadRequestError('NO_FAILED_RECIPIENTS', 'Tidak ada penerima gagal untuk diulang');
    }
    await this.repo.updateCampaignStatus(input.id, 'sending', { lastError: null });
    await this.processDelivery.execute({ campaignId: input.id });
    return this.repo.findCampaignById(input.id);
  }
}

/**
 * Proses pengiriman satu campaign (chunked). Dipanggil dari send + cron.
 */
export class ProcessCampaignDeliveryUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly notificationRepo: NotificationRepository,
    private readonly deviceTokenRepo: DeviceTokenRepository,
    private readonly pushSender: PushSenderPort,
  ) {}

  async execute(input: { campaignId: string }): Promise<{ done: boolean }> {
    const campaign = await this.repo.findCampaignById(input.campaignId);
    if (!campaign) return { done: true };
    if (campaign.status === 'scheduled') {
      await this.repo.updateCampaignStatus(campaign.id, 'sending', { lastError: null });
    }
    if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
      return { done: true };
    }

    try {
      if (campaign.audienceType === 'all') {
        return await this.processAllAudience(campaign);
      }
      return await this.processSelectedAudience(campaign);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.updateCampaignStatus(campaign.id, 'failed', { lastError: message });
      return { done: true };
    }
  }

  private async processAllAudience(campaign: NotificationCampaign): Promise<{ done: boolean }> {
    let current = campaign;

    if (!current.topicSent) {
      const ok = await this.pushSender.sendToTopic(CAMPAIGN_FCM_TOPIC, {
        title: current.title,
        body: current.body,
        data: buildCampaignPushData(current),
      });
      if (!ok && this.pushSender.isConfigured) {
        await this.repo.updateCampaignStatus(current.id, 'failed', {
          lastError: 'Gagal mengirim FCM topic',
        });
        return { done: true };
      }
      // No-op sender: tetap lanjut tulis inbox (dev lokal).
      await this.repo.updateCampaignStatus(current.id, 'sending', {
        topicSent: true,
        lastError: null,
      });
      if (ok || !this.pushSender.isConfigured) {
        await this.repo.incrementCampaignStats(current.id, {
          pushSuccess: ok ? 1 : 0,
          pushFailed: ok || !this.pushSender.isConfigured ? 0 : 1,
        });
      }
      current = (await this.repo.findCampaignById(current.id))!;
    }

    for (let i = 0; i < CAMPAIGN_MAX_CHUNKS_PER_RUN; i++) {
      const { userIds, nextCursor } = await this.repo.listActiveDeviceUserIds({
        limit: CAMPAIGN_CHUNK_SIZE,
        cursor: current.inboxCursor,
      });
      if (userIds.length === 0) {
        await this.repo.updateCampaignStatus(current.id, 'completed', {
          inboxCursor: null,
          lastError: null,
        });
        return { done: true };
      }

      const written = await this.notificationRepo.createMany(
        userIds.map((userId) => ({
          userId,
          type: 'campaign' as const,
          title: current.title,
          body: current.body,
          targetKind: 'campaign' as const,
          targetId: current.id,
        })),
      );
      await this.repo.incrementCampaignStats(current.id, { inboxWritten: written });
      await this.repo.updateCampaignStatus(current.id, 'sending', {
        inboxCursor: nextCursor,
      });
      current = (await this.repo.findCampaignById(current.id))!;

      if (!nextCursor) {
        await this.repo.updateCampaignStatus(current.id, 'completed', {
          inboxCursor: null,
          lastError: null,
        });
        return { done: true };
      }
    }
    return { done: false };
  }

  private async processSelectedAudience(
    campaign: NotificationCampaign,
  ): Promise<{ done: boolean }> {
    for (let i = 0; i < CAMPAIGN_MAX_CHUNKS_PER_RUN; i++) {
      const pending = await this.repo.listPendingRecipients(campaign.id, CAMPAIGN_CHUNK_SIZE);
      if (pending.length === 0) {
        await this.repo.updateCampaignStatus(campaign.id, 'completed', { lastError: null });
        return { done: true };
      }

      for (const recipient of pending) {
        const tokens = await this.deviceTokenRepo.listActiveFcmTokensByUserId(recipient.userId);
        if (tokens.length === 0) {
          await this.repo.updateRecipientStatus(recipient.id, 'skipped_no_token', 'Tidak ada device');
          await this.repo.incrementCampaignStats(campaign.id, { pushFailed: 1 });
          continue;
        }

        try {
          await this.notificationRepo.create({
            userId: recipient.userId,
            type: 'campaign',
            title: campaign.title,
            body: campaign.body,
            targetKind: 'campaign',
            targetId: campaign.id,
          });
          await this.repo.incrementCampaignStats(campaign.id, { inboxWritten: 1 });

          const result = await this.pushSender.send(tokens, {
            title: campaign.title,
            body: campaign.body,
            data: buildCampaignPushData(campaign),
          });
          if (result.success.length > 0) {
            await this.repo.updateRecipientStatus(recipient.id, 'sent');
            await this.repo.incrementCampaignStats(campaign.id, {
              pushSuccess: result.success.length,
              pushFailed: result.failed.length,
            });
          } else {
            await this.repo.updateRecipientStatus(recipient.id, 'failed', 'Semua token gagal');
            await this.repo.incrementCampaignStats(campaign.id, {
              pushFailed: result.failed.length || 1,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.repo.updateRecipientStatus(recipient.id, 'failed', message);
          await this.repo.incrementCampaignStats(campaign.id, { pushFailed: 1 });
        }
      }
    }

    const counts = await this.repo.countRecipientsByStatus(campaign.id);
    if (counts.pending === 0) {
      await this.repo.updateCampaignStatus(campaign.id, 'completed', { lastError: null });
      return { done: true };
    }
    return { done: false };
  }
}

/** Dipanggil cron Workers: claim scheduled due + lanjutkan sending. */
export class ProcessDueCampaignsUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly processDelivery: ProcessCampaignDeliveryUseCase,
  ) {}

  async execute(limit = 3): Promise<{ processed: number }> {
    const due = await this.repo.listDueCampaigns(limit);
    let processed = 0;
    for (const campaign of due) {
      await this.processDelivery.execute({ campaignId: campaign.id });
      processed += 1;
    }
    return { processed };
  }
}

export class EstimateCampaignAudienceUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(input: { audienceType: CampaignAudienceType; userIds?: string[] }) {
    if (input.audienceType === 'all') {
      const users = await this.repo.countUsersWithActiveDevices();
      return { users_with_device: users, devices: users };
    }
    const ids = [...new Set((input.userIds ?? []).filter(Boolean))];
    const devices = await this.repo.countActiveDevicesForUsers(ids);
    return { users_with_device: ids.length, devices };
  }
}
