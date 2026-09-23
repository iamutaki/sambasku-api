import { describe, it, expect, vi } from 'vitest';
import { UpdateWordUseCase } from '../../application/use-cases/update-word.use-case';
import type { WordRepository, MissingReferences } from '../../domain/repositories/word.repository';
import type { UpdateWordDto } from '../../application/dto/update-word.dto';
import type { Word, WordDetail } from '../../domain/entities/word.entity';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

const NO_MISSING: MissingReferences = {
  languageId: false,
  dialectId: false,
  languages: [],
  wordClasses: [],
  categories: [],
  words: [],
  dialects: [],
  inlineWordClasses: [],
  inlineLanguages: [],
  inlineCategories: [],
  inlineDialects: [],
};

const WORD_ID = '01WORDULID000000000000000';

function makeDto(overrides: Partial<UpdateWordDto> = {}): UpdateWordDto {
  return {
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'makatn',
    meanings: [
      {
        wordClassId: '01WORDCLASSESNOMINA000000',
        definition: 'Aktivitas memasukkan makanan ke mulut',
        orderIndex: 1,
        translations: [
          { languageId: '01LANGUAGESINDONESIA00000', translationText: 'makan', translationType: 'direct' },
        ],
      },
    ],
    wordType: 'word',
    categoryIds: [],
    relatedWords: [],
    status: 'published',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    id: WORD_ID,
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'makatn lama',
    notes: null,
    wordType: 'word',
    status: 'draft',
    isVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    isCorrected: false,
    createdBy: '01TESTULIDUSERID00000000',
    updatedBy: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    takedownReasonCode: null,
    takedownNote: null,
    takenDownBy: null,
    takenDownAt: null,
    meanings: [
      {
        id: '01MEANINGULID0000000000000',
        wordId: WORD_ID,
        wordClass: null,
        inheritedFromMeaningId: null,
        definition: 'definisi lama',
        isHaveDefinition: true,
        isHaveTranslation: true,
        orderIndex: 1,
        notes: null,
        translations: [],
        examples: [],
      },
    ],
    categories: [],
    pronunciations: [],
    images: [],
    audios: [],
    relatedWords: [],
    appearsIn: [],
    variants: [],
    verifier: null,
    creator: null,
    ...overrides,
  };
}

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: WORD_ID,
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'makatn',
    notes: null,
    wordType: 'word',
    status: 'published',
    isVerified: true,
    verifiedBy: null,
    verifiedAt: null,
    isCorrected: false,
    createdBy: '01TESTULIDUSERID00000000',
    updatedBy: '01TESTULIDUSERID00000000',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    takedownReasonCode: null,
    takedownNote: null,
    takenDownBy: null,
    takenDownAt: null,
    ...overrides,
  };
}

