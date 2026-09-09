import { describe, it, expect, vi } from 'vitest';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';

function makeDeps(overrides: { findByUsername?: unknown; findByEmail?: unknown } = {}) {
  const userRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(overrides.findByEmail ?? null),
    findByUsername: vi.fn().mockResolvedValue(overrides.findByUsername ?? null),
    save: vi.fn().mockImplementation((user: { username: string; email: string; passwordHash: string }) =>
      Promise.resolve({
        id: '01TESTULIDUSERID00000000',
        ...user,
        role: 'contributor',
        isActive: true,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      }),
    ),
    updatePassword: vi.fn(),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn().mockResolvedValue('argon2id$hash'),
    compare: vi.fn(),
  } as unknown as PasswordHasherPort;
  return { userRepo, hasher, useCase: new RegisterUserUseCase(userRepo, hasher) };
}

describe('RegisterUserUseCase', () => {
  it('menyimpan user baru dengan password ter-hash dan role default contributor', async () => {
    const { useCase, userRepo, hasher } = makeDeps();

    const user = await useCase.execute({
      username: 'budi',
      email: 'Budi@Test.com',
      password: 'Password123',
    });

    expect(hasher.hash).toHaveBeenCalledWith('Password123');
    expect(userRepo.save).toHaveBeenCalledWith({
      username: 'budi',
      email: 'budi@test.com', // dinormalisasi lowercase oleh Email VO
      passwordHash: 'argon2id$hash',
    });
    expect(user.role).toBe('contributor');
    // JANGAN pernah kembalikan password_hash di response
    expect(user.passwordHash).toBe('argon2id$hash'); // internal saja — presentation hanya mapping field aman
  });

  it('menolak email yang sudah terdaftar (EMAIL_ALREADY_EXISTS)', async () => {
    const { useCase } = makeDeps({ findByEmail: { id: 1 } });

    await expect(
      useCase.execute({ username: 'budi', email: 'budi@test.com', password: 'Password123' }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('menolak username yang sudah dipakai (USERNAME_ALREADY_EXISTS)', async () => {
    const { useCase } = makeDeps({ findByUsername: { id: 1 } });

    await expect(
      useCase.execute({ username: 'budi', email: 'budi@test.com', password: 'Password123' }),
    ).rejects.toMatchObject({ errorCode: 'USERNAME_ALREADY_EXISTS', statusCode: 409 });
  });

  it('menolak password lewat Validator Zod (VO domain tetap menjaga invariant)', async () => {
    const { useCase } = makeDeps();

    await expect(
      useCase.execute({ username: 'budi', email: 'budi@test.com', password: 'pendek1' }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});
