import { describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@/shared/errors/app-error';
import {
  BulkDismissSearchMissUseCase,
  SEARCH_MISS_BULK_DISMISS_MAX,
} from '../../application/use-cases/bulk-dismiss-search-miss.use-case';

const ID_A = '01AAAAAAAAAAAAAAAAAAAAAAAA';
const ID_B = '01BBBBBBBBBBBBBBBBBBBBBBBB';
const ID_MISSING = '01MISSING__________________';

function makeUseCase(dismissedIds: string[] = [ID_A, ID_B]) {
  const searchMissRepo = {
    dismissMany: vi.fn().mockResolvedValue(dismissedIds),
  };
  const auditRepo = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  return {
    searchMissRepo,
    auditRepo,
    useCase: new BulkDismissSearchMissUseCase(searchMissRepo as never, auditRepo as never),
  };
}

describe('BulkDismissSearchMissUseCase', () => {
  it('dismissMany + audit per id sukses', async () => {
    const { searchMissRepo, auditRepo, useCase } = makeUseCase([ID_A, ID_B]);
    const result = await useCase.execute({
      ids: [ID_A, ID_B],
      actorId: '01ADMIN____________________',
      requestId: 'req-1',
    });

    expect(searchMissRepo.dismissMany).toHaveBeenCalledWith([ID_A, ID_B], '01ADMIN____________________');
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([
      { id: ID_A, ok: true },
      { id: ID_B, ok: true },
    ]);
    expect(auditRepo.record).toHaveBeenCalledTimes(2);
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'search_miss',
        entityId: ID_A,
        action: 'delete',
        newData: { dismissed: true },
        requestId: 'req-1',
      }),
    );
  });

  it('partial success: id tidak ada → SEARCH_MISS_NOT_FOUND, batch lanjut', async () => {
    const { auditRepo, useCase } = makeUseCase([ID_A]);
    const result = await useCase.execute({
      ids: [ID_A, ID_MISSING],
      actorId: '01ADMIN____________________',
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({ id: ID_A, ok: true });
    expect(result.results[1]).toMatchObject({
      id: ID_MISSING,
      ok: false,
      error_code: 'SEARCH_MISS_NOT_FOUND',
    });
    expect(auditRepo.record).toHaveBeenCalledTimes(1);
  });

  it('dedupe id di body sebelum dismissMany', async () => {
    const { searchMissRepo, useCase } = makeUseCase([ID_A]);
    const result = await useCase.execute({
      ids: [ID_A, ID_A, ID_A],
      actorId: '01ADMIN____________________',
    });

    expect(searchMissRepo.dismissMany).toHaveBeenCalledWith([ID_A], '01ADMIN____________________');
    expect(result.succeeded).toBe(1);
    expect(result.results).toHaveLength(1);
  });

  it('ids kosong → BadRequest SEARCH_MISS_BULK_EMPTY', async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({ ids: [], actorId: '01ADMIN____________________' }),
    ).rejects.toMatchObject({
      errorCode: 'SEARCH_MISS_BULK_EMPTY',
    } satisfies Partial<BadRequestError>);
  });

  it('lebih dari max → BadRequest SEARCH_MISS_BULK_TOO_LARGE', async () => {
    const { useCase, searchMissRepo } = makeUseCase();
    const ids = Array.from({ length: SEARCH_MISS_BULK_DISMISS_MAX + 1 }, (_, i) =>
      `01${String(i).padStart(24, '0')}`.slice(0, 26),
    );
    await expect(
      useCase.execute({ ids, actorId: '01ADMIN____________________' }),
    ).rejects.toMatchObject({
      errorCode: 'SEARCH_MISS_BULK_TOO_LARGE',
    } satisfies Partial<BadRequestError>);
    expect(searchMissRepo.dismissMany).not.toHaveBeenCalled();
  });
});
