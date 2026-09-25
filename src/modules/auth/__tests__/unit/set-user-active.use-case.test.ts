import { describe, it, expect, vi } from 'vitest';
import { SetUserActiveUseCase } from '../../application/use-cases/set-user-active.use-case';
import type { User } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import { BadRequestError, ForbiddenError } from '@/shared/errors/app-error';

const ACTOR = '01ACTORADMINULID000000000';
const TARGET = '01TARGETUSERULID000000000';

function user(partial: Partial<User> = {}): User {
  return {
    id: TARGET,
    username: 'siti',
    displayName: 'siti',
    bio: null,
    email: 'siti@test.com',
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
    ...partial,
  };
}

function makeDeps(target: User | null) {
  const userRepo = {
    findById: vi.fn().mockResolvedValue(target),
    setIsActive: vi.fn().mockResolvedValue(true),
  } as unknown as UserRepository;
  const refreshTokenRepo = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as RefreshTokenRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    userRepo,
    refreshTokenRepo,
    auditRepo,
    useCase: new SetUserActiveUseCase(
      userRepo,
      refreshTokenRepo,
      auditRepo as unknown as AuditLogRepository,
    ),
  };
}

describe('SetUserActiveUseCase', () => {
  it('menonaktifkan user dan mencabut sesi', async () => {
    const { useCase, userRepo, refreshTokenRepo, auditRepo } = makeDeps(user());
    const result = await useCase.execute({
      targetUserId: TARGET,
      isActive: false,
      actorId: ACTOR,
    });
    expect(result).toEqual({ id: TARGET, isActive: false });
    expect(userRepo.setIsActive).toHaveBeenCalledWith(TARGET, false);
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(TARGET);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR,
        oldData: { is_active: true },
        newData: { is_active: false },
      }),
    );
  });

  it('mengaktifkan kembali tanpa mencabut sesi', async () => {
    const { useCase, refreshTokenRepo } = makeDeps(user({ isActive: false }));
    await useCase.execute({ targetUserId: TARGET, isActive: true, actorId: ACTOR });
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('menolak mengubah status diri sendiri', async () => {
    const { useCase } = makeDeps(user({ id: ACTOR }));
    await expect(
      useCase.execute({ targetUserId: ACTOR, isActive: false, actorId: ACTOR }),
    ).rejects.toMatchObject({ errorCode: 'CANNOT_DEACTIVATE_SELF' });
  });

  it('menolak mengubah root', async () => {
    const { useCase } = makeDeps(user({ role: 'root' }));
    await expect(
      useCase.execute({ targetUserId: TARGET, isActive: false, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('menolak user sistem anonim', async () => {
    const { useCase } = makeDeps(null);
    await expect(
      useCase.execute({ targetUserId: ANONIM_USER_ID, isActive: false, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
