import { describe, it, expect, vi } from 'vitest';
import { ReviewContributionUseCase } from '../../application/use-cases/review-contribution.use-case';
import { CorrectContributionUseCase } from '../../application/use-cases/correct-contribution.use-case';
import { ListContributionsUseCase } from '../../application/use-cases/list-contributions.use-case';
import { GetContributionDetailUseCase } from '../../application/use-cases/get-contribution-detail.use-case';
import type { ContributionRepository } from '../../domain/repositories/contribution.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Contribution } from '../../domain/entities/contribution.entity';

const ACTOR = { userId: '01ADMINULID00000000000000', requestId: 'req-1' };

function makeContribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: '01CONTRIBULID0000000000000',
    userId: '01CONTRIBUTORULID0000000000',
    contributorUsername: 'kontributor',
    entityType: 'word',
    entityId: '01WORDULID000000000000000',
    action: 'create',
    status: 'pending',
    description: null,
    createdAt: new Date(),
    searchMissId: null,
    searchMissTerm: null,
    searchMissDirection: null,
    ...overrides,
  };
}

function makeDeps() {
  const contributionRepo = {
    list: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeContribution()),
    findReview: vi.fn().mockResolvedValue(null),
    findChildWithParent: vi.fn(),
    review: vi.fn().mockImplementation(({ decision }: { decision: string }) => ({
      contributionId: '01CONTRIBULID0000000000000',
      entityType: 'word',
      entityId: '01WORDULID000000000000000',
      status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'corrected',
      contributorUserId: '01CONTRIBUTORULID0000000000',
    })),
    applyChildCorrection: vi.fn().mockResolvedValue(undefined),
  } as unknown as ContributionRepository;
  const wordRepo = {
    findDetailById: vi.fn().mockResolvedValue({ id: '01WORDULID000000000000000', lemma: 'makatn', status: 'pending_review', isVerified: false }),
    updateWithRelations: vi.fn().mockResolvedValue({ id: '01WORDULID000000000000000' }),
    findMissingReferences: vi.fn().mockResolvedValue({
      languageId: false, dialectId: false, languages: [], wordClasses: [], categories: [], words: [], dialects: [],
      inlineWordClasses: [], inlineLanguages: [], inlineCategories: [], inlineDialects: [],
    }),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return { contributionRepo, wordRepo, auditRepo };
}

describe('ReviewContributionUseCase', () => {
  it('approve → panggil review + audit action approve', async () => {
    const { contributionRepo, auditRepo } = makeDeps();
    const notifyUser = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ReviewContributionUseCase(
      contributionRepo,
      auditRepo as unknown as AuditLogRepository,
      notifyUser as never,
    );
    const outcome = await useCase.execute({
      contributionId: '01CONTRIBULID0000000000000',
      decision: 'approve',
      comment: null,
      actorId: ACTOR.userId,
      requestId: 'req-1',
    });
    expect(outcome.status).toBe('approved');
    expect(contributionRepo.review).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approve', reviewerId: ACTOR.userId, comment: null }),
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'approve', entityType: 'word', requestId: 'req-1' }),
    );
    expect(notifyUser.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '01CONTRIBUTORULID0000000000',
        title: 'Kontribusi disetujui',
        data: expect.objectContaining({ type: 'contribution_approved' }),
      }),
    );
  });

  it('reject → tidak kirim push notifikasi', async () => {
    const { contributionRepo, auditRepo } = makeDeps();
    const notifyUser = { execute: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ReviewContributionUseCase(
      contributionRepo,
      auditRepo as unknown as AuditLogRepository,
      notifyUser as never,
    );
    await useCase.execute({
      contributionId: '01CONTRIBULID0000000000000',
      decision: 'reject',
      comment: 'kurang lengkap',
      actorId: ACTOR.userId,
    });
    expect(notifyUser.execute).not.toHaveBeenCalled();
  });

  it('reject tanpa comment → VALIDATION_ERROR field comment (domain rule)', async () => {
    const { contributionRepo, auditRepo } = makeDeps();
    const useCase = new ReviewContributionUseCase(contributionRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute({ contributionId: '01CONTRIBULID0000000000000', decision: 'reject', comment: '', actorId: ACTOR.userId }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'comment', message: expect.stringContaining('wajib') }],
    });
    expect(contributionRepo.review).not.toHaveBeenCalled();
  });

  it('404/409 diteruskan dari repository (dicek di dalam transaksi)', async () => {
    const { contributionRepo, auditRepo } = makeDeps();
    contributionRepo.review = vi.fn().mockRejectedValue(
      Object.assign(new Error('sudah'), { errorCode: 'CONTRIBUTION_ALREADY_REVIEWED', statusCode: 409 }),
    );
    const useCase = new ReviewContributionUseCase(contributionRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute({ contributionId: '01CONTRIBULID0000000000000', decision: 'approve', comment: null, actorId: ACTOR.userId }),
    ).rejects.toMatchObject({ errorCode: 'CONTRIBUTION_ALREADY_REVIEWED' });
  });
});

