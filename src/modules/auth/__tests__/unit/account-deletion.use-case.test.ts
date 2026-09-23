import { describe, it, expect, vi } from 'vitest';
import { AccountDeletionUseCase } from '../../application/use-cases/account-deletion.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { User } from '../../domain/entities/user.entity';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { AccountErasureRepository } from '../../domain/repositories/account-erasure.repository';
import type { AccountDeletionTokenRepository } from '../../domain/repositories/account-deletion-token.repository';
import type { MailerPort } from '../../application/ports/mailer.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';

const USER_ID = '01TESTULIDUSERID00000000';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    username: 'tester',
    email: 'tester@test.com',
    phone: '6281234567890',
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
    canContribute: true,
    ...overrides,
  };
}

function makeDeps(user: User | null, compareResult = true) {
  const userRepo = {
    findById: vi.fn().mockResolvedValue(user),
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository;
  const hasher = {
    compare: vi.fn().mockResolvedValue(compareResult),
    hash: vi.fn(),
  } as unknown as PasswordHasherPort;
  const erasure = {
    erase: vi.fn().mockResolvedValue({ avatar: null, privateFileIds: [] }),
  } as unknown as AccountErasureRepository;
  const deletionTokens = {
    create: vi.fn().mockResolvedValue({}),
    findByHash: vi.fn(),
    consume: vi.fn(),
    invalidateUnusedForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as AccountDeletionTokenRepository;
  const mailer = {
    sendAccountDeletionEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailerPort;
  const publicImages = { delete: vi.fn().mockResolvedValue(undefined), providerName: 'github' } as unknown as PublicImageStoragePort;
  const privateImages = { deleteFile: vi.fn().mockResolvedValue(undefined), providerName: 'imagekit' } as unknown as ImageStoragePort;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;

  return {
    userRepo,
    hasher,
    erasure,
    deletionTokens,
    mailer,
    auditRepo,
    useCase: new AccountDeletionUseCase(
      userRepo,
      hasher,
      erasure,
      deletionTokens,
      mailer,
      publicImages,
      privateImages,
      auditRepo,
      'https://sambasku.test/hapus-akun',
    ),
  };
}

describe('AccountDeletionUseCase', () => {
  it('deleteOwn dengan kata sandi benar menghapus akun', async () => {
    const { useCase, erasure, hasher, auditRepo } = makeDeps(makeUser());

    await useCase.deleteOwn({ userId: USER_ID, password: 'Password123', confirmation: 'HAPUS' }, 'req-1');

    expect(hasher.compare).toHaveBeenCalledWith('Password123', 'pbkdf2-sha256$lama');
    expect(erasure.erase).toHaveBeenCalledWith(USER_ID);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', newData: { via: 'in_app' } }),
    );
  });

  it('kata sandi salah tidak menghapus akun', async () => {
    const { useCase, erasure } = makeDeps(makeUser(), false);

    await expect(
      useCase.deleteOwn({ userId: USER_ID, password: 'salah', confirmation: 'HAPUS' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    expect(erasure.erase).not.toHaveBeenCalled();
  });

  it('akun Google tanpa kata sandi cukup konfirmasi HAPUS', async () => {
    const { useCase, erasure, hasher } = makeDeps(makeUser({ passwordHash: null }));

    await useCase.deleteOwn({ userId: USER_ID, confirmation: 'HAPUS' });

    expect(hasher.compare).not.toHaveBeenCalled();
    expect(erasure.erase).toHaveBeenCalledWith(USER_ID);
  });

  it('konfirmasi selain HAPUS ditolak', async () => {
    const { useCase, erasure } = makeDeps(makeUser());

    await expect(
      useCase.deleteOwn({ userId: USER_ID, password: 'Password123', confirmation: 'ya' }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(erasure.erase).not.toHaveBeenCalled();
  });

  it('requestByEmail untuk email yang tidak ada tidak mengirim kode', async () => {
    const { useCase, mailer, deletionTokens } = makeDeps(null);

    await useCase.requestByEmail('tidak-ada@test.com');

    expect(deletionTokens.create).not.toHaveBeenCalled();
    expect(mailer.sendAccountDeletionEmail).not.toHaveBeenCalled();
  });

  it('requestByEmail mengirim kode jika email terdaftar', async () => {
    const { useCase, mailer, deletionTokens } = makeDeps(makeUser());

    await useCase.requestByEmail('tester@test.com');

    expect(deletionTokens.invalidateUnusedForUser).toHaveBeenCalledWith(USER_ID);
    expect(deletionTokens.create).toHaveBeenCalled();
    expect(mailer.sendAccountDeletionEmail).toHaveBeenCalledWith(
      'tester@test.com',
      expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
      'https://sambasku.test/hapus-akun',
    );
  });
});
