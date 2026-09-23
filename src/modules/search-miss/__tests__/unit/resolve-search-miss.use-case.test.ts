import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import { ResolveSearchMissUseCase } from '../../application/use-cases/resolve-search-miss.use-case';
import type { SearchMiss } from '../../domain/entities/search-miss.entity';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { LanguageRepository } from '@/modules/language/domain/repositories/language.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

const missLemma: SearchMiss = {
  id: '01JDSEARCHMISS0000000000001',
  term: 'kete\'',
  direction: 'lemma',
  hitCount: 3,
  lastSearchedAt: new Date('2026-09-16T10:00:00Z'),
  isFulfilled: false,
  isVisible: true,
  createdAt: new Date('2026-09-16T09:00:00Z'),
};

const missTranslation: SearchMiss = {
  ...missLemma,
  id: '01JDSEARCHMISS0000000000002',
  term: 'makan',
  direction: 'translation',
};

const publishedWord = {
  id: '01WORDULIDTARGET0000000000',
  languageId: '01E2ELANGSMB000000000000',
  lemma: 'ketek',
  notes: null,
  wordType: 'word' as const,
  status: 'published' as const,
  isVerified: true,
  verifiedBy: null,
  verifiedAt: null,
  isCorrected: false,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
};

describe('ResolveSearchMissUseCase', () => {
  let missRepo: { findById: ReturnType<typeof vi.fn> };
  let wordRepo: {
    findById: ReturnType<typeof vi.fn>;
    addVariant: ReturnType<typeof vi.fn>;
    createSynonymWord: ReturnType<typeof vi.fn>;
    addTranslation: ReturnType<typeof vi.fn>;
  };
  let languageRepo: { listLanguages: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let uc: ResolveSearchMissUseCase;

  beforeEach(() => {
    missRepo = {
      findById: vi.fn(),
    };
    wordRepo = {
      findById: vi.fn().mockResolvedValue(publishedWord),
      addVariant: vi.fn().mockResolvedValue({ id: '01VARIANT00000000000000001', form: "kete'", variantType: 'alternative' }),
      createSynonymWord: vi.fn().mockResolvedValue({ id: '01WORDSYN00000000000000001', lemma: "kete'" }),
      addTranslation: vi.fn().mockResolvedValue({
        meaningId: '01MEANING00000000000000001',
        languageId: '01E2ELANGIDN000000000000',
        translationText: 'makan',
      }),
    };
    languageRepo = {
      listLanguages: vi.fn().mockResolvedValue([
        { id: '01E2ELANGIDN000000000000', code: 'id', name: 'Indonesia' },
      ]),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    uc = new ResolveSearchMissUseCase(
      missRepo as unknown as SearchMissRepository,
      wordRepo as unknown as WordRepository,
      languageRepo as unknown as LanguageRepository,
      audit as unknown as AuditLogRepository,
    );
  });

  it('miss tidak ada → 404', async () => {
    missRepo.findById.mockResolvedValue(null);
    await expect(
      uc.execute({
        missId: missLemma.id,
        actorId: 'actor',
        action: 'variant',
        wordId: publishedWord.id,
      }),
    ).rejects.toMatchObject({ errorCode: 'SEARCH_MISS_NOT_FOUND' });
  });

  it('kata tidak ada → 404', async () => {
    missRepo.findById.mockResolvedValue(missLemma);
    wordRepo.findById.mockResolvedValue(null);
    await expect(
      uc.execute({
        missId: missLemma.id,
        actorId: 'actor',
        action: 'variant',
        wordId: publishedWord.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('variant pada lemma → addVariant + audit + fulfilled', async () => {
    missRepo.findById
      .mockResolvedValueOnce(missLemma)
      .mockResolvedValueOnce({ ...missLemma, isFulfilled: true });

    const result = await uc.execute({
      missId: missLemma.id,
      actorId: 'actor1',
      action: 'variant',
      wordId: publishedWord.id,
      requestId: 'req1',
    });

    expect(wordRepo.addVariant).toHaveBeenCalledWith(
      publishedWord.id,
      expect.objectContaining({ form: "kete'", variantType: 'alternative' }),
      'actor1',
    );
    expect(result.variantId).toBe('01VARIANT00000000000000001');
    expect(result.miss.isFulfilled).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        newData: expect.objectContaining({ resolved_as: 'variant' }),
      }),
    );
  });

  it('variant pada translation miss → ValidationError', async () => {
    missRepo.findById.mockResolvedValue(missTranslation);
    await expect(
      uc.execute({
        missId: missTranslation.id,
        actorId: 'actor',
        action: 'variant',
        wordId: publishedWord.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(wordRepo.addVariant).not.toHaveBeenCalled();
  });

  it('synonym → createSynonymWord', async () => {
    missRepo.findById
      .mockResolvedValueOnce(missLemma)
      .mockResolvedValueOnce({ ...missLemma, isFulfilled: true });

    const result = await uc.execute({
      missId: missLemma.id,
      actorId: 'actor1',
      action: 'synonym',
      wordId: publishedWord.id,
    });

    expect(wordRepo.createSynonymWord).toHaveBeenCalledWith(
      publishedWord.id,
      "kete'",
      'actor1',
      { searchMissId: missLemma.id },
    );
    expect(result.createdWordId).toBe('01WORDSYN00000000000000001');
  });

  it('translation → addTranslation ke bahasa id', async () => {
    missRepo.findById
      .mockResolvedValueOnce(missTranslation)
      .mockResolvedValueOnce({ ...missTranslation, isFulfilled: true });

    await uc.execute({
      missId: missTranslation.id,
      actorId: 'actor1',
      action: 'translation',
      wordId: publishedWord.id,
    });

    expect(wordRepo.addTranslation).toHaveBeenCalledWith(
      publishedWord.id,
      expect.objectContaining({
        languageId: '01E2ELANGIDN000000000000',
        translationText: 'makan',
      }),
      'actor1',
    );
  });
});
