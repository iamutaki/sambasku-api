import { describe, expect, it, vi } from 'vitest';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { BulkCreateBlocklistWordsUseCase } from '../../application/use-cases/bulk-create-blocklist-words.use-case';
import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';

const ACTOR = '01JDACTORADMIN00000000000A';

function makeDeps(existing: string[] = []) {
  const repo = {
    findActiveWordSet: vi.fn().mockResolvedValue(new Set(existing)),
    createMany: vi.fn().mockImplementation(async (items: { word: string }[]) => ({
      count: items.length,
      firstId: '01JDBLOCKLISTWORD00000000A',
    })),
  } as unknown as CommentBlocklistRepository;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;
  return { repo, auditRepo, useCase: new BulkCreateBlocklistWordsUseCase(repo, auditRepo) };
}

describe('BulkCreateBlocklistWordsUseCase', () => {
  it('menyimpan kata baru dan mengabaikan yang sudah aktif', async () => {
    const { useCase, repo, auditRepo } = makeDeps(['lorem']);
    const result = await useCase.execute({
      words: ['Lorem', 'Ipsum', ' dolo'],
      actorId: ACTOR,
    });

    expect(repo.createMany).toHaveBeenCalledWith([
      { word: 'ipsum', createdBy: ACTOR },
      { word: 'dolo', createdBy: ACTOR },
    ]);
    expect(result).toEqual({ createdCount: 2, skippedCount: 1, invalidCount: 0 });
    expect(auditRepo.record).toHaveBeenCalledOnce();
  });

  it('semua sudah ada → tidak insert dan tidak audit', async () => {
    const { useCase, repo, auditRepo } = makeDeps(['lorem']);
    const result = await useCase.execute({ words: ['lorem', 'Lorem'], actorId: ACTOR });

    expect(repo.createMany).not.toHaveBeenCalled();
    expect(auditRepo.record).not.toHaveBeenCalled();
    expect(result).toEqual({ createdCount: 0, skippedCount: 2, invalidCount: 0 });
  });

  it('hanya spasi → 400 BLOCKLIST_BULK_EMPTY', async () => {
    const { useCase, repo } = makeDeps();
    await expect(useCase.execute({ words: ['  ', ''], actorId: ACTOR })).rejects.toMatchObject({
      errorCode: 'BLOCKLIST_BULK_EMPTY',
      statusCode: 400,
    });
    expect(repo.createMany).not.toHaveBeenCalled();
  });
});
