import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import { UpdateSearchMissUseCase } from '../../application/use-cases/update-search-miss.use-case';
import type { SearchMiss } from '../../domain/entities/search-miss.entity';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

const base: SearchMiss = {
  id: '01JDSEARCHMISS0000000000001',
  term: 'kalintiak',
  direction: 'lemma',
  hitCount: 2,
  lastSearchedAt: new Date('2026-09-16T10:00:00Z'),
  isFulfilled: false,
  isVisible: false,
  createdAt: new Date('2026-09-16T09:00:00Z'),
};

describe('UpdateSearchMissUseCase', () => {
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let uc: UpdateSearchMissUseCase;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      update: vi.fn(),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    uc = new UpdateSearchMissUseCase(
      repo as unknown as SearchMissRepository,
      audit as unknown as AuditLogRepository,
    );
  });

  it('body kosong → ValidationError', async () => {
    await expect(
      uc.execute({ missId: base.id, actorId: 'actor' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('term kosong setelah normalize → ValidationError', async () => {
    await expect(
      uc.execute({ missId: base.id, actorId: 'actor', term: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('miss tidak ada → 404 SEARCH_MISS_NOT_FOUND', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      uc.execute({ missId: base.id, actorId: 'actor', isVisible: true }),
    ).rejects.toMatchObject({ errorCode: 'SEARCH_MISS_NOT_FOUND' });
  });

  it('toggle is_visible → update + audit', async () => {
    repo.findById.mockResolvedValue(base);
    const next = { ...base, isVisible: true };
    repo.update.mockResolvedValue(next);

    const result = await uc.execute({
      missId: base.id,
      actorId: 'actor1',
      isVisible: true,
      requestId: 'req1',
    });

    expect(result.isVisible).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(base.id, { term: undefined, isVisible: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'search_miss',
        oldData: { is_visible: false },
        newData: { is_visible: true },
      }),
    );
  });

  it('koreksi term → normalize + audit', async () => {
    repo.findById.mockResolvedValue(base);
    const next = { ...base, term: 'kalintia' };
    repo.update.mockResolvedValue(next);

    const result = await uc.execute({
      missId: base.id,
      actorId: 'actor1',
      term: '  Kalintia  ',
    });

    expect(result.term).toBe('kalintia');
    expect(repo.update).toHaveBeenCalledWith(base.id, {
      term: 'kalintia',
      isVisible: undefined,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        oldData: { term: 'kalintiak' },
        newData: { term: 'kalintia' },
      }),
    );
  });

  it('term no-op (sama setelah normalize) → skip update', async () => {
    repo.findById.mockResolvedValue(base);
    const result = await uc.execute({
      missId: base.id,
      actorId: 'actor1',
      term: 'Kalintiak',
    });
    expect(result).toEqual(base);
    expect(repo.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('unique conflict dari repo → ConflictError', async () => {
    repo.findById.mockResolvedValue(base);
    repo.update.mockRejectedValue(
      new ConflictError('SEARCH_MISS_TERM_CONFLICT', 'bentrok'),
    );
    await expect(
      uc.execute({ missId: base.id, actorId: 'actor', term: 'sudah ada' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('update return null → NotFoundError', async () => {
    repo.findById.mockResolvedValue(base);
    repo.update.mockResolvedValue(null);
    await expect(
      uc.execute({ missId: base.id, actorId: 'actor', isVisible: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
