import { describe, it, expect, vi } from 'vitest';
import { ValidationError, NotFoundError } from '@/shared/errors/app-error';
import { CreateBugReportUseCase } from '../../application/use-cases/create-bug-report.use-case';
import { ResolveBugReportUseCase } from '../../application/use-cases/resolve-bug-report.use-case';
import type { BugReportRepository } from '../../domain/repositories/bug-report.repository';
import type { BugReport } from '../../domain/entities/bug-report.entity';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { bugReportUploadTokenQuerySchema } from '../../presentation/v1/validators/bug-report.validator';

const ID = '01JDBUGREPORT0000000000000';
const USER = '01JDUSERKONTRIB0000000000A';
const DEVICE = '01JDDEVICEID00000000000000';

const image = {
  url: 'https://ik.imagekit.io/test/bug-reports/x.jpg',
  providerFileId: 'file_bug_x',
};

function makeReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: ID,
    userId: null,
    username: null,
    deviceId: DEVICE,
    description: 'Tombol upvote tidak merespons di halaman detail',
    images: [],
    appVersion: '0.1.0',
    platform: 'android',
    status: 'open',
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2026-09-21T00:00:00Z'),
    updatedAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<BugReportRepository> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeReport()),
    findById: vi.fn().mockResolvedValue(makeReport()),
    list: vi.fn(),
    resolve: vi.fn().mockResolvedValue(makeReport({ status: 'resolved' })),
    ...overrides,
  } as unknown as BugReportRepository;
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;
}

describe('bugReportUploadTokenQuerySchema', () => {
  it('folder selain /bug-reports → gagal', () => {
    const parsed = bugReportUploadTokenQuerySchema.safeParse({ folder: '/words' });
    expect(parsed.success).toBe(false);
  });

  it('folder /bug-reports → lolos', () => {
    const parsed = bugReportUploadTokenQuerySchema.safeParse({ folder: '/bug-reports' });
    expect(parsed.success).toBe(true);
  });
});

describe('CreateBugReportUseCase', () => {
  it('description pendek → VALIDATION_ERROR', async () => {
    const uc = new CreateBugReportUseCase(makeRepo(), makeAudit());
    await expect(
      uc.execute({
        userId: null,
        deviceId: DEVICE,
        description: 'pendek',
        images: [],
        appVersion: null,
        platform: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('images 5 item → VALIDATION_ERROR', async () => {
    const uc = new CreateBugReportUseCase(makeRepo(), makeAudit());
    await expect(
      uc.execute({
        userId: null,
        deviceId: DEVICE,
        description: 'Tombol upvote tidak merespons di halaman detail',
        images: [image, image, image, image, image],
        appVersion: null,
        platform: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('anonim menulis user_id null + device_id terisi', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const uc = new CreateBugReportUseCase(repo, audit);
    await uc.execute({
      userId: null,
      deviceId: DEVICE,
      description: 'Tombol upvote tidak merespons di halaman detail',
      images: [],
      appVersion: '0.1.0',
      platform: 'android',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, deviceId: DEVICE }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'create',
        entityType: 'bug_report',
      }),
    );
  });

  it('login → user_id terisi', async () => {
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(makeReport({ userId: USER })) });
    const uc = new CreateBugReportUseCase(repo, makeAudit());
    await uc.execute({
      userId: USER,
      deviceId: DEVICE,
      description: 'Tombol upvote tidak merespons di halaman detail',
      images: [image],
      appVersion: null,
      platform: 'ios',
    });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }));
  });
});

describe('ResolveBugReportUseCase', () => {
  it('id hilang → BUG_REPORT_NOT_FOUND', async () => {
    const uc = new ResolveBugReportUseCase(
      makeRepo({ findById: vi.fn().mockResolvedValue(null) }),
      makeAudit(),
    );
    await expect(
      uc.execute({ id: ID, actorId: USER, status: 'resolved' }),
    ).rejects.toMatchObject({ errorCode: 'BUG_REPORT_NOT_FOUND' });
  });

  it('resolve dua kali → 404 BUG_REPORT_NOT_FOUND', async () => {
    const uc = new ResolveBugReportUseCase(
      makeRepo({ findById: vi.fn().mockResolvedValue(makeReport({ status: 'resolved' })) }),
      makeAudit(),
    );
    await expect(
      uc.execute({ id: ID, actorId: USER, status: 'rejected' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('open → resolved + audit update', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const uc = new ResolveBugReportUseCase(repo, audit);
    const row = await uc.execute({
      id: ID,
      actorId: USER,
      status: 'resolved',
      note: 'Sudah diperbaiki',
    });
    expect(row.status).toBe('resolved');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entityType: 'bug_report', userId: USER }),
    );
  });
});
