import { describe, it, expect, vi } from 'vitest';
import { AddPronunciationUseCase } from '../../application/use-cases/add-pronunciation.use-case';
import { AddWordImageUseCase } from '../../application/use-cases/add-word-image.use-case';
import { AddExampleUseCase } from '../../application/use-cases/add-example.use-case';
import type { WordRepository, MissingReferences } from '../../domain/repositories/word.repository';
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

const WORD = { id: '01WORDULID000000000000000', lemma: 'makatn' } as { id: string; lemma: string };

const CONTRIBUTOR = { userId: '01CONTRIBUTORULID0000000', role: 'contributor', requestId: null };
const ADMIN = { userId: '01ADMINULID00000000000000', role: 'admin', requestId: null };

function makeDeps() {
  const wordRepo = {
    findById: vi.fn().mockResolvedValue(WORD),
    findMeaningById: vi.fn().mockResolvedValue({ id: '01MEANINGULID0000000000000', wordId: WORD.id }),
    addPronunciation: vi.fn().mockImplementation((_wid: string, data: { status: string; isVerified: boolean }) =>
      Promise.resolve({ id: '01PRONULID0000000000000000', status: data.status, isVerified: data.isVerified, isCorrected: false }),
    ),
    addWordImage: vi.fn().mockImplementation((_wid: string, data: { status: string; isVerified: boolean }) =>
      Promise.resolve({ id: '01IMGULID00000000000000000', status: data.status, isVerified: data.isVerified, isCorrected: false }),
    ),
    addExample: vi.fn().mockImplementation((_mid: string, data: { status: string; isVerified: boolean }) =>
      Promise.resolve({ id: '01EXULID000000000000000000', status: data.status, isVerified: data.isVerified, isCorrected: false }),
    ),
    findMissingReferences: vi.fn().mockResolvedValue(NO_MISSING),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return { wordRepo, auditRepo };
}

describe('AddPronunciationUseCase', () => {
  it('contributor → pending_review (masuk antrean)', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    const useCase = new AddPronunciationUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    const media = await useCase.execute(WORD.id, { notation: 'ipa', value: '/makatn/' }, CONTRIBUTOR);
    expect(media.status).toBe('pending_review');
    expect(media.isVerified).toBe(false);
    expect(wordRepo.addPronunciation).toHaveBeenCalledWith(
      WORD.id,
      expect.objectContaining({ status: 'pending_review', isVerified: false }),
      CONTRIBUTOR.userId,
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entityType: 'pronunciation' }),
    );
  });

  it('admin → langsung published + verified', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    const useCase = new AddPronunciationUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    const media = await useCase.execute(WORD.id, { notation: 'ipa', value: '/makatn/' }, ADMIN);
    expect(media.status).toBe('published');
    expect(media.isVerified).toBe(true);
  });

  it('kata tidak ditemukan → WORD_NOT_FOUND', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    wordRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new AddPronunciationUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    await expect(useCase.execute(WORD.id, { notation: 'ipa', value: '/x/' }, ADMIN)).rejects.toMatchObject({
      errorCode: 'WORD_NOT_FOUND',
      statusCode: 404,
    });
  });
});

describe('AddWordImageUseCase', () => {
  it('contributor → pending_review; admin → published', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    const useCase = new AddWordImageUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    const asContributor = await useCase.execute(
      WORD.id,
      { url: 'https://ik.imagekit.io/x/a.jpg', providerFileId: 'f1', isPrimary: false },
      CONTRIBUTOR,
    );
    expect(asContributor.status).toBe('pending_review');
    const asAdmin = await useCase.execute(
      WORD.id,
      { url: 'https://ik.imagekit.io/x/b.jpg', providerFileId: 'f2', isPrimary: true },
      ADMIN,
    );
    expect(asAdmin.status).toBe('published');
    expect(asAdmin.isVerified).toBe(true);
  });
});

describe('AddExampleUseCase', () => {
  it('makna tidak ditemukan → MEANING_NOT_FOUND', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    wordRepo.findMeaningById = vi.fn().mockResolvedValue(null);
    const useCase = new AddExampleUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute('01MEANINGULID0000000000000', { sourceLanguageId: '01L1', sourceSentence: 'x' }, ADMIN),
    ).rejects.toMatchObject({ errorCode: 'MEANING_NOT_FOUND', statusCode: 404 });
  });

  it('bahasa sumber tidak dikenal → VALIDATION_ERROR field source_language_id', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    wordRepo.findMissingReferences = vi.fn().mockResolvedValue({ ...NO_MISSING, languageId: true });
    const useCase = new AddExampleUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    await expect(
      useCase.execute('01MEANINGULID0000000000000', { sourceLanguageId: '01L1', sourceSentence: 'x' }, ADMIN),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'source_language_id', message: expect.stringContaining('Bahasa') }],
    });
  });

  it('contributor → pending_review + audit entityType example', async () => {
    const { wordRepo, auditRepo } = makeDeps();
    const useCase = new AddExampleUseCase(wordRepo, auditRepo as unknown as AuditLogRepository);
    const media = await useCase.execute(
      '01MEANINGULID0000000000000',
      { sourceLanguageId: '01LANGLANGUAGESMB0000000', sourceSentence: 'Kami makatn.' },
      CONTRIBUTOR,
    );
    expect(media.status).toBe('pending_review');
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entityType: 'example' }),
    );
  });
});
