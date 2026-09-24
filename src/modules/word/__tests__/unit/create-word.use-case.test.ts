import { describe, it, expect, vi } from 'vitest';
import { CreateWordUseCase } from '../../application/use-cases/create-word.use-case';
import type { WordRepository, MissingReferences } from '../../domain/repositories/word.repository';
import type { CreateWordDto } from '../../application/dto/create-word.dto';
import type { Word } from '../../domain/entities/word.entity';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

// "tidak ada referensi yang hilang" - dialectId false karena memang
// tidak dikirim (implementasi: tidak ada dialect → tidak dianggap hilang)
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

function makeDto(overrides: Partial<CreateWordDto> = {}): CreateWordDto {
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
    usageLabels: [],
    categoryIds: [],
    relatedWords: [],
    status: 'draft',
    ...overrides,
  };
}

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: '01WORDULID000000000000000',
    languageId: '01LANGLANGUAGESMB0000000',
    lemma: 'makatn',
    lemmaAllowsComma: false,
    notes: null,
    wordType: 'word',
    usageLabels: [],
    status: 'draft',
    isVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    isCorrected: false,
    createdBy: '01TESTULIDUSERID00000000',
    updatedBy: null,
    createdAt: new Date(),
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

function makeDeps(missing: Partial<MissingReferences> = {}, duplicate = false, inlineDuplicate = false) {
  const wordRepo = {
    saveWithRelations: vi.fn().mockImplementation((w: { status: string; isVerified: boolean }) =>
      Promise.resolve(makeWord({ status: w.status as Word['status'], isVerified: w.isVerified })),
    ),
    saveWithInlineRelations: vi
      .fn()
      .mockImplementation((w: { status: string; isVerified: boolean }, _a: string, related: unknown[]) =>
        Promise.resolve({
          word: makeWord({ status: w.status as Word['status'], isVerified: w.isVerified }),
          inlineCreatedWords: (related as { inlineWord: { lemma: string; status: string; isVerified: boolean; meanings: unknown[] } }[]).map(
            (r, i) => ({
              id: `01INLINEULID000000000000${String(i).padStart(2, '0')}`,
              lemma: r.inlineWord.lemma,
              relationType: 'synonym',
              wordType: 'word',
              status: r.inlineWord.status as Word['status'],
              isVerified: r.inlineWord.isVerified,
              meaningsCount: r.inlineWord.meanings.length,
              inheritedMeaningsCount: 1,
              overriddenMeaningsCount: 0,
            }),
          ),
        }),
      ),
    findDuplicate: vi.fn().mockImplementation((_lang: string, lemma: string) =>
      Promise.resolve(inlineDuplicate ? lemma === 'ngamakn' : duplicate),
    ),
    findById: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(makeWord({ id, status: 'published', isVerified: true })),
    ),
    publishOrMergeMeanings: vi.fn().mockResolvedValue(null),
    findDetailById: vi.fn(),
    search: vi.fn(),
    findMissingReferences: vi.fn().mockResolvedValue({ ...NO_MISSING, ...missing }),
    listWordClasses: vi.fn(),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  const searchMissRepo = {
    findById: vi.fn().mockResolvedValue(null),
    record: vi.fn(),
    list: vi.fn(),
    dismiss: vi.fn(),
  };
  return {
    wordRepo,
    auditRepo,
    searchMissRepo,
    useCase: new CreateWordUseCase(
      wordRepo,
      auditRepo as unknown as AuditLogRepository,
      searchMissRepo as never,
    ),
  };
}

const ADMIN = { userId: '01TESTULIDUSERID00000000', role: 'admin' };
const CONTRIBUTOR = { userId: '01TESTULIDUSERID00000000', role: 'contributor' };

