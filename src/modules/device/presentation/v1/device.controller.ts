import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { RegisterDeviceTokenUseCase } from '../../application/use-cases/register-device-token.use-case';
import type { RevokeDeviceTokenUseCase } from '../../application/use-cases/revoke-device-token.use-case';
import type { RegisterDeviceTokenBody, RevokeDeviceTokenBody } from './validators/device.validator';

export class DeviceController {
  constructor(
    private readonly deps: {
      register: RegisterDeviceTokenUseCase;
      revoke: RevokeDeviceTokenUseCase;
    },
  ) {}

  async register(c: Context, body: RegisterDeviceTokenBody) {
    const user = this.requireUser(c);
    const result = await this.deps.register.execute({
      userId: user.user_id,
      udid: body.udid,
      fcmToken: body.fcm_token,
    });

    logger.info(
      { request_id: this.requestId(c), udid: result.udid },
      'device token registered',
    );

    return c.json({
      success: true as const,
      data: {
        udid: result.udid,
        // Echo supaya client/debug yakin FCM ikut tersimpan (bukan hanya udid).
        fcm_token_registered: true,
      },
    });
  }

  async revoke(c: Context, body: RevokeDeviceTokenBody) {
    const user = this.requireUser(c);
    const result = await this.deps.revoke.execute({
      userId: user.user_id,
      udid: body.udid,
    });

    logger.info(
      { request_id: this.requestId(c), udid: body.udid, revoked: result.revoked },
      'device token revoke attempted',
    );

    return c.json({
      success: true as const,
      data: { udid: body.udid, revoked: result.revoked },
    });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
