import type { LoginMeta } from '../dto/login.dto';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../ports/token-service.port';
import { generateToken } from './token';

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string; // plain - di-hash hanya saat disimpan
  user: { id: string; username: string; role: string; avatarUrl: string | null };
}

export async function issueLoginSession(
  user: { id: string; username: string; role: string; avatarUrl?: string | null },
  deps: {
    tokenService: TokenServicePort;
    refreshTokenRepo: RefreshTokenRepository;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  },
  meta: LoginMeta = {},
): Promise<LoginResult> {
  const accessToken = await deps.tokenService.generateAccessToken({
    user_id: user.id,
    role: user.role,
    username: user.username,
    ...(meta.clientId ? { azp: meta.clientId } : {}),
    ...(meta.scopes ? { scope: meta.scopes } : {}),
  });

  const { token, tokenHash } = generateToken();
  await deps.refreshTokenRepo.create({
    userId: user.id,
    tokenHash,
    clientId: meta.clientId ?? null,
    deviceInfo: meta.deviceInfo ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt: new Date(Date.now() + deps.refreshTokenTtlSeconds * 1000),
  });

  return {
    accessToken,
    expiresIn: deps.accessTokenTtlSeconds,
    refreshToken: token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
    },
  };
}
