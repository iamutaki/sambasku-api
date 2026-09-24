import { describe, it, expect, vi } from 'vitest';
import { ValidationError } from '@/shared/errors/app-error';
import { CreateTranslationHelpUseCase } from '../../application/use-cases/create-translation-help.use-case';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { translationHelpUploadTokenQuerySchema } from '../../presentation/v1/validators/translation-help.validator';

const ID = '01JDHELPTRANSL0000000000000';
const USER = '01JDUSERKONTRIB0000000000A';

const image = {
  url: 'https://ik.imagekit.io/test/translation-helps/x.jpg',
  providerFileId: 'file_th_x',
  publicUrl: null as string | null,
};

function makeHelp(overrides: Partial<TranslationHelp> = {}): TranslationHelp {
  return {
    id: ID,
    userId: USER,
    username: 'peminta',
    body: 'Apa arti tulisan di papan ini?',
    images: [],
    status: 'pending_review',
    rejectionNote: null,
    reviewedBy: null,
    reviewedAt: null,
    pinnedReplyId: null,
    createdAt: new Date('2026-09-24T00:00:00Z'),
    updatedAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<TranslationHelpRepository> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeHelp()),
    findById: vi.fn(),
    list: vi.fn(),
    updateStatus: vi.fn(),
    setPinnedReply: vi.fn(),
    createReply: vi.fn(),
    findReplyById: vi.fn(),
    listReplies: vi.fn(),
    markReplyDeletedByAuthor: vi.fn(),
    takedownReply: vi.fn(),
    ...overrides,
  } as unknown as TranslationHelpRepository;
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;
}

describe('translationHelpUploadTokenQuerySchema', () => {
  it('folder selain /translation-helps → gagal', () => {
    const parsed = translationHelpUploadTokenQuerySchema.safeParse({ folder: '/bug-reports' });
    expect(parsed.success).toBe(false);
  });

  it('folder /translation-helps → lolos', () => {
    const parsed = translationHelpUploadTokenQuerySchema.safeParse({
      folder: '/translation-helps',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('CreateTranslationHelpUseCase', () => {
  it('tanpa body dan tanpa gambar → VALIDATION_ERROR', async () => {
    const uc = new CreateTranslationHelpUseCase(makeRepo(), makeAudit());
    await expect(
      uc.execute({ userId: USER, body: null, images: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('body > 1000 → VALIDATION_ERROR', async () => {
    const uc = new CreateTranslationHelpUseCase(makeRepo(), makeAudit());
    await expect(
      uc.execute({ userId: USER, body: 'a'.repeat(1001), images: [] }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('images 5 item → VALIDATION_ERROR', async () => {
    const uc = new CreateTranslationHelpUseCase(makeRepo(), makeAudit());
    await expect(
      uc.execute({
        userId: USER,
        body: null,
        images: [image, image, image, image, image],
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('teks saja → create pending_review + audit', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const uc = new CreateTranslationHelpUseCase(repo, audit);
    await uc.execute({
      userId: USER,
      body: 'Apa arti tulisan di papan ini?',
      images: [],
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        body: 'Apa arti tulisan di papan ini?',
        images: [],
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        action: 'create',
        entityType: 'translation_help',
      }),
    );
  });

  it('gambar saja (tanpa body) → lolos', async () => {
    const repo = makeRepo({
      create: vi.fn().mockResolvedValue(makeHelp({ body: null, images: [image] })),
    });
    const uc = new CreateTranslationHelpUseCase(repo, makeAudit());
    await uc.execute({ userId: USER, body: null, images: [image] });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ body: null, images: [expect.objectContaining({ url: image.url })] }),
    );
  });
});
