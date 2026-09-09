import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { hashToken } from '../utils/token';

export class LogoutUserUseCase {
  constructor(private readonly refreshTokenRepo: RefreshTokenRepository) {}

  // Idempoten: token sudah tidak ada / sudah revoked tetap dianggap sukses
  async execute(refreshToken: string): Promise<void> {
    await this.refreshTokenRepo.revokeByHash(hashToken(refreshToken));
  }
}
