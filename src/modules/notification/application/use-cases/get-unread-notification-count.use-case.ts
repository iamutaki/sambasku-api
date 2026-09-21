import type { NotificationRepository } from '../../domain/repositories/notification.repository';

export class GetUnreadNotificationCountUseCase {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(userId: string): Promise<number> {
    return this.notificationRepo.countUnread(userId);
  }
}
