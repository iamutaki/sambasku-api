import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { DeviceTokenRepository } from '@/modules/device/domain/repositories/device-token.repository';

export class LogoutAllDevicesUseCase {
  constructor(
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly deviceTokenRepo?: DeviceTokenRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.refreshTokenRepo.revokeAllForUser(userId);
    // Soft-delete semua FCM token aktif - device lain tidak boleh terima push
    // setelah sesi di semua perangkat dicabut.
    if (this.deviceTokenRepo) {
      await this.deviceTokenRepo.revokeAllForUser(userId);
    }
  }
}
