import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { InboxNotificationType, NotificationTargetKind } from '../../domain/entities/notification.entity';
import { inboxCopyFor } from '../../domain/entities/notification.entity';
import type { NotificationRepository } from '../../domain/repositories/notification.repository';

export interface RecordInboxNotificationCommand {
  userId: string;
  type: InboxNotificationType;
  targetKind: NotificationTargetKind;
  targetId: string;
}

function logError(obj: Record<string, unknown>, msg: string) {
  console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), msg, ...obj }));
}

// Tulis baris inbox setelah keputusan review. Best-effort: gagal insert
// tidak menggagalkan approve/reject (preseden NotifyUserUseCase / FCM).
// Anonim tidak punya inbox (submit tanpa akun).
export class RecordInboxNotificationUseCase {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(cmd: RecordInboxNotificationCommand): Promise<void> {
    if (!cmd.userId || cmd.userId === ANONIM_USER_ID) return;

    const copy = inboxCopyFor(cmd.type);
    try {
      await this.notificationRepo.create({
        userId: cmd.userId,
        type: cmd.type,
        title: copy.title,
        body: copy.body,
        targetKind: cmd.targetKind,
        targetId: cmd.targetId,
      });
    } catch (err) {
      logError(
        {
          user_id: cmd.userId,
          type: cmd.type,
          target_id: cmd.targetId,
          error: err instanceof Error ? err.message : String(err),
        },
        'inbox notification insert failed',
      );
    }
  }
}

