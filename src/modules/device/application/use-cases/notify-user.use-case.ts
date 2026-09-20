import { logger } from '@/shared/logging/logger';
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
        logger.debug({ user_id: cmd.userId }, 'push skipped: firebase not configured');
        return;
      }

      const tokens = await this.deviceTokenRepo.listActiveFcmTokensByUserId(cmd.userId);
      if (tokens.length === 0) {
        logger.debug({ user_id: cmd.userId }, 'push skipped: no active device tokens');
        return;
      }

      const result = await this.pushSender.send(tokens, {
        title: cmd.title,
        body: cmd.body,
        data: cmd.data,
      });

      logger.info(
        {
          user_id: cmd.userId,
          success: result.success.length,
          failed: result.failed.length,
        },
        'push fan-out done',
      );
    } catch (err) {
      logger.error({ err, user_id: cmd.userId }, 'push fan-out failed');
    }
  }
}
