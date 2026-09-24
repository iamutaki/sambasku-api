import { describe, it, expect, vi } from 'vitest';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { User } from '../../domain/entities/user.entity';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

const USER_ID = '01TESTULIDUSERID00000000';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    username: 'tester',
    displayName: 'tester',
    bio: null,
    email: 'tester@test.com',
    phone: null,
    passwordHash: 'pbkdf2-sha256$lama',
    role: 'contributor',
    isActive: true,
    emailVerified: true,
    avatarUrl: null,
    avatarProvider: null,
    avatarProviderFileId: null,
    avatarSha: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
    canContribute: overrides.canContribute ?? true,
  };
}

function makeDeps(user: User | null, compareResult = true) {
  const userRepo = {
    findById: vi.fn().mockResolvedValue(user),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn().mockResolvedValue('pbkdf2-sha256$baru'),
    compare: vi.fn().mockResolvedValue(compareResult),
  } as unknown as PasswordHasherPort;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  const refreshTokenRepo = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as RefreshTokenRepository;

  return {
    userRepo,
    hasher,
    auditRepo,
    refreshTokenRepo,
    useCase: new ChangePasswordUseCase(
      userRepo,
      hasher,
      auditRepo as unknown as AuditLogRepository,
      refreshTokenRepo,
    ),
  };
}

const dto = { oldPassword: 'PasswordLama1', newPassword: 'PasswordBaru1' };

describe('ChangePasswordUseCase', () => {
  it('sukses: verifikasi lama → hash → update → revoke semua session → audit', async () => {
    const { useCase, userRepo, hasher, refreshTokenRepo, auditRepo } = makeDeps(makeUser());

    await useCase.execute(dto, USER_ID, 'req-1');

    expect(hasher.compare).toHaveBeenCalledWith('PasswordLama1', 'pbkdf2-sha256$lama');
    expect(hasher.hash).toHaveBeenCalledWith('PasswordBaru1');
    expect(userRepo.updatePassword).toHaveBeenCalledWith(USER_ID, 'pbkdf2-sha256$baru');
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, action: 'password_change', newData: { changed: true, via: 'change_password' } }),
    );
  });

  it('password lama salah → INVALID_CREDENTIALS, password tidak berubah', async () => {
    const { useCase, userRepo, refreshTokenRepo } = makeDeps(makeUser(), false);

    await expect(useCase.execute(dto, USER_ID)).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    expect(userRepo.updatePassword).not.toHaveBeenCalled();
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('akun OAuth-only (hash null) → OAUTH_NO_PASSWORD sebelum compare', async () => {
    const { useCase, hasher } = makeDeps(makeUser({ passwordHash: null }));

    await expect(useCase.execute(dto, USER_ID)).rejects.toMatchObject({ errorCode: 'OAUTH_NO_PASSWORD' });
    expect(hasher.compare).not.toHaveBeenCalled();
  });

  it('user tidak ditemukan → UNAUTHORIZED', async () => {
    const { useCase } = makeDeps(null);

    await expect(useCase.execute(dto, USER_ID)).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  });

  it('password baru sama dengan lama → VALIDATION_ERROR field new_password', async () => {
    const { useCase, userRepo } = makeDeps(makeUser());

    await expect(
      useCase.execute({ oldPassword: 'PasswordBaru1', newPassword: 'PasswordBaru1' }, USER_ID),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('password baru lemah → ValidationError SEBELUM pemanggilan repo', async () => {
    const { useCase, userRepo } = makeDeps(makeUser());

    await expect(
      useCase.execute({ oldPassword: 'PasswordLama1', newPassword: 'pendek' }, USER_ID),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(userRepo.findById).not.toHaveBeenCalled();
  });
});
