import { describe, it, expect, vi } from 'vitest';
import { ConflictError, ForbiddenError } from '@/shared/errors/app-error';
import { CreateVerifierApplicationUseCase } from '../../application/use-cases/create-verifier-application.use-case';
import { ResubmitVerifierApplicationUseCase } from '../../application/use-cases/resubmit-verifier-application.use-case';
import { ApproveVerifierApplicationUseCase } from '../../application/use-cases/approve-verifier-application.use-case';
import { RejectVerifierApplicationUseCase } from '../../application/use-cases/reject-verifier-application.use-case';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { VerifierApplication } from '../../domain/entities/verifier-application.entity';

const USER = '01JDUSERKONTRIB0000000000A';
const ADMIN = '01JDADMINULID000000000000A';
const APP_ID = '01JDVA0000000000000000000A';

const links = [
  {
    platform: 'instagram' as const,
    username: 'budi',
    screenshot: {
      url: 'https://ik.imagekit.io/test/verifier-applications/budi.jpg',
      provider_file_id: 'file_va_budi',
    },
  },
];

function makeApp(overrides: Partial<VerifierApplication> = {}): VerifierApplication {
  return {
    id: APP_ID,
    userId: USER,
    username: 'budi',
    phone: '6281234567890',
    address: 'Jl. Merdeka No. 1, Sambas',
    socialLinks: links,
    status: 'pending',
    adminComment: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-21T00:00:00Z'),
    updatedAt: null,
    ...overrides,
  };
}

function makeAppRepo(overrides: Partial<VerifierApplicationRepository> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeApp()),
    createWithPhone: vi.fn().mockResolvedValue(makeApp()),
    findByUserId: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(makeApp()),
    list: vi.fn(),
    resubmit: vi.fn().mockResolvedValue(makeApp({ status: 'pending' })),
    resubmitWithPhone: vi.fn().mockResolvedValue(makeApp({ status: 'pending' })),
    approveAtomically: vi.fn().mockResolvedValue(makeApp({ status: 'approved' })),
    markApproved: vi.fn().mockResolvedValue(makeApp({ status: 'approved' })),
    markRejected: vi.fn().mockResolvedValue(makeApp({ status: 'rejected' })),
    ...overrides,
  } as unknown as VerifierApplicationRepository;
}

