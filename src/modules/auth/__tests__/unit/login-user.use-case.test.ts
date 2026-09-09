import { describe, it, expect, vi } from 'vitest';
import { LoginUserUseCase } from '../../application/use-cases/login-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { TokenServicePort } from '../../application/ports/token-service.port';
import type { User } from '../../domain/entities/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '01TESTULIDUSERID00000000',
    username: 'budi',
    email: 'budi@test.com',
    passwordHash: 'argon2id$hash',
    role: 'contributor',
    isActive: true,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeDeps(user: User | null, passwordOk = true) {
  const userRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(user),
    findByUsername: vi.fn(),
    save: vi.fn(),
    updatePassword: vi.fn(),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn(),
    compare: vi.fn().mockResolvedValue(passwordOk),
  } as unknown as PasswordHasherPort;
  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('jwt-token'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenServicePort;
  const refreshTokenRepo = {
    create: vi.fn().mockResolvedValue({}),
    findByHash: vi.fn(),
    revokeByHash: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as unknown as RefreshTokenRepository;

  const useCase = new LoginUserUseCase(userRepo, hasher, tokenService, refreshTokenRepo, 900, 2592000);
  return { useCase, refreshTokenRepo };
}

describe('LoginUserUseCase', () => {
  it('menolak password salah dengan error generik (INVALID_CREDENTIALS)', async () => {
    const { useCase } = makeDeps(makeUser(), false);

    await expect(
      useCase.execute({ email: 'budi@test.com', password: 'salah' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS', statusCode: 401, message: 'Email atau password salah' });
  });

  it('menolak email tidak terdaftar dengan error yang SAMA (cegah enumeration)', async () => {
    const { useCase } = makeDeps(null);

    await expect(
      useCase.execute({ email: 'hantu@test.com', password: 'apapun1' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS', message: 'Email atau password salah' });
  });

  it('menolak user yang soft-deleted', async () => {
    const { useCase } = makeDeps(makeUser({ deletedAt: new Date() }));

    await expect(
      useCase.execute({ email: 'budi@test.com', password: 'Password123' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
  });

  it('sukses: simpan refresh token dalam bentuk HASH, bukan plain', async () => {
    const { useCase, refreshTokenRepo } = makeDeps(makeUser());

    const result = await useCase.execute({ email: 'budi@test.com', password: 'Password123' });

    expect(result.accessToken).toBe('jwt-token');
    expect(result.expiresIn).toBe(900);
    expect(result.user).toEqual({ id: '01TESTULIDUSERID00000000', username: 'budi', role: 'contributor' });

    const stored = vi.mocked(refreshTokenRepo.create).mock.calls[0][0];
    expect(stored.tokenHash).not.toBe(result.refreshToken); // hash !== plain
    expect(stored.tokenHash).toHaveLength(64); // sha256 hex
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
