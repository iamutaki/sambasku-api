import { NotFoundError } from '@/shared/errors/app-error';
import type { NotificationRepository } from '../../domain/repositories/notification.repository';

export class MarkNotificationReadUseCase {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(userId: string, id: string): Promise<{ alreadyRead: boolean }> {
    const result = await this.notificationRepo.markRead(userId, id);
    if (result === 'not_found') {
      throw new NotFoundError(
        'NOTIFICATION_NOT_FOUND',
        'Notifikasi dengan id tersebut tidak ditemukan',
      );
    }
    return { alreadyRead: result === 'already_read' };
  }
}
