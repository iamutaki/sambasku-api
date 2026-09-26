import { describe, it, expect, vi } from 'vitest';
import { ListAdminVotesUseCase } from '../../application/use-cases/list-admin-votes.use-case';
import {
  decodeAdminCursor,
  encodeAdminCursor,
  type VoteRepository,
} from '../../domain/repositories/vote.repository';

function makeDeps() {
  const voteRepo = {
    listAdmin: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    }),
  } as unknown as VoteRepository;
  return { voteRepo, useCase: new ListAdminVotesUseCase(voteRepo) };
}

describe('encodeAdminCursor / decodeAdminCursor', () => {
  it('round-trip ISO dengan jam:menit:detik (bukan dipecah di `:`)', () => {
    const createdAt = new Date('2026-09-25T16:27:10.000Z');
    const id = '01M3CP8SCJ29RNFWJ39DAYZEN2';
    const encoded = encodeAdminCursor({ createdAt, id });

    expect(decodeAdminCursor(encoded)).toEqual({ createdAt, id });
  });

  it('cursor produksi yang sebelumnya gagal → decode valid', () => {
    const cursor =
      'MjAyNi0wOS0yNVQxNjoyNzoxMC4wMDBaOjAxTTNDUDhTQ0oyOVJORldKMzlEQVlaRU4y';
    expect(decodeAdminCursor(cursor)).toEqual({
      createdAt: new Date('2026-09-25T16:27:10.000Z'),
      id: '01M3CP8SCJ29RNFWJ39DAYZEN2',
    });
  });
});

describe('ListAdminVotesUseCase', () => {
  it('cursor valid → diteruskan ke repo', async () => {
    const { useCase, voteRepo } = makeDeps();
    const createdAt = new Date('2026-09-25T16:27:10.000Z');
    const cursor = encodeAdminCursor({ createdAt, id: '01M3CP8SCJ29RNFWJ39DAYZEN2' });

    await useCase.execute({ filter: {}, limit: 20, cursor });

    expect(voteRepo.listAdmin).toHaveBeenCalledWith({}, 20, {
      createdAt,
      id: '01M3CP8SCJ29RNFWJ39DAYZEN2',
    });
  });

  it('cursor rusak → NotFoundError INVALID_CURSOR', async () => {
    const { useCase, voteRepo } = makeDeps();
    await expect(
      useCase.execute({ filter: {}, limit: 20, cursor: 'bukan-cursor' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CURSOR', statusCode: 404 });
    expect(voteRepo.listAdmin).not.toHaveBeenCalled();
  });
});