describe('CreateWordUseCase', () => {
  it('admin + status published → langsung published', async () => {
    const { useCase, wordRepo } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'published' }), ADMIN);
    expect(result.word.status).toBe('published');
    expect(wordRepo.saveWithRelations).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
      ADMIN.userId,
    );
  });

  it('contributor + status published → tayang, belum terverifikasi', async () => {
    const { useCase, wordRepo } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'published' }), CONTRIBUTOR);
    expect(result.word.status).toBe('published');
    expect(result.word.isVerified).toBe(false);
    expect(wordRepo.saveWithRelations).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', isVerified: false }),
      CONTRIBUTOR.userId,
    );
  });

  it('reviewer + status published → langsung published + self-verified', async () => {
    const { useCase } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'published' }), {
      userId: '01TESTULIDUSERID00000000',
      role: 'reviewer',
    });
    expect(result.word.status).toBe('published');
    expect(result.word.isVerified).toBe(true);
  });

  it('admin + status published → tayang dan self-verified (is_verified true)', async () => {
    const { useCase } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'published' }), ADMIN);
    expect(result.word.status).toBe('published');
    expect(result.word.isVerified).toBe(true);
  });

  it('status draft tetap draft untuk role apa pun', async () => {
    const { useCase } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'draft' }), CONTRIBUTOR);
    expect(result.word.status).toBe('draft');
  });

  it('referensi tidak dikenal → VALIDATION_ERROR dengan field bermakna', async () => {
    const { useCase } = makeDeps({ languageId: true, wordClasses: ['01WORDCLASSESNOMINA000000'] });

    await expect(useCase.execute(makeDto(), ADMIN)).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
      details: [
        { field: 'language_id', message: 'Bahasa tidak ditemukan' },
        { field: 'meanings.0.word_class_id', message: expect.stringContaining('Kelas kata') },
      ],
    });
  });

  it('duplikat lemma (draft) → warning gabung saat tayang, TETAP tersimpan', async () => {
    const { useCase } = makeDeps({}, /* duplicate */ true);
    const result = await useCase.execute(makeDto(), ADMIN);

    expect(result.word.lemma).toBe('makatn');
    expect(result.warnings).toEqual([
      {
        field: 'lemma',
        message:
          'Lemma ini sudah ada. Saat ditayangkan, makna digabung otomatis ke entri yang sudah tayang.',
      },
    ]);
  });

  it('duplikat lemma + published → auto-merge ke kembaran tayang', async () => {
    const { useCase, wordRepo } = makeDeps({}, true);
    const keptId = '01WORDULIDKEPT00000000000';
    (wordRepo.publishOrMergeMeanings as ReturnType<typeof vi.fn>).mockResolvedValue({
      wordId: keptId,
      mergedIntoWordId: keptId,
    });
    (wordRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeWord({ id: keptId, status: 'published', isVerified: true }),
    );

    const result = await useCase.execute(makeDto({ status: 'published' }), ADMIN);

    expect(wordRepo.publishOrMergeMeanings).toHaveBeenCalled();
    expect(result.word.id).toBe(keptId);
    expect(result.warnings).toEqual([
      {
        field: 'lemma',
        message:
          'Lemma ini sudah ada. Makna baru digabung otomatis ke entri yang sudah tayang.',
      },
    ]);
  });

  it('duplikat lemma + published tanpa kembaran tayang → arahkan tab Duplikasi', async () => {
    const { useCase, wordRepo } = makeDeps({}, true);
    (wordRepo.publishOrMergeMeanings as ReturnType<typeof vi.fn>).mockResolvedValue({
      wordId: '01WORDULID000000000000000',
      mergedIntoWordId: null,
    });
    const result = await useCase.execute(makeDto({ status: 'published' }), ADMIN);

    expect(result.warnings).toEqual([
      {
        field: 'lemma',
        message:
          'Lemma ini sudah ada dan entri ini sudah tayang. Selesaikan di tab Duplikasi.',
      },
    ]);
  });

  it('tanpa duplikat → tidak ada field warnings', async () => {
    const { useCase } = makeDeps();
    const result = await useCase.execute(makeDto(), ADMIN);
    expect(result.warnings).toEqual([]);
  });

  it('mencatat audit trail word.create dengan requestId dari context', async () => {
    const { useCase, auditRepo } = makeDeps();
    await useCase.execute(makeDto(), { ...ADMIN, requestId: 'req-789' });

    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityType: 'word',
        entityId: '01WORDULID000000000000000',
        newData: expect.objectContaining({ lemma: 'makatn', status: 'draft', word_type: 'word', is_verified: false }),
        requestId: 'req-789',
      }),
    );
  });

  it('related_words ter-passing ke repository dengan tipe relasinya', async () => {
    const { useCase, wordRepo } = makeDeps();
    await useCase.execute(
      makeDto({
        wordType: 'peribahasa',
        relatedWords: [
          { wordId: '01WORDULIDMIYANG000000000', relationType: 'has_component' },
          { wordId: '01WORDULIDRABONG000000000', relationType: 'has_component' },
        ],
      }),
      ADMIN,
    );

    expect(wordRepo.saveWithRelations).toHaveBeenCalledWith(
      expect.objectContaining({
        wordType: 'peribahasa',
        relatedWords: [
          { wordId: '01WORDULIDMIYANG000000000', relationType: 'has_component' },
          { wordId: '01WORDULIDRABONG000000000', relationType: 'has_component' },
        ],
      }),
      ADMIN.userId,
    );
  });

  it('EDGE CASE: has_component pada word_type "word" → VALIDATION_ERROR (aturan silang)', async () => {
    const { useCase } = makeDeps();
    await expect(
      useCase.execute(
        makeDto({ wordType: 'word', relatedWords: [{ wordId: '01WORDULIDMIYANG000000000', relationType: 'has_component' }] }),
        ADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
      details: [{ field: 'related_words', message: expect.stringContaining('has_component') }],
    });
  });

  it('Form B inherit=true → makna sinonim = salinan induk, provenance mengarah benar', async () => {
    const { useCase, wordRepo } = makeDeps();
    const dto = makeDto({
      meanings: [
        {
          wordClassId: '01WORDCLASSESNOMINA000000',
          definition: 'Makna ke-1',
          orderIndex: 1,
          translations: [
            { languageId: '01LANGUAGESINDONESIA00000', translationText: 'makan', translationType: 'direct' },
          ],
        },
        {
          wordClassId: '01WORDCLASSESNOMINA000000',
          definition: 'Makna ke-2',
          orderIndex: 2,
          translations: [
            { languageId: '01LANGUAGESINDONESIA00000', translationText: 'konsumsi', translationType: 'direct' },
          ],
        },
      ],
      relatedWords: [{ relationType: 'synonym', word: { lemma: 'ngamakn', inheritMeanings: true } }],
    });

    const result = await useCase.execute(dto, ADMIN);
    expect(result.inlineCreatedWords).toHaveLength(1);
    expect(result.inlineCreatedWords[0]).toMatchObject({ lemma: 'ngamakn', relationType: 'synonym' });

    const saved = (wordRepo.saveWithInlineRelations as ReturnType<typeof vi.fn>).mock.calls[0];
    const [parentToSave, , resolved] = saved as [unknown, string, { inlineWord: Record<string, unknown>; inheritedFrom: Record<number, number>; inheritedMeaningsCount: number; overriddenMeaningsCount: number }[]];
    expect((parentToSave as { lemma: string }).lemma).toBe('makatn');
    expect(resolved).toHaveLength(1);
    // salinan penuh + provenance: makna 0 & 1 hasil salin (belum di-override)
    expect(resolved[0].inlineWord.meanings).toHaveLength(2);
    expect(resolved[0].inlineWord.meanings).toEqual(dto.meanings);
    expect(resolved[0].inheritedFrom).toEqual({ 0: 0, 1: 1 });
    expect(resolved[0].inheritedMeaningsCount).toBe(2);
    expect(resolved[0].overriddenMeaningsCount).toBe(0);
  });

  it('Form B override satu-per-satu: HANYA makna yang di-override berubah (translate-and-replace)', async () => {
    const { useCase, wordRepo } = makeDeps();
    const dto = makeDto({
      meanings: [
        {
          wordClassId: '01WORDCLASSESNOMINA000000',
          definition: 'Makna ke-1',
          orderIndex: 1,
          translations: [
            { languageId: '01LANGUAGESINDONESIA00000', translationText: 'makan', translationType: 'direct' },
          ],
        },
        {
          wordClassId: '01WORDCLASSESNOMINA000000',
          definition: 'Makna ke-2',
          orderIndex: 2,
          translations: [
            { languageId: '01LANGUAGESINDONESIA00000', translationText: 'konsumsi', translationType: 'direct' },
          ],
        },
      ],
      relatedWords: [
        {
          relationType: 'synonym',
          word: {
            lemma: 'ngamakn',
            inheritMeanings: true,
            meaningOverrides: [
              {
                meaningIndex: 0,
                definition: 'Mengunyah makanan',
                translations: [
                  { languageId: '01LANGUAGESINDONESIA00000', translationText: 'kunyah', translationType: 'direct' },
                ],
              },
            ],
          },
        },
      ],
    });

    await useCase.execute(dto, ADMIN);
    const [, , resolved] = (wordRepo.saveWithInlineRelations as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      string,
      { inlineWord: { meanings: { definition: string; translations: { translationText: string }[] }[] }; inheritedFrom: Record<number, number>; inheritedMeaningsCount: number; overriddenMeaningsCount: number }[],
    ];

    // makna ke-0 di-override → provenance NULL; makna ke-1 tetap ikut induk
    expect(resolved[0].inheritedFrom).toEqual({ 1: 1 });
    expect(resolved[0].inheritedMeaningsCount).toBe(2);
    expect(resolved[0].overriddenMeaningsCount).toBe(1);
    expect(resolved[0].inlineWord.meanings).toHaveLength(2);
    expect(resolved[0].inlineWord.meanings[0]).toEqual({
      wordClassId: '01WORDCLASSESNOMINA000000',
      definition: 'Mengunyah makanan',
      orderIndex: 1,
      translations: [{ languageId: '01LANGUAGESINDONESIA00000', translationText: 'kunyah', translationType: 'direct' }],
    });
  });

  it('Form B inherit=false + meanings penuh → dipakai apa adanya, tanpa provenance', async () => {
    const { useCase, wordRepo } = makeDeps();
    const dto = makeDto({
      relatedWords: [
        {
          relationType: 'synonym',
          word: {
            lemma: 'badikn',
            inheritMeanings: false,
            meanings: [
              {
                wordClassId: '01WORDCLASSESNOMINA000000',
                definition: 'Menghabisi makanan sisa',
                orderIndex: 1,
                translations: [
                  { languageId: '01LANGUAGESINDONESIA00000', translationText: 'menghabiskan', translationType: 'direct' },
                ],
              },
            ],
          },
        },
      ],
    });

    await useCase.execute(dto, ADMIN);
    const [, , resolved] = (wordRepo.saveWithInlineRelations as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      string,
      { inlineWord: { meanings: unknown[] }; inheritedFrom: Record<number, number>; inheritedMeaningsCount: number; overriddenMeaningsCount: number }[],
    ];
    expect(resolved[0].inlineWord.meanings).toHaveLength(1);
    expect(resolved[0].inheritedFrom).toEqual({});
    expect(resolved[0].inheritedMeaningsCount).toBe(0);
    expect(resolved[0].overriddenMeaningsCount).toBe(0);
  });

  it('duplikat lemma inline dengan kata existing → warning per-kata, tetap tersimpan', async () => {
    const { useCase } = makeDeps({}, false, /* inlineDuplicate */ true);
    const result = await useCase.execute(
      makeDto({ relatedWords: [{ relationType: 'synonym', word: { lemma: 'ngamakn' } }] }),
      ADMIN,
    );
    expect(result.inlineWarnings[0]).toEqual([
      {
        field: 'related_words.0.word.lemma',
        message:
          'Lemma ini sudah ada. Saat ditayangkan, makna digabung otomatis ke entri yang sudah tayang.',
      },
    ]);
  });

  it('audit trail: SATU entri per entitas yang dibuat (induk + tiap kata inline)', async () => {
    const { useCase, auditRepo } = makeDeps();
    await useCase.execute(
      makeDto({
        status: 'published',
        relatedWords: [{ relationType: 'synonym', word: { lemma: 'ngamakn' } }],
      }),
      { ...CONTRIBUTOR, requestId: 'req-42' },
    );

    expect(auditRepo.record).toHaveBeenCalledTimes(2);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entityType: 'word', requestId: 'req-42' }),
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityType: 'word',
        entityId: '01INLINEULID00000000000000',
        newData: expect.objectContaining({
          lemma: 'ngamakn',
          inherited_meanings_count: 1,
          overridden_meanings_count: 0,
        }),
        requestId: 'req-42',
      }),
    );
  });

  it('Role matrix: contributor + published → induk dan inline tayang, belum terverifikasi', async () => {
    const { useCase, wordRepo } = makeDeps();
    await useCase.execute(
      makeDto({
        status: 'published',
        relatedWords: [
          { relationType: 'synonym', word: { lemma: 'ngamakn', status: 'draft' } },
          { relationType: 'synonym', word: { lemma: 'badikn' } },
        ],
      }),
      CONTRIBUTOR,
    );

    expect(wordRepo.saveWithInlineRelations).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', isVerified: false }),
      CONTRIBUTOR.userId,
      [
        expect.objectContaining({
          // status Form B default = status body induk, TAPI bisa di-override per Form B
          inlineWord: expect.objectContaining({ lemma: 'ngamakn', status: 'draft', isVerified: false }),
        }),
        // default ikut induk: contributor + published → tayang, belum dicek
        expect.objectContaining({
          inlineWord: expect.objectContaining({ lemma: 'badikn', status: 'published', isVerified: false }),
        }),
      ],
    );
  });

  it('Form B referensi kata inline hilang → VALIDATION_ERROR dengan field path related_words.N.word.*', async () => {
    const { useCase } = makeDeps({
      inlineWordClasses: ['01WORDCLASSESNOMINA000000'],
      inlineLanguages: ['01LANGUAGESINDONESIA00000'],
    });
    await expect(
      useCase.execute(
        makeDto({
          relatedWords: [
            {
              relationType: 'synonym',
              word: {
                lemma: 'ngamakn',
                meaningOverrides: [
                  {
                    meaningIndex: 0,
                    wordClassId: '01WORDCLASSESNOMINA000000',
                    translations: [
                      { languageId: '01LANGUAGESINDONESIA00000', translationText: 'kunyah', translationType: 'direct' },
                    ],
                  },
                ],
              },
            },
          ],
        }),
        ADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [
        { field: 'related_words.0.word.meaning_overrides.0.word_class_id', message: expect.stringContaining('Kelas kata') },
        { field: 'related_words.0.word.meaning_overrides.0.translations.0.language_id', message: expect.stringContaining('Bahasa') },
      ],
    });
  });
});