function makeDeps(
  opts: { existing?: WordDetail | null; duplicate?: boolean; updateResult?: Word | null } = {},
) {
  const wordRepo = {
    findDetailById: vi.fn().mockResolvedValue(opts.existing === undefined ? makeDetail() : opts.existing),
    findMissingReferences: vi.fn().mockResolvedValue(NO_MISSING),
    findDuplicate: vi.fn().mockResolvedValue(opts.duplicate ?? false),
    updateWithRelations: vi
      .fn()
      .mockImplementation((_id: string, w: { status: string; isVerified: boolean; isCorrected?: boolean }) =>
        Promise.resolve(
          opts.updateResult === undefined
            ? makeWord({ status: w.status as Word['status'], isVerified: w.isVerified, isCorrected: w.isCorrected ?? false })
            : opts.updateResult,
        ),
      ),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return {
    wordRepo,
    auditRepo,
    useCase: new UpdateWordUseCase(wordRepo, auditRepo as unknown as AuditLogRepository),
  };
}

const ADMIN = { userId: '01TESTULIDUSERID00000000', role: 'admin', requestId: 'req-1' };

describe('UpdateWordUseCase', () => {
  it('happy path: updateWithRelations membawa publication + is_corrected lama; audit update old→new', async () => {
    const { useCase, wordRepo, auditRepo } = makeDeps({
      existing: makeDetail({ isCorrected: true, lemma: 'makatn lama', status: 'pending_review' }),
    });

    const result = await useCase.execute(WORD_ID, makeDto(), ADMIN);

    expect(result.warnings).toEqual([]);
    expect(wordRepo.updateWithRelations).toHaveBeenCalledTimes(1);
    expect(wordRepo.updateWithRelations).toHaveBeenCalledWith(
      WORD_ID,
      expect.objectContaining({
        lemma: 'makatn',
        status: 'published', // admin + published → self-verified (Section 22)
        isVerified: true,
        isCorrected: true, // preserve - edit biasa TIDAK me-reset flag koreksi
      }),
      ADMIN.userId,
    );

    // audit membawa old_data (snapshot pra-edit) + new_data
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'word',
        entityId: WORD_ID,
        userId: ADMIN.userId,
        requestId: 'req-1',
        oldData: expect.objectContaining({ lemma: 'makatn lama', status: 'pending_review', meanings_count: 1 }),
        newData: expect.objectContaining({ lemma: 'makatn', status: 'published', meanings_count: 1 }),
      }),
    );
  });

  it('kata tidak ditemukan / soft-deleted → NotFoundError WORD_NOT_FOUND', async () => {
    const { useCase } = makeDeps({ existing: null });
    await expect(useCase.execute(WORD_ID, makeDto(), ADMIN)).rejects.toMatchObject({
      errorCode: 'WORD_NOT_FOUND',
    });
  });

  it('findDuplicate WAJIB dipanggil dengan excludeWordId = id kata yang diedit', async () => {
    const { useCase, wordRepo } = makeDeps();
    await useCase.execute(WORD_ID, makeDto(), ADMIN);
    expect(wordRepo.findDuplicate).toHaveBeenCalledWith('01LANGLANGUAGESMB0000000', 'makatn', WORD_ID);
  });

  it('duplikat lemma lain → warnings (bukan error) - perilaku sama dengan create', async () => {
    const { useCase } = makeDeps({ duplicate: true });
    const result = await useCase.execute(WORD_ID, makeDto(), ADMIN);
    expect(result.warnings).toEqual([
      { field: 'lemma', message: 'Lemma serupa sudah ada di bahasa ini' },
    ]);
  });

  it('status draft → tetap draft (kata published sengaja di-unpublish via edit)', async () => {
    const { useCase, wordRepo } = makeDeps();
    await useCase.execute(WORD_ID, makeDto({ status: 'draft' }), ADMIN);
    expect(wordRepo.updateWithRelations).toHaveBeenCalledWith(
      WORD_ID,
      expect.objectContaining({ status: 'draft', isVerified: false }),
      ADMIN.userId,
    );
  });

  it('has_component + word_type word → ValidationError (aturan silang create)', async () => {
    const { useCase } = makeDeps();
    await expect(
      useCase.execute(
        WORD_ID,
        makeDto({
          relatedWords: [{ wordId: '01WORDLAINULID00000000000', relationType: 'has_component' }],
        }),
        ADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'related_words', message: expect.stringContaining('has_component') }],
    });
  });

  it('kalah race (updateWithRelations null - kata ter-soft-delete di tengah) → 404', async () => {
    const { useCase } = makeDeps({ updateResult: null });
    await expect(useCase.execute(WORD_ID, makeDto(), ADMIN)).rejects.toMatchObject({
      errorCode: 'WORD_NOT_FOUND',
    });
  });

  it('referensi hilang → ValidationError dengan field path (mapMissingToDetails create)', async () => {
    const { wordRepo, useCase } = makeDeps();
    (wordRepo.findMissingReferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...NO_MISSING,
      languageId: true,
    });
    await expect(useCase.execute(WORD_ID, makeDto(), ADMIN)).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'language_id' }],
    });
  });
});
