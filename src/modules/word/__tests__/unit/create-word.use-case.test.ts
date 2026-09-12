import { describe, it, expect, vi } from 'vitest';
import { CreateWordUseCase } from '../../application/use-cases/create-word.use-case';
import type { WordRepository, MissingReferences } from '../../domain/repositories/word.repository';
import type { CreateWordDto } from '../../application/dto/create-word.dto';
import type { Word } from '../../domain/entities/word.entity';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

// "tidak ada referensi yang hilang" — dialectId false karena memang
// tidak dikirim (implementasi: tidak ada dialect → tidak dianggap hilang)
const NO_MISSING: MissingReferences = {
  languageId: false,
  dialectId: false,
  languages: [],
  wordClasses: [],
  categories: [],
  words: [],
  dialects: [],
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
    notes: null,
    wordType: 'word',
    status: 'draft',
    createdBy: '01TESTULIDUSERID00000000',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function makeDeps(missing: Partial<MissingReferences> = {}, duplicate = false) {
  const wordRepo = {
    saveWithRelations: vi.fn().mockImplementation((w: { status: string }) =>
      Promise.resolve(makeWord({ status: w.status as Word['status'] })),
    ),
    findDuplicate: vi.fn().mockResolvedValue(duplicate),
    findDetailById: vi.fn(),
    search: vi.fn(),
    findMissingReferences: vi.fn().mockResolvedValue({ ...NO_MISSING, ...missing }),
    listWordClasses: vi.fn(),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return { wordRepo, auditRepo, useCase: new CreateWordUseCase(wordRepo, auditRepo as unknown as AuditLogRepository) };
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

  it('contributor + status published → pending_review (masuk antrian review)', async () => {
    const { useCase } = makeDeps();
    const result = await useCase.execute(makeDto({ status: 'published' }), CONTRIBUTOR);
    expect(result.word.status).toBe('pending_review');
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

  it('duplikat lemma → warning, TETAP tersimpan', async () => {
    const { useCase } = makeDeps({}, /* duplicate */ true);
    const result = await useCase.execute(makeDto(), ADMIN);

    expect(result.word.lemma).toBe('makatn');
    expect(result.warnings).toEqual([
      { field: 'lemma', message: 'Lemma serupa sudah ada di bahasa ini' },
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
        newData: expect.objectContaining({ lemma: 'makatn', status: 'draft', word_type: 'word' }),
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
});
