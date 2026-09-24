import { describe, it, expect, vi } from 'vitest';
import { CreateAdminUserUseCase } from '../../application/use-cases/create-admin-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { ConflictError, BadRequestError } from '@/shared/errors/app-error';

const ACTOR = '01ACTORADMINULID000000000';

function makeDeps(overrides: {
  findByUsername?: unknown;
  findByEmail?: unknown;
  findByPhone?: unknown;
} = {}) {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(overrides.findByEmail ?? null),
    findByUsername: vi.fn().mockResolvedValue(overrides.findByUsername ?? null),
    findByPhone: vi.fn().mockResolvedValue(overrides.findByPhone ?? null),
    save: vi.fn().mockImplementation((user: Record<string, unknown>) =>
      Promise.resolve({
        id: '01TESTULIDUSERID00000000',
        displayName: user.username,
        bio: null,
        canContribute: true,
        avatarUrl: null,
        avatarProvider: null,
        avatarProviderFileId: null,
        avatarSha: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: null,
        deletedAt: null,
        ...user,
      }),
    ),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn().mockResolvedValue('argon2id$hash'),
    compare: vi.fn(),
  } as unknown as PasswordHasherPort;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    userRepo,
    hasher,
    auditRepo,
    useCase: new CreateAdminUserUseCase(userRepo, hasher, auditRepo as unknown as AuditLogRepository),
  };
}

const base = {
  username: 'Siti',
  email: 'Siti@Test.com',
  phone: null as string | null,
  password: 'Password123',
  role: 'editor' as const,
  isActive: true,
  actorId: ACTOR,
};

describe('CreateAdminUserUseCase', () => {
  it('menyimpan user aktif, email terverifikasi, tanpa mengirim password ke audit', async () => {
    const { useCase, userRepo, hasher, auditRepo } = makeDeps();

    const user = await useCase.execute(base);

    expect(hasher.hash).toHaveBeenCalledWith('Password123');
    expect(userRepo.save).toHaveBeenCalledWith({
      username: 'Siti',
      email: 'siti@test.com',
      phone: null,
      passwordHash: 'argon2id$hash',
      emailVerified: true,
      role: 'editor',
      isActive: true,
    });
    expect(user.emailVerified).toBe(true);
    expect(user.isActive).toBe(true);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR,
        action: 'create',
        entityType: 'user',
        entityId: user.id,
        newData: expect.objectContaining({
          email: 'siti@test.com',
          role: 'editor',
          is_active: true,
          via: 'admin',
        }),
      }),
    );
    expect(JSON.stringify(auditRepo.record.mock.calls)).not.toContain('Password123');
    expect(JSON.stringify(auditRepo.record.mock.calls)).not.toContain('argon2id$hash');
  });

  it('menyimpan user nonaktif bila admin mematikan status', async () => {
    const { useCase, userRepo } = makeDeps();
    const user = await useCase.execute({ ...base, isActive: false, role: 'contributor' });
    expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, role: 'contributor' }));
    expect(user.isActive).toBe(false);
  });

  it('menolak peran root', async () => {
    const { useCase, userRepo } = makeDeps();
    await expect(useCase.execute({ ...base, role: 'root' })).rejects.toBeInstanceOf(BadRequestError);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('menolak username yang sudah dipakai', async () => {
    const { useCase } = makeDeps({ findByUsername: { id: 'ada' } });
    await expect(useCase.execute(base)).rejects.toMatchObject({ errorCode: 'USERNAME_ALREADY_EXISTS' });
  });

  it('menolak email yang sudah terdaftar', async () => {
    const { useCase } = makeDeps({ findByEmail: { id: 'ada' } });
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(ConflictError);
    await expect(useCase.execute(base)).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
  });

  it('menolak nomor HP yang sudah terdaftar', async () => {
    const { useCase } = makeDeps({ findByPhone: { id: 'ada' } });
    await expect(useCase.execute({ ...base, phone: '6281234567890' })).rejects.toMatchObject({
      errorCode: 'PHONE_ALREADY_EXISTS',
    });
  });
});
