import type { DeviceTokenRepository } from '../../domain/repositories/device-token.repository';

export class RevokeDeviceTokenUseCase {
  constructor(private readonly deviceTokenRepo: DeviceTokenRepository) {}

  async execute(input: { userId: string; udid: string }): Promise<{ revoked: boolean }> {
    const revoked = await this.deviceTokenRepo.revoke(input.userId, input.udid);
    return { revoked };
  }
}
