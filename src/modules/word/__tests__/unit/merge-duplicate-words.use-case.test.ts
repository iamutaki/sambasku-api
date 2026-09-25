import { describe, it, expect, vi } from 'vitest';
import { MergeDuplicateWordsUseCase } from '../../application/use-cases/merge-duplicate-words.use-case';
import {
  pickDefaultKeepWordId,
} from '../../application/use-cases/list-duplicate-words.use-case';
import type { DuplicateWordItem, WordRepository } from '../../domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Word } from '../../domain/entities/word.entity';

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: '01WORDKEEP000000000000000',
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'lading',
    lemmaAllowsComma: false,
    notes: null,
    wordType: 'word',
    usageLabels: [],
    status: 'published',
    isVerified: true,
    verifiedBy: null,
    verifiedAt: null,
    isCorrected: false,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2024-01-01'),
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

function item(partial: Partial<DuplicateWordItem> & Pick<DuplicateWordItem, 'id'>): DuplicateWordItem {
  return {
    lemma: 'lading',
    languageId: '01LANGLANGUAGESMB0000000',
    languageCode: 'SBS',
    wordType: 'word',
    status: 'draft',
    isVerified: false,
    meaningsCount: 1,
    createdAt: new Date('2024-01-02'),
    ...partial,
  };
}

describe('pickDefaultKeepWordId', () => {
  it('utamakan published+verified, lalu published tertua', () => {
    const keep = pickDefaultKeepWordId([
      item({ id: '01DRAFT', status: 'draft', createdAt: new Date('2023-01-01') }),
      item({
        id: '01PUBOLD',
        status: 'published',
        isVerified: false,
        createdAt: new Date('2024-01-01'),
      }),
      item({
        id: '01PUBVER',
        status: 'published',
        isVerified: true,
        createdAt: new Date('2024-06-01'),
      }),
    ]);
    expect(keep).toBe('01PUBVER');
  });
});

describe('MergeDuplicateWordsUseCase', () => {
  it('tolak merge_word_ids kosong', async () => {
    const wordRepo = {
      findById: vi.fn(),
      mergeDuplicateWords: vi.fn(),
    } as unknown as WordRepository;
    const auditRepo = { record: vi.fn() } as unknown as AuditLogRepository;
    const useCase = new MergeDuplicateWordsUseCase(wordRepo, auditRepo);

    await expect(
      useCase.execute({
        keepWordId: '01WORDKEEP000000000000000',
        mergeWordIds: ['01WORDKEEP000000000000000'],
        actorId: '01ADMIN',
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('merge sukses + audit', async () => {
    const wordRepo = {
      findById: vi.fn().mockResolvedValue(makeWord()),
      mergeDuplicateWords: vi.fn().mockResolvedValue({
        keepWordId: '01WORDKEEP000000000000000',
        mergedWordIds: ['01WORDSRC000000000000000'],
      }),
    } as unknown as WordRepository;
    const auditRepo = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;
    const useCase = new MergeDuplicateWordsUseCase(wordRepo, auditRepo);

    const result = await useCase.execute({
      keepWordId: '01WORDKEEP000000000000000',
      mergeWordIds: ['01WORDSRC000000000000000'],
      actorId: '01ADMIN',
      requestId: 'req-1',
    });

    expect(result.mergedWordIds).toEqual(['01WORDSRC000000000000000']);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'merge',
        entityType: 'word',
        entityId: '01WORDKEEP000000000000000',
      }),
    );
  });

  it('lemma mismatch → BadRequest', async () => {
    const wordRepo = {
      findById: vi.fn().mockResolvedValue(makeWord()),
      mergeDuplicateWords: vi.fn().mockRejectedValue(new Error('LEMMA_MISMATCH')),
    } as unknown as WordRepository;
    const useCase = new MergeDuplicateWordsUseCase(wordRepo, {
      record: vi.fn(),
    } as unknown as AuditLogRepository);

    await expect(
      useCase.execute({
        keepWordId: '01WORDKEEP000000000000000',
        mergeWordIds: ['01WORDSRC000000000000000'],
        actorId: '01ADMIN',
      }),
    ).rejects.toMatchObject({ errorCode: 'WORD_MERGE_LEMMA_MISMATCH' });
  });
});
