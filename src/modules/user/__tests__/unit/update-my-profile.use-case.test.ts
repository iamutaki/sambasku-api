import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedError } from '@/shared/errors/app-error';
import {
  GetMyProfileUseCase,
  UpdateMyProfileUseCase,
} from '../../application/use-cases/update-my-profile.use-case';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { User } from '@/modules/auth/domain/entities/user.entity';

const USER_ID = '01TESTMEPROFILE0000000001';

function makeUser(overrides: Partial<User> = {}): User {
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
    emailVerified: true,
    avatarUrl: null,
    avatarProvider: null,
    avatarProviderFileId: null,
    avatarSha: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    canContribute: true,
    ...overrides,
  };
}

describe('GetMyProfileUseCase', () => {
  it('mengembalikan field editor', async () => {
    const user = makeUser({ displayName: 'Budi Santoso', bio: 'Kontributor Sambas' });
    const userRepo = { findById: vi.fn().mockResolvedValue(user) } as unknown as UserRepository;
    const result = await new GetMyProfileUseCase(userRepo).execute(USER_ID);
    expect(result).toEqual({
      username: 'budi',
      displayName: 'Budi Santoso',
      bio: 'Kontributor Sambas',
      avatarUrl: null,
    });
  });
});

describe('UpdateMyProfileUseCase', () => {
  it('memanggil updateProfile', async () => {
    const updated = makeUser({ displayName: 'Nama Baru', bio: 'Bio baru' });
    const userRepo = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      updateProfile: vi.fn().mockResolvedValue(updated),
    } as unknown as UserRepository;

    const result = await new UpdateMyProfileUseCase(userRepo).execute(USER_ID, {
      displayName: 'Nama Baru',
      bio: 'Bio baru',
    });

    expect(userRepo.updateProfile).toHaveBeenCalledWith(USER_ID, {
      displayName: 'Nama Baru',
      bio: 'Bio baru',
    });
    expect(result.displayName).toBe('Nama Baru');
    expect(result.bio).toBe('Bio baru');
  });

  it('sesi invalid → UNAUTHORIZED', async () => {
    const userRepo = {
      findById: vi.fn().mockResolvedValue(null),
      updateProfile: vi.fn(),
    } as unknown as UserRepository;

    await expect(
      new UpdateMyProfileUseCase(userRepo).execute(USER_ID, { displayName: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });
});
