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
    if (!record || record.isRevoked || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
    }

    const user = await this.userRepo.findById(record.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
    }

    // Rotasi: revoke yang lama, buat yang baru — cegah replay attack
    await this.refreshTokenRepo.revokeByHash(record.tokenHash);
    const { token, tokenHash } = generateToken();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    });

    const accessToken = await this.tokenService.generateAccessToken({
      user_id: user.id,
      role: user.role,
    });

    return { accessToken, expiresIn: this.accessTokenTtlSeconds, refreshToken: token };
  }
}
