import { ForbiddenError, UnauthorizedError } from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../ports/token-service.port';
import { generateToken, hashToken } from '../utils/token';
import type { ApiClientRepository } from '@/modules/developer-oauth/domain/repositories/api-client.repository';
import { FIRST_PARTY_SCOPE_STRING } from '@/modules/developer-oauth/domain/entities/api-client.entity';

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
    private readonly apiClients?: ApiClientRepository,
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

    const clientClaims = await this.resolveClientClaims(record.clientId);

    if (record.isRevoked) {
      if (!withinRotationGrace(record.rotatedAt)) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
      }
      return this.issue(user.id, user.role, user.username, clientClaims);
    }

    const rotated = await this.refreshTokenRepo.markRotated(record.tokenHash);
    if (!rotated) {
      const again = await this.refreshTokenRepo.findByHash(record.tokenHash);
      if (!again || !withinRotationGrace(again.rotatedAt)) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak valid');
      }
    }

    return this.issue(user.id, user.role, user.username, clientClaims);
  }

  private async resolveClientClaims(
    clientId: string | null,
  ): Promise<{ clientId: string | null; scopes: string | null }> {
    if (!clientId) {
      // Token legacy tanpa client_id - biarkan JWT tanpa azp (OAUTH_REQUIRE_AZP=false)
      return { clientId: null, scopes: null };
    }
    if (!this.apiClients) {
      return { clientId, scopes: FIRST_PARTY_SCOPE_STRING };
    }
    const client = await this.apiClients.findByClientId(clientId);
    if (!client || client.status !== 'approved') {
      throw new ForbiddenError(
        'CLIENT_NOT_ALLOWED',
        'Sesi dari aplikasi tidak diizinkan. Silakan keluar dan masuk lagi.',
      );
    }
    const scopes =
      client.allowedScopes.length > 0
        ? client.allowedScopes.join(' ')
        : FIRST_PARTY_SCOPE_STRING;
    return { clientId: client.clientId, scopes };
  }

  private async issue(
    userId: string,
    role: string,
    username: string,
    client: { clientId: string | null; scopes: string | null },
  ): Promise<RefreshResult> {
    const { token, tokenHash } = generateToken();
    await this.refreshTokenRepo.create({
      userId,
      tokenHash,
      clientId: client.clientId,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    });

    const accessToken = await this.tokenService.generateAccessToken({
      user_id: userId,
      role,
      username,
      ...(client.clientId ? { azp: client.clientId } : {}),
      ...(client.scopes ? { scope: client.scopes } : {}),
    });

    return { accessToken, expiresIn: this.accessTokenTtlSeconds, refreshToken: token };
  }
}

function withinRotationGrace(rotatedAt: Date | null): boolean {
  if (!rotatedAt) return false;
  return Date.now() - rotatedAt.getTime() < REFRESH_ROTATION_GRACE_MS;
}
