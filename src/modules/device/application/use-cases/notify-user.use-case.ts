import type { DeviceTokenRepository } from '../../domain/repositories/device-token.repository';
import type { PushSenderPort } from '../ports/push-sender.port';

export interface NotifyUserCommand {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

function log(level: 'info' | 'warn' | 'error', msg: string, obj: Record<string, unknown> = {}) {
  // console.* agar Workers Logs menangkap tanpa import logger→env (unit test aman).
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...obj });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
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
        log('warn', 'push skipped: FIREBASE_* belum dikonfigurasi (NoopPushSender)', {
          user_id: cmd.userId,
        });
        return;
      }

      const tokens = await this.deviceTokenRepo.listActiveFcmTokensByUserId(cmd.userId);
      if (tokens.length === 0) {
        log('warn', 'push skipped: tidak ada device_tokens aktif untuk user', {
          user_id: cmd.userId,
        });
        return;
      }

      const result = await this.pushSender.send(tokens, {
        title: cmd.title,
        body: cmd.body,
        data: cmd.data,
      });

      log('info', 'push fan-out done', {
        user_id: cmd.userId,
        success: result.success.length,
        failed: result.failed.length,
      });
    } catch (err) {
      log('error', 'push fan-out failed', {
        user_id: cmd.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
