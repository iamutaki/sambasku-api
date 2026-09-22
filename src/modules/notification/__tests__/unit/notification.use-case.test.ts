import { describe, it, expect, vi } from 'vitest';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import { RecordInboxNotificationUseCase } from '../../application/use-cases/record-inbox-notification.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import type { NotificationRepository } from '../../domain/repositories/notification.repository';

function repo(overrides: Partial<NotificationRepository> = {}): NotificationRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    upsertUnread: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    ...overrides,
  };
}

describe('RecordInboxNotificationUseCase', () => {
  it('menulis inbox dengan copy type', async () => {
    const notificationRepo = repo();
    const useCase = new RecordInboxNotificationUseCase(notificationRepo);
    await useCase.execute({
      userId: '01CONTRIBUTORULID0000000000',
      type: 'contribution_rejected',
      targetKind: 'contribution',
      targetId: '01CONTRIBULID0000000000000',
    });
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '01CONTRIBUTORULID0000000000',
        type: 'contribution_rejected',
        title: 'Usulan ditolak',
        targetKind: 'contribution',
        targetId: '01CONTRIBULID0000000000000',
      }),
    );
  });

  it('skip user anonim', async () => {
    const notificationRepo = repo();
    const useCase = new RecordInboxNotificationUseCase(notificationRepo);
    await useCase.execute({
      userId: ANONIM_USER_ID,
      type: 'contribution_approved',
      targetKind: 'contribution',
      targetId: '01CONTRIBULID0000000000000',
    });
    expect(notificationRepo.create).not.toHaveBeenCalled();
  });

  it('gagal insert tidak throw', async () => {
    const notificationRepo = repo({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const useCase = new RecordInboxNotificationUseCase(notificationRepo);
    await expect(
      useCase.execute({
        userId: '01CONTRIBUTORULID0000000000',
        type: 'contribution_approved',
        targetKind: 'contribution',
        targetId: '01CONTRIBULID0000000000000',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('MarkNotificationReadUseCase', () => {
  it('not_found → NOTIFICATION_NOT_FOUND', async () => {
    const notificationRepo = repo({ markRead: vi.fn().mockResolvedValue('not_found') });
    const useCase = new MarkNotificationReadUseCase(notificationRepo);
    await expect(useCase.execute('01USER', '01NOTIF00000000000000000000')).rejects.toMatchObject({
      errorCode: 'NOTIFICATION_NOT_FOUND',
    });
  });

  it('already_read → alreadyRead true', async () => {
    const notificationRepo = repo({ markRead: vi.fn().mockResolvedValue('already_read') });
    const useCase = new MarkNotificationReadUseCase(notificationRepo);
    await expect(useCase.execute('01USER', '01NOTIF00000000000000000000')).resolves.toEqual({
      alreadyRead: true,
    });
  });
});
