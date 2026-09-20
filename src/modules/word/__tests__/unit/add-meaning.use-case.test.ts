import { describe, it, expect, vi } from 'vitest';
import { AddMeaningUseCase } from '../../application/use-cases/add-meaning.use-case';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { MeaningMedia } from '../../domain/entities/meaning.entity';

function makeDeps(wordExists = true) {
  const media: MeaningMedia = {
    id: '01MEANINGULID0000000000000',
    wordId: '01JDWORDMAKATN0000000000A',
    wordClassId: null,
    definition: 'definisi baru',
    orderIndex: 2,
    status: 'pending_review',
    isVerified: false,
    isCorrected: false,
  };
  const wordRepo = {
    findById: vi.fn().mockResolvedValue(wordExists ? { id: 'w', status: 'published' } : null),
    addMeaning: vi.fn().mockResolvedValue(media),
  } as unknown as WordRepository;
  const auditRepo = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogRepository;
  return { wordRepo, auditRepo, useCase: new AddMeaningUseCase(wordRepo, auditRepo), media };
}

const ACTOR = { userId: '01JDUSERKONTRIB0000000000A', role: 'contributor' };
const WORD_ID = '01JDWORDMAKATN0000000000A';
const DTO = {
  definition: 'definisi baru',
  translations: [{ languageId: '01JDSBSLANGIDN000000000000', translationText: 'baru', translationType: 'direct' }],
};

describe('AddMeaningUseCase', () => {
  it('kata ada → addMeaning dipanggil dengan publication dari role contributor, hasil diteruskan, audit tercatat', async () => {
    const { useCase, wordRepo, auditRepo, media } = makeDeps();
    const result = await useCase.execute(WORD_ID, DTO, ACTOR);

    expect(wordRepo.addMeaning).toHaveBeenCalledWith(
      WORD_ID,
      expect.objectContaining({ ...DTO, status: 'pending_review', isVerified: false }),
      ACTOR.userId,
    );
    expect(result).toBe(media);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'meaning', entityId: media.id, action: 'create' }),
    );
  });

  it('role admin → publication published + verified (resolveChildPublication)', async () => {
    const { useCase, wordRepo } = makeDeps();
    await useCase.execute(WORD_ID, DTO, { userId: '01JDUSERADMIN00000000000A', role: 'admin' });

    expect(wordRepo.addMeaning).toHaveBeenCalledWith(
      WORD_ID,
      expect.objectContaining({ status: 'published', isVerified: true }),
      '01JDUSERADMIN00000000000A',
    );
  });

  it('kata tidak ada → 404 WORD_NOT_FOUND, addMeaning TIDAK dipanggil', async () => {
    const { useCase, wordRepo } = makeDeps(false);
    await expect(useCase.execute(WORD_ID, DTO, ACTOR)).rejects.toMatchObject({
      errorCode: 'WORD_NOT_FOUND',
      statusCode: 404,
    });
    expect(wordRepo.addMeaning).not.toHaveBeenCalled();
  });
});
