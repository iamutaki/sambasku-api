import { describe, it, expect, vi } from 'vitest';
import { SoftDeleteWordUseCase } from '../../application/use-cases/soft-delete-word.use-case';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Word } from '../../domain/entities/word.entity';

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: '01JDWORDMAKATN0000000000A',
    languageId: '01U2ELANGSMB00000000000000',
    lemma: 'makatn',
    notes: null,
    wordType: 'word',
    status: 'published',
    isVerified: true,
    verifiedBy: '01JDUSERADMIN00000000000000A',
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    isCorrected: false,
    createdBy: '01JDUSERADMIN00000000000000A',
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    takedownReasonCode: null,
    takedownNote: null,
    takenDownBy: null,
    takenDownAt: null,
    ...overrides,
  };
}

function makeDeps(findByIdResult: Word | null = makeWord(), softDeleteResult = true) {
  const wordRepo = {
    saveWithRelations: vi.fn(),
    findDuplicate: vi.fn(),
    findDetailById: vi.fn(),
    findById: vi.fn().mockResolvedValue(findByIdResult),
    search: vi.fn(),
    findMissingReferences: vi.fn(),
    listWordClasses: vi.fn(),
    setVerified: vi.fn(),
    setPublished: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(softDeleteResult),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return { wordRepo, auditRepo, useCase: new SoftDeleteWordUseCase(wordRepo, auditRepo as unknown as AuditLogRepository) };
}

describe('SoftDeleteWordUseCase', () => {
  it('delete → softDelete(id, actorId) + audit action delete dengan old_data snapshot', async () => {
    const { useCase, wordRepo, auditRepo } = makeDeps();
    await useCase.execute({ wordId: '01JDWORDMAKATN0000000000A', actorId: '01JDUSERADMIN00000000000000A', requestId: 'req-1' });

    expect(wordRepo.softDelete).toHaveBeenCalledWith('01JDWORDMAKATN0000000000A', '01JDUSERADMIN00000000000000A');
    expect(auditRepo.record).toHaveBeenCalledWith({
      userId: '01JDUSERADMIN00000000000000A',
      action: 'delete',
      entityType: 'word',
      entityId: '01JDWORDMAKATN0000000000A',
      oldData: {
        lemma: 'makatn',
        word_type: 'word',
        language_id: '01U2ELANGSMB00000000000000',
        status: 'published',
        is_verified: true,
      },
      requestId: 'req-1',
    });
  });

  it('kata tidak ditemukan (atau sudah soft-deleted) → WORD_NOT_FOUND 404, tanpa softDelete & audit', async () => {
    const { useCase, wordRepo, auditRepo } = makeDeps(null);
    await expect(
      useCase.execute({ wordId: '01JDWORDNGACAK00000000000X', actorId: '01JDUSERADMIN00000000000000A' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND', statusCode: 404 });
    expect(wordRepo.softDelete).not.toHaveBeenCalled();
    expect(auditRepo.record).not.toHaveBeenCalled();
  });

  it('softDelete false (kalah race) → WORD_NOT_FOUND 404, tanpa audit', async () => {
    const { useCase, auditRepo } = makeDeps(makeWord(), false);
    await expect(
      useCase.execute({ wordId: '01JDWORDMAKATN0000000000A', actorId: '01JDUSERADMIN00000000000000A' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND', statusCode: 404 });
    expect(auditRepo.record).not.toHaveBeenCalled();
  });
});