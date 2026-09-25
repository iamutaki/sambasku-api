import { describe, expect, it, vi } from 'vitest';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { MailerPort } from '@/modules/auth/application/ports/mailer.port';
import type { User } from '@/modules/auth/domain/entities/user.entity';
import type { RefreshTokenRepository } from '@/modules/auth/domain/repositories/refresh-token.repository';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import { ApproveVerifierApplicationUseCase } from '../../application/use-cases/approve-verifier-application.use-case';
import type { VerifierApplication } from '../../domain/entities/verifier-application.entity';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

const APP_ID = '01APP00000000000000000000';
const USER_ID = '01USER0000000000000000000';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    username: 'siti',
    displayName: 'Siti',
    bio: null,
    email: 'siti@test.com',
    phone: null,
    passwordHash: null,
    role: 'reviewer',
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
    ...overrides,
  };
}

function makeUseCase(user: User | null, mailerRejects = false) {
  const appRepo = {
    approveAtomically: vi.fn().mockResolvedValue({
      id: APP_ID,
      userId: USER_ID,
      status: 'approved',
    } as VerifierApplication),
  } as unknown as VerifierApplicationRepository;
  const refreshTokenRepo = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as RefreshTokenRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;
  const notifyUser = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase;
  const userRepo = {
    findById: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository;
  const mailer = {
    sendVerifierApprovedEmail: mailerRejects
      ? vi.fn().mockRejectedValue(new Error('resend down'))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as MailerPort;

  return {
    mailer,
    useCase: new ApproveVerifierApplicationUseCase(
      appRepo,
      refreshTokenRepo,
      auditRepo,
      notifyUser,
      userRepo,
      mailer,
    ),
  };
}

const cmd = {
  applicationId: APP_ID,
  actorId: '01ADMIN000000000000000000',
  actorRole: 'admin',
};

describe('ApproveVerifierApplicationUseCase', () => {
  it('mengirim email selamat ke email dan nama tampilan user', async () => {
    const { useCase, mailer } = makeUseCase(makeUser());
    const result = await useCase.execute(cmd);
    expect(result).toEqual({ id: APP_ID, status: 'approved', role: 'reviewer' });
    expect(mailer.sendVerifierApprovedEmail).toHaveBeenCalledWith('siti@test.com', 'Siti');
  });

  it('memakai username bila nama tampilan kosong', async () => {
    const { useCase, mailer } = makeUseCase(makeUser({ displayName: '   ' }));
    await useCase.execute(cmd);
    expect(mailer.sendVerifierApprovedEmail).toHaveBeenCalledWith('siti@test.com', 'siti');
  });

  it('tetap menyetujui bila email gagal terkirim', async () => {
    const { useCase, mailer } = makeUseCase(makeUser(), true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await useCase.execute(cmd);
    expect(result.status).toBe('approved');
    expect(mailer.sendVerifierApprovedEmail).toHaveBeenCalled();
    error.mockRestore();
  });
});
