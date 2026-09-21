import type {
  NotificationListOptions,
  NotificationListResult,
  NotificationRepository,
} from '../../domain/repositories/notification.repository';

export class ListMyNotificationsUseCase {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(userId: string, opts: NotificationListOptions): Promise<NotificationListResult> {
    return this.notificationRepo.listByUser(userId, opts);
  }
}
