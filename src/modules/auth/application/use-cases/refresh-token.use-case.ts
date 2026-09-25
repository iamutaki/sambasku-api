import { UnauthorizedError } from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../ports/token-service.port';
import { generateToken, hashToken } from '../utils/token';

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string; // token baru hasil rotasi
}

/**
 * Token yang baru dirotasi masih boleh dipakai sebentar. Respons refresh
 * sering hilang (timeout, pindah tier, dua tab). Tanpa jendela ini klien
 * mengulang token lama, dapat 401, dan user terlihat logout.
 */
export const REFRESH_ROTATION_GRACE_MS = 60_000;

export class RefreshTokenUseCase {
  constructor(
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenServicePort,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async execute(refreshToken: string): Promise<RefreshResult> {
    const record = await this.refreshTokenRepo.findByHash(hashToken(refreshToken));
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
    }

    const user = await this.userRepo.findById(record.userId);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
    }

    if (record.isRevoked) {
      if (!withinRotationGrace(record.rotatedAt)) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
      }
      return this.issue(user.id, user.role, user.username);
    }

    const rotated = await this.refreshTokenRepo.markRotated(record.tokenHash);
    if (!rotated) {
      const again = await this.refreshTokenRepo.findByHash(record.tokenHash);
      if (!again || !withinRotationGrace(again.rotatedAt)) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
      }
    }

    return this.issue(user.id, user.role, user.username);
  }

  private async issue(userId: string, role: string, username: string): Promise<RefreshResult> {
    const { token, tokenHash } = generateToken();
    await this.refreshTokenRepo.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    });

    const accessToken = await this.tokenService.generateAccessToken({
      user_id: userId,
      role,
      username,
    });

    return { accessToken, expiresIn: this.accessTokenTtlSeconds, refreshToken: token };
  }
}

function withinRotationGrace(rotatedAt: Date | null): boolean {
  if (!rotatedAt) return false;
  return Date.now() - rotatedAt.getTime() < REFRESH_ROTATION_GRACE_MS;
}
