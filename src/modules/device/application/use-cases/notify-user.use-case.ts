import type { DeviceTokenRepository } from '../../domain/repositories/device-token.repository';
import type { PushSenderPort } from '../ports/push-sender.port';

export interface NotifyUserCommand {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Fan-out FCM ke semua device aktif user. Best-effort (tidak throw). */
export class NotifyUserUseCase {
  constructor(
    private readonly deviceTokenRepo: DeviceTokenRepository,
    private readonly pushSender: PushSenderPort,
  ) {}

  async execute(cmd: NotifyUserCommand): Promise<void> {
    try {
      if (!this.pushSender.isConfigured) {
        return;
      }

      const tokens = await this.deviceTokenRepo.listActiveFcmTokensByUserId(cmd.userId);
      if (tokens.length === 0) {
        return;
      }

      await this.pushSender.send(tokens, {
        title: cmd.title,
        body: cmd.body,
        data: cmd.data,
      });
    } catch {
      // Best-effort: jangan gagalkan approve/review karena push.
    }
  }
}
