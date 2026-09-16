import { describe, it, expect, vi } from 'vitest';
import { VerifyWordUseCase } from '../../application/use-cases/verify-word.use-case';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

function makeDeps(setVerifiedResult = true) {
  const wordRepo = {
    saveWithRelations: vi.fn(),
    findDuplicate: vi.fn(),
    findDetailById: vi.fn(),
    search: vi.fn(),
    findMissingReferences: vi.fn(),
    listWordClasses: vi.fn(),
    setVerified: vi.fn().mockResolvedValue(setVerifiedResult),
  } as unknown as WordRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  return { wordRepo, auditRepo, useCase: new VerifyWordUseCase(wordRepo, auditRepo as unknown as AuditLogRepository) };
}

describe('VerifyWordUseCase', () => {
  it('verify → setVerified(true) + audit action verify', async () => {
    const { useCase, wordRepo, auditRepo } = makeDeps();
    await useCase.execute({ wordId: '01JDWORDMAKATN0000000000A', verified: true, actorId: '01JDUSERADMIN00000000000000A', requestId: 'req-1' });

    expect(wordRepo.setVerified).toHaveBeenCalledWith(
      '01JDWORDMAKATN0000000000A',
      expect.objectContaining({ isVerified: true, verifiedBy: '01JDUSERADMIN00000000000000A' }),
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verify', newData: { is_verified: true }, requestId: 'req-1' }),
    );
  });

  it('unverify → audit action unverify', async () => {
    const { useCase, auditRepo } = makeDeps();
    await useCase.execute({ wordId: '01JDWORDMAKATN0000000000A', verified: false, actorId: '01JDUSERADMIN00000000000000A' });
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unverify', newData: { is_verified: false } }),
    );
  });

  it('kata tidak ditemukan → WORD_NOT_FOUND 404, tanpa audit', async () => {
    const { useCase, auditRepo } = makeDeps(false);
    await expect(
      useCase.execute({ wordId: '01JDWORDNGACAK00000000000X', verified: true, actorId: '01JDUSERADMIN00000000000000A' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND', statusCode: 404 });
    expect(auditRepo.record).not.toHaveBeenCalled();
  });
});
