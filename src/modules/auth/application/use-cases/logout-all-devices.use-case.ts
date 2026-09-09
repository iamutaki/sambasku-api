import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';

export class LogoutAllDevicesUseCase {
  constructor(private readonly refreshTokenRepo: RefreshTokenRepository) {}

  async execute(userId: string): Promise<void> {
    await this.refreshTokenRepo.revokeAllForUser(userId);
  }
}
