import { describe, it, expect, vi } from 'vitest';
import { RefreshTokenUseCase, REFRESH_ROTATION_GRACE_MS } from '../../application/use-cases/refresh-token.use-case';
import type { RefreshTokenRecord, RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { TokenServicePort } from '../../application/ports/token-service.port';
import type { User } from '../../domain/entities/user.entity';

const USER_ID = '01TESTULIDUSERID00000000';

function user(): User {
  return {
    id: USER_ID,
    username: 'budi',
    displayName: 'budi',
    bio: null,
    email: 'budi@test.com',
    phone: null,
    passwordHash: 'hash',
    role: 'contributor',
    isActive: true,
    canContribute: true,
    emailVerified: true,
    avatarUrl: null,
    avatarProvider: null,
    avatarProviderFileId: null,
    avatarSha: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };
}

function record(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    id: '01TESTULIDTOKENID00000000',
    userId: USER_ID,
    tokenHash: 'hash',
    isRevoked: false,
    rotatedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function make(found: RefreshTokenRecord | null, markRotated = true) {
  const refreshTokenRepo = {
    create: vi.fn().mockResolvedValue({}),
    findByHash: vi.fn().mockResolvedValue(found),
    markRotated: vi.fn().mockResolvedValue(markRotated),
    revokeByHash: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as unknown as RefreshTokenRepository;
  const userRepo = {
    findById: vi.fn().mockResolvedValue(found ? user() : null),
  } as unknown as UserRepository;
  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('access-baru'),
  } as unknown as TokenServicePort;
  const useCase = new RefreshTokenUseCase(refreshTokenRepo, userRepo, tokenService, 900, 2592000);
  return { useCase, refreshTokenRepo };
}

describe('RefreshTokenUseCase', () => {
  it('merotasi token yang masih aktif', async () => {
    const { useCase, refreshTokenRepo } = make(record());
    const result = await useCase.execute('token-lama');
    expect(result.accessToken).toBe('access-baru');
    expect(result.refreshToken).toHaveLength(96);
    expect(refreshTokenRepo.markRotated).toHaveBeenCalledOnce();
    expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
  });

  it('token yang baru dirotasi masih bisa refresh dalam jendela grace', async () => {
    const { useCase, refreshTokenRepo } = make(
      record({ isRevoked: true, rotatedAt: new Date() }),
    );
    const result = await useCase.execute('token-lama');
    expect(result.accessToken).toBe('access-baru');
    expect(refreshTokenRepo.markRotated).not.toHaveBeenCalled();
    expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
  });

  it('token yang dirotasi lewat dari grace ditolak', async () => {
    const { useCase } = make(
      record({
        isRevoked: true,
        rotatedAt: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS - 1),
      }),
    );
    await expect(useCase.execute('token-lama')).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  });

  it('logout mengosongkan rotatedAt sehingga grace tidak berlaku', async () => {
    const { useCase, refreshTokenRepo } = make(record({ isRevoked: true, rotatedAt: null }));
    await expect(useCase.execute('token-lama')).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
    expect(refreshTokenRepo.create).not.toHaveBeenCalled();
  });

  it('kalah race rotasi tetap menerbitkan token baru bila masih dalam grace', async () => {
    const rotated = record({ isRevoked: true, rotatedAt: new Date() });
    const { useCase, refreshTokenRepo } = make(record(), false);
    vi.mocked(refreshTokenRepo.findByHash)
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(rotated);
    const result = await useCase.execute('token-lama');
    expect(result.refreshToken).toHaveLength(96);
    expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
  });
});
