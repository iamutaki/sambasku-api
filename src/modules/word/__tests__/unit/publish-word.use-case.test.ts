import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@/shared/errors/app-error';
import { PublishWordUseCase } from '../../application/use-cases/publish-word.use-case';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

function makeDeps(opts?: {
  setPublishedResult?: boolean;
  publishOrMerge?: { wordId: string; mergedIntoWordId: string | null } | null;
}) {
  const wordRepo = {
    findById: vi.fn().mockResolvedValue({ id: '01WORD', status: 'draft' }),
    setPublished: vi.fn().mockResolvedValue(opts?.setPublishedResult ?? true),
    publishOrMergeMeanings: vi.fn().mockResolvedValue(
      opts?.publishOrMerge === undefined
        ? { wordId: '01WORD', mergedIntoWordId: null }
        : opts.publishOrMerge,
    ),
  };
  const auditRepo = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  return {
    wordRepo,
    auditRepo,
    useCase: new PublishWordUseCase(
      wordRepo as never,
      auditRepo as unknown as AuditLogRepository,
    ),
  };
}

describe('PublishWordUseCase', () => {
  it('publish → publishOrMergeMeanings + audit action publish', async () => {
    const { wordRepo, auditRepo, useCase } = makeDeps();
    const result = await useCase.execute({
      wordId: '01WORD',
      published: true,
      actorId: '01ADMIN',
      requestId: 'req-1',
    });
    expect(result).toEqual({ wordId: '01WORD', mergedIntoWordId: null });
    expect(wordRepo.publishOrMergeMeanings).toHaveBeenCalledWith('01WORD', '01ADMIN');
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'publish',
        newData: { status: 'published', is_verified: true },
        requestId: 'req-1',
      }),
    );
  });

  it('publish dengan twin → merge_publish + mergedIntoWordId', async () => {
    const { wordRepo, auditRepo, useCase } = makeDeps({
      publishOrMerge: { wordId: '01TWIN', mergedIntoWordId: '01TWIN' },
    });
    const result = await useCase.execute({
      wordId: '01WORD',
      published: true,
      actorId: '01ADMIN',
    });
    expect(result).toEqual({ wordId: '01TWIN', mergedIntoWordId: '01TWIN' });
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'merge_publish',
        entityId: '01TWIN',
        newData: expect.objectContaining({
          merged_into_word_id: '01TWIN',
          source_word_id: '01WORD',
        }),
      }),
    );
    expect(wordRepo.setPublished).not.toHaveBeenCalled();
  });

  it('unpublish → setPublished(false) + audit unpublish', async () => {
    const { wordRepo, auditRepo, useCase } = makeDeps();
    await useCase.execute({
      wordId: '01WORD',
      published: false,
      actorId: '01ADMIN',
    });
    expect(wordRepo.setPublished).toHaveBeenCalledWith(
      '01WORD',
      expect.objectContaining({ published: false, actorId: '01ADMIN' }),
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unpublish', newData: { status: 'draft' } }),
    );
  });

  it('taken_down tidak lewat sakelar tayang', async () => {
    const { wordRepo, useCase } = makeDeps();
    wordRepo.findById.mockResolvedValue({ id: '01WORD', status: 'taken_down' });
    await expect(
      useCase.execute({ wordId: '01WORD', published: true, actorId: '01ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('publish kata hilang → 404', async () => {
    const { useCase } = makeDeps({ publishOrMerge: null });
    await expect(
      useCase.execute({ wordId: '01MISS', published: true, actorId: '01ADMIN' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND', statusCode: 404 });
  });
});