describe('CorrectContributionUseCase', () => {
  const wordDto = {
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'kalintiak',
    wordType: 'word' as const,
    meanings: [
      {
        wordClassId: '01WORDCLASSESESNOMINA000000',
        definition: 'definisi',
        orderIndex: 1,
        translations: [{ languageId: '01LANGUAGESINDONESIA00000', translationText: 'terjemahan', translationType: 'direct' }],
      },
    ],
    categoryIds: [],
    relatedWords: [],
    status: 'published' as const,
  };

  it('entity word + publish → updateWithRelations published+verified+corrected, review correct + audit old/new', async () => {
    const { contributionRepo, wordRepo, auditRepo } = makeDeps();
    const useCase = new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo as unknown as AuditLogRepository);
    const outcome = await useCase.execute({
      contributionId: '01CONTRIBULID0000000000000',
      actorId: ACTOR.userId,
      requestId: 'req-1',
      comment: 'perbaiki definisi',
      publish: true,
      input: { word: wordDto },
    });
    expect(outcome.status).toBe('corrected');
    expect(wordRepo.updateWithRelations).toHaveBeenCalledWith(
      '01WORDULID000000000000000',
      expect.objectContaining({ status: 'published', isVerified: true, isCorrected: true }),
      ACTOR.userId,
    );
    expect(contributionRepo.review).toHaveBeenCalledWith(expect.objectContaining({ decision: 'correct' }));
    expect(contributionRepo.applyChildCorrection).not.toHaveBeenCalled();
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'correct',
        oldData: expect.objectContaining({ lemma: 'makatn' }),
        newData: expect.objectContaining({ status: 'published', is_verified: true, is_corrected: true }),
      }),
    );
  });

  it('entity word + publish=false → koreksi saja: pending_review, TANPA review, kontribusi tetap pending', async () => {
    const { contributionRepo, wordRepo, auditRepo } = makeDeps();
    const useCase = new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo as unknown as AuditLogRepository);
    const outcome = await useCase.execute({
      contributionId: '01CONTRIBULID0000000000000',
      actorId: ACTOR.userId,
      requestId: 'req-1',
      comment: 'perbaiki ejaan dulu',
      publish: false,
      input: { word: wordDto },
    });
    expect(outcome.status).toBe('pending');
    expect(wordRepo.updateWithRelations).toHaveBeenCalledWith(
      '01WORDULID000000000000000',
      expect.objectContaining({ status: 'pending_review', isVerified: false, isCorrected: true }),
      ACTOR.userId,
    );
    expect(contributionRepo.review).not.toHaveBeenCalled();
    expect(contributionRepo.applyChildCorrection).not.toHaveBeenCalled();
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'correct',
        newData: expect.objectContaining({ status: 'pending', is_verified: false, published: false }),
      }),
    );
  });

  it('entity example + publish=false → applyChildCorrection, TANPA review, kontribusi tetap pending', async () => {
    const { contributionRepo, wordRepo, auditRepo } = makeDeps();
    contributionRepo.findById = vi.fn().mockResolvedValue(makeContribution({ entityType: 'example' }));
    const useCase = new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo as unknown as AuditLogRepository);
    const outcome = await useCase.execute({
      contributionId: '01CONTRIBULID0000000000000',
      actorId: ACTOR.userId,
      comment: null,
      publish: false,
      input: { example: { sourceSentence: 'x', targetSentence: null, sourceType: null, notes: null } },
    });
    expect(outcome.status).toBe('pending');
    expect(contributionRepo.applyChildCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'example', entityId: '01WORDULID000000000000000' }),
    );
    expect(contributionRepo.review).not.toHaveBeenCalled();
  });

  it('entity_type body tidak cocok → VALIDATION_ERROR', async () => {
    const { contributionRepo, wordRepo, auditRepo } = makeDeps();
    const useCase = new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute({
        contributionId: '01CONTRIBULID0000000000000',
        actorId: ACTOR.userId,
        comment: null,
        publish: true,
        input: { example: { sourceSentence: 'x', targetSentence: null, sourceType: null, notes: null } },
      }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'entity_type', message: expect.stringContaining('word') }],
    });
  });

  it('sudah ada keputusan → 409 CONTRIBUTION_ALREADY_REVIEWED', async () => {
    const { contributionRepo, wordRepo, auditRepo } = makeDeps();
    contributionRepo.findById = vi.fn().mockResolvedValue(makeContribution({ status: 'approved' }));
    const useCase = new CorrectContributionUseCase(contributionRepo, wordRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute({ contributionId: '01CONTRIBULID0000000000000', actorId: ACTOR.userId, comment: null, publish: true, input: { word: wordDto } }),
    ).rejects.toMatchObject({ errorCode: 'CONTRIBUTION_ALREADY_REVIEWED', statusCode: 409 });
  });
});

describe('ListContributionsUseCase / GetContributionDetailUseCase', () => {
  it('list → passthrough filter ke repository', async () => {
    const { contributionRepo } = makeDeps();
    contributionRepo.list = vi.fn().mockResolvedValue({ items: [makeContribution()], nextCursor: null, hasMore: false });
    const useCase = new ListContributionsUseCase(contributionRepo);
    const page = await useCase.execute({ status: 'pending', limit: 20 });
    expect(contributionRepo.list).toHaveBeenCalledWith({ status: 'pending', limit: 20 });
    expect(page.items).toHaveLength(1);
  });

  it('detail word → entity dibaca via WordRepository (includeAllStatuses)', async () => {
    const { contributionRepo, wordRepo } = makeDeps();
    const useCase = new GetContributionDetailUseCase(contributionRepo, wordRepo);
    const detail = await useCase.execute('01CONTRIBULID0000000000000');
    expect(wordRepo.findDetailById).toHaveBeenCalledWith('01WORDULID000000000000000', { includeAllStatuses: true });
    expect(detail.entity).toMatchObject({ lemma: 'makatn' });
  });

  it('detail tidak ditemukan → 404 CONTRIBUTION_NOT_FOUND', async () => {
    const { contributionRepo, wordRepo } = makeDeps();
    contributionRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new GetContributionDetailUseCase(contributionRepo, wordRepo);
    await expect(useCase.execute('01CONTRIBULID0000000000000')).rejects.toMatchObject({
      errorCode: 'CONTRIBUTION_NOT_FOUND',
      statusCode: 404,
    });
  });
});