describe('CreateWordUseCase - search_miss provenance (12-api)', () => {
  const MISS_ID = '01JDSEARCHMISS0000000000000';

  it('search_miss_id valid (lemma) → lolos + searchMissId di result', async () => {
    const { useCase, searchMissRepo, wordRepo } = makeDeps();
    searchMissRepo.findById = vi.fn().mockResolvedValue({
      id: MISS_ID,
      term: 'makatn',
      direction: 'lemma',
      hitCount: 1,
      lastSearchedAt: new Date(),
      isFulfilled: false,
      isVisible: false,
      createdAt: new Date(),
    });
    const result = await useCase.execute(makeDto({ searchMissId: MISS_ID, lemma: 'Makatn' }), ADMIN);
    expect(result.searchMissId).toBe(MISS_ID);
    expect(wordRepo.saveWithRelations).toHaveBeenCalledWith(
      expect.objectContaining({ searchMissId: MISS_ID }),
      ADMIN.userId,
    );
  });

  it('search_miss_id tidak ada → 404 SEARCH_MISS_NOT_FOUND', async () => {
    const { useCase } = makeDeps();
    await expect(useCase.execute(makeDto({ searchMissId: MISS_ID }), ADMIN)).rejects.toMatchObject({
      errorCode: 'SEARCH_MISS_NOT_FOUND',
    });
  });

  it('lemma tidak cocok miss term → 400 SEARCH_MISS_TERM_MISMATCH', async () => {
    const { useCase, searchMissRepo } = makeDeps();
    searchMissRepo.findById = vi.fn().mockResolvedValue({
      id: MISS_ID,
      term: 'kalintiak',
      direction: 'lemma',
      hitCount: 1,
      lastSearchedAt: new Date(),
      isFulfilled: false,
      isVisible: false,
      createdAt: new Date(),
    });
    await expect(useCase.execute(makeDto({ searchMissId: MISS_ID, lemma: 'makatn' }), ADMIN)).rejects.toMatchObject({
      errorCode: 'SEARCH_MISS_TERM_MISMATCH',
    });
  });

  it('direction=translation: soft-check teks terjemahan pertama', async () => {
    const { useCase, searchMissRepo } = makeDeps();
    searchMissRepo.findById = vi.fn().mockResolvedValue({
      id: MISS_ID,
      term: 'makan',
      direction: 'translation',
      hitCount: 1,
      lastSearchedAt: new Date(),
      isFulfilled: false,
      isVisible: false,
      createdAt: new Date(),
    });
    const result = await useCase.execute(makeDto({ searchMissId: MISS_ID, lemma: 'makatn' }), ADMIN);
    expect(result.searchMissId).toBe(MISS_ID);

    await expect(
      useCase.execute(
        makeDto({
          searchMissId: MISS_ID,
          meanings: [
            {
              wordClassId: '01WORDCLASSESNOMINA000000',
              definition: 'x',
              orderIndex: 1,
              translations: [
                { languageId: '01LANGUAGESINDONESIA00000', translationText: 'minum', translationType: 'direct' },
              ],
            },
          ],
        }),
        ADMIN,
      ),
    ).rejects.toMatchObject({ errorCode: 'SEARCH_MISS_TERM_MISMATCH' });
  });
});
