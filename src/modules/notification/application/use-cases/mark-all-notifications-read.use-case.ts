import type { NotificationRepository } from '../../domain/repositories/notification.repository';

export class MarkAllNotificationsReadUseCase {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(userId: string): Promise<number> {
    return this.notificationRepo.markAllRead(userId);
  }
}
