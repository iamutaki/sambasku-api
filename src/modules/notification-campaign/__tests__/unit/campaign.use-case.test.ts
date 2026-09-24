import { describe, expect, it, vi } from 'vitest';
import {
  CreateCampaignDraftUseCase,
  ProcessCampaignDeliveryUseCase,
  SendCampaignUseCase,
} from '../../application/use-cases/campaign.use-cases';
import type { NotificationCampaignRepository } from '../../domain/repositories/notification-campaign.repository';
import type { NotificationCampaign } from '../../domain/entities/campaign.entity';
import type { NotificationRepository } from '@/modules/notification/domain/repositories/notification.repository';
import type { DeviceTokenRepository } from '@/modules/device/domain/repositories/device-token.repository';
import type { PushSenderPort } from '@/modules/device/application/ports/push-sender.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

function campaign(partial: Partial<NotificationCampaign> = {}): NotificationCampaign {
  return {
    id: '01CAMPAIGN0000000000000001',
    templateId: null,
    title: 'Hallo',
    body: 'Isi pengumuman',
    deepLinkKind: 'none',
    deepLinkValue: null,
    audienceType: 'selected',
    status: 'draft',
    sendAt: null,
    targetedUsers: 1,
    pushSuccess: 0,
    pushFailed: 0,
    inboxWritten: 0,
    inboxCursor: null,
    topicSent: false,
    lastError: null,
    createdBy: '01USER00000000000000000001',
    createdAt: new Date(),
    updatedAt: null,
    ...partial,
  };
}

describe('CreateCampaignDraftUseCase', () => {
  it('rejects selected without user_ids', async () => {
    const repo = {
      findTemplateById: vi.fn(),
      createCampaign: vi.fn(),
    } as unknown as NotificationCampaignRepository;
    const uc = new CreateCampaignDraftUseCase(repo);
    await expect(
      uc.execute({
        title: 'A',
        body: 'B',
        audienceType: 'selected',
        userIds: [],
        createdBy: '01USER00000000000000000001',
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('creates draft and inserts recipients', async () => {
    const created = campaign();
    const repo = {
      findTemplateById: vi.fn(),
      createCampaign: vi.fn().mockResolvedValue(created),
      insertRecipients: vi.fn().mockResolvedValue(2),
      setTargetedUsers: vi.fn(),
      findCampaignById: vi.fn().mockResolvedValue({ ...created, targetedUsers: 2 }),
    } as unknown as NotificationCampaignRepository;
    const uc = new CreateCampaignDraftUseCase(repo);
    const result = await uc.execute({
      title: 'A',
      body: 'B',
      audienceType: 'selected',
      userIds: ['01USER00000000000000000002', '01USER00000000000000000003'],
      createdBy: '01USER00000000000000000001',
    });
    expect(repo.insertRecipients).toHaveBeenCalled();
    expect(result?.targetedUsers).toBe(2);
  });
});

describe('ProcessCampaignDeliveryUseCase selected', () => {
  it('sends inbox + push per recipient then completes', async () => {
    const c = campaign({ status: 'sending', audienceType: 'selected' });
    const repo = {
      findCampaignById: vi
        .fn()
        .mockResolvedValueOnce(c)
        .mockResolvedValue({ ...c, status: 'completed' }),
      listPendingRecipients: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: '01REC000000000000000000001',
            campaignId: c.id,
            userId: '01USER00000000000000000002',
            status: 'pending',
            error: null,
            createdAt: new Date(),
            updatedAt: null,
          },
        ])
        .mockResolvedValueOnce([]),
      updateRecipientStatus: vi.fn(),
      incrementCampaignStats: vi.fn(),
      updateCampaignStatus: vi.fn(),
      countRecipientsByStatus: vi.fn().mockResolvedValue({
        pending: 0,
        sent: 1,
        failed: 0,
        skipped_no_token: 0,
      }),
    } as unknown as NotificationCampaignRepository;

    const notificationRepo = {
      create: vi.fn(),
      createMany: vi.fn(),
    } as unknown as NotificationRepository;

    const deviceTokenRepo = {
      listActiveFcmTokensByUserId: vi.fn().mockResolvedValue(['token-a']),
    } as unknown as DeviceTokenRepository;

    const pushSender: PushSenderPort = {
      isConfigured: true,
      send: vi.fn().mockResolvedValue({ success: ['token-a'], failed: [] }),
      sendToTopic: vi.fn(),
    };

    const uc = new ProcessCampaignDeliveryUseCase(
      repo,
      notificationRepo,
      deviceTokenRepo,
      pushSender,
    );
    const result = await uc.execute({ campaignId: c.id });
    expect(notificationRepo.create).toHaveBeenCalled();
    expect(pushSender.send).toHaveBeenCalled();
    expect(result.done).toBe(true);
  });
});

describe('SendCampaignUseCase schedule', () => {
  it('sets scheduled when send_at is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const c = campaign({ sendAt: future });
    const repo = {
      findCampaignById: vi.fn().mockResolvedValue(c),
      updateCampaignStatus: vi.fn(),
    } as unknown as NotificationCampaignRepository;
    const audit = { record: vi.fn() } as unknown as AuditLogRepository;
    const processDelivery = {
      execute: vi.fn(),
    } as unknown as ProcessCampaignDeliveryUseCase;

    const uc = new SendCampaignUseCase(repo, audit, processDelivery);
    await uc.execute({
      id: c.id,
      actorId: '01USER00000000000000000001',
    });
    expect(repo.updateCampaignStatus).toHaveBeenCalledWith(c.id, 'scheduled', {
      sendAt: future,
    });
    expect(processDelivery.execute).not.toHaveBeenCalled();
  });
});
