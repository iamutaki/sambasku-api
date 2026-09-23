import type { DeviceTokenRepository } from '../../domain/repositories/device-token.repository';

export class RegisterDeviceTokenUseCase {
  constructor(private readonly deviceTokenRepo: DeviceTokenRepository) {}

  async execute(input: {
    userId: string;
    udid: string;
    fcmToken: string;
  }): Promise<{ id: string; udid: string }> {
    const record = await this.deviceTokenRepo.register(
      input.userId,
      input.udid,
      input.fcmToken,
    );
    return { id: record.id, udid: record.udid };
  }
}