function makeUserRepo() {
  return {
    findByPhone: vi.fn().mockResolvedValue(null),
    updatePhone: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserRepository;
}

const submit = {
  userId: USER,
  role: 'contributor',
  phone: '6281234567890',
  address: 'Jl. Merdeka No. 1, Sambas',
  socialLinks: links,
};

describe('CreateVerifierApplicationUseCase', () => {
  it('bukan contributor → 403 ALREADY_VERIFIER', async () => {
    const useCase = new CreateVerifierApplicationUseCase(makeAppRepo(), makeUserRepo());
    await expect(useCase.execute({ ...submit, role: 'reviewer' })).rejects.toMatchObject({
      errorCode: 'ALREADY_VERIFIER',
      statusCode: 403,
    });
  });

  it('sudah ada baris → 409 APPLICATION_ALREADY_EXISTS', async () => {
    const appRepo = makeAppRepo({ findByUserId: vi.fn().mockResolvedValue(makeApp()) });
    const useCase = new CreateVerifierApplicationUseCase(appRepo, makeUserRepo());
    await expect(useCase.execute(submit)).rejects.toMatchObject({
      errorCode: 'APPLICATION_ALREADY_EXISTS',
      statusCode: 409,
    });
    expect(appRepo.createWithPhone).not.toHaveBeenCalled();
  });

  it('HP dipakai user lain → 409 PHONE_ALREADY_EXISTS', async () => {
    const userRepo = makeUserRepo();
    (userRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'other' });
    const useCase = new CreateVerifierApplicationUseCase(makeAppRepo(), userRepo);
    await expect(useCase.execute(submit)).rejects.toMatchObject({
      errorCode: 'PHONE_ALREADY_EXISTS',
      statusCode: 409,
    });
  });

  it('race unique HP (23505) → 409 PHONE_ALREADY_EXISTS', async () => {
    const appRepo = makeAppRepo({
      createWithPhone: vi
        .fn()
        .mockRejectedValue(new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar')),
    });
    const useCase = new CreateVerifierApplicationUseCase(appRepo, makeUserRepo());
    await expect(useCase.execute(submit)).rejects.toMatchObject({
      errorCode: 'PHONE_ALREADY_EXISTS',
      statusCode: 409,
    });
  });

  it('contributor baru → createWithPhone', async () => {
    const appRepo = makeAppRepo();
    const useCase = new CreateVerifierApplicationUseCase(appRepo, makeUserRepo());
    const result = await useCase.execute(submit);
    expect(result.status).toBe('pending');
    expect(appRepo.createWithPhone).toHaveBeenCalledWith({
      userId: USER,
      phone: '6281234567890',
      address: 'Jl. Merdeka No. 1, Sambas',
      socialLinks: links,
    });
  });
});

describe('ResubmitVerifierApplicationUseCase', () => {
  it('status pending → 409 VERIFIER_APPLICATION_NOT_REJECTED', async () => {
    const appRepo = makeAppRepo({ findByUserId: vi.fn().mockResolvedValue(makeApp()) });
    const useCase = new ResubmitVerifierApplicationUseCase(appRepo, makeUserRepo());
    await expect(useCase.execute(submit)).rejects.toMatchObject({
      errorCode: 'VERIFIER_APPLICATION_NOT_REJECTED',
      statusCode: 409,
    });
    expect(appRepo.resubmitWithPhone).not.toHaveBeenCalled();
  });

  it('status rejected → resubmitWithPhone', async () => {
    const appRepo = makeAppRepo({
      findByUserId: vi.fn().mockResolvedValue(makeApp({ status: 'rejected' })),
    });
    const useCase = new ResubmitVerifierApplicationUseCase(appRepo, makeUserRepo());
    const result = await useCase.execute(submit);
    expect(result.status).toBe('pending');
    expect(appRepo.resubmitWithPhone).toHaveBeenCalled();
  });
});

describe('ApproveVerifierApplicationUseCase', () => {
  it('pending → approve atomik + revoke refresh + notify', async () => {
    const appRepo = makeAppRepo();
    const refreshTokenRepo = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
    const auditRepo = { record: vi.fn().mockResolvedValue(undefined) };
    const notifyUser = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ApproveVerifierApplicationUseCase(
      appRepo,
      refreshTokenRepo as never,
      auditRepo as never,
      notifyUser as never,
    );
    const result = await useCase.execute({
      applicationId: APP_ID,
      actorId: ADMIN,
      actorRole: 'admin',
    });
    expect(result).toEqual({ id: APP_ID, status: 'approved', role: 'reviewer' });
    expect(appRepo.approveAtomically).toHaveBeenCalledWith(APP_ID, ADMIN);
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(USER);
    expect(notifyUser.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, title: 'Pengajuan verifikator disetujui' }),
    );
  });

  it('sudah reviewed (CAS) → 409 APPLICATION_ALREADY_REVIEWED', async () => {
    const appRepo = makeAppRepo({
      approveAtomically: vi
        .fn()
        .mockRejectedValue(
          new ConflictError('APPLICATION_ALREADY_REVIEWED', 'Pengajuan sudah memiliki keputusan'),
        ),
    });
    const useCase = new ApproveVerifierApplicationUseCase(
      appRepo,
      { revokeAllForUser: vi.fn() } as never,
      { record: vi.fn() } as never,
      { execute: vi.fn() } as never,
    );
    await expect(
      useCase.execute({ applicationId: APP_ID, actorId: ADMIN, actorRole: 'admin' }),
    ).rejects.toMatchObject({ errorCode: 'APPLICATION_ALREADY_REVIEWED', statusCode: 409 });
  });

  it('pemohon bukan contributor → 403 ALREADY_VERIFIER', async () => {
    const appRepo = makeAppRepo({
      approveAtomically: vi
        .fn()
        .mockRejectedValue(new ForbiddenError('ALREADY_VERIFIER', 'Pemohon bukan lagi kontributor')),
    });
    const refreshTokenRepo = { revokeAllForUser: vi.fn() };
    const useCase = new ApproveVerifierApplicationUseCase(
      appRepo,
      refreshTokenRepo as never,
      { record: vi.fn() } as never,
      { execute: vi.fn() } as never,
    );
    await expect(
      useCase.execute({ applicationId: APP_ID, actorId: ADMIN, actorRole: 'admin' }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_VERIFIER', statusCode: 403 });
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});

describe('RejectVerifierApplicationUseCase', () => {
  it('pending → rejected + notify', async () => {
    const appRepo = makeAppRepo();
    const auditRepo = { record: vi.fn().mockResolvedValue(undefined) };
    const notifyUser = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new RejectVerifierApplicationUseCase(appRepo, auditRepo as never, notifyUser as never);
    const result = await useCase.execute({
      applicationId: APP_ID,
      actorId: ADMIN,
      comment: 'HP tidak bisa dihubungi',
    });
    expect(result.status).toBe('rejected');
    expect(appRepo.markRejected).toHaveBeenCalledWith(APP_ID, ADMIN, 'HP tidak bisa dihubungi');
    expect(notifyUser.execute).toHaveBeenCalled();
  });
});
