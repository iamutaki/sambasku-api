import { describe, it, expect, vi } from 'vitest';
import { GetVoteCountsUseCase } from '../../application/use-cases/get-vote-counts.use-case';
import type { VoteRepository } from '../../domain/repositories/vote.repository';

const WORD = { entityType: 'word' as const, entityId: '01JDWORDMAKATN0000000000A' };
const MEANING = { entityType: 'meaning' as const, entityId: '01JDMEANINGMAKATN00000000A' };
const PRON = { entityType: 'pronunciation' as const, entityId: '01JDPRONMEDIA0000000000001' };

function makeDeps(counts: Map<string, { upvotes: number; downvotes: number }>) {
  const voteRepo = {
    targetExists: vi.fn(),
    toggle: vi.fn(),
    countMany: vi.fn().mockResolvedValue(counts),
    findUserVotes: vi.fn(),
  } as unknown as VoteRepository;
  return { voteRepo, useCase: new GetVoteCountsUseCase(voteRepo) };
}

describe('GetVoteCountsUseCase', () => {
  it('target tanpa vote dilengkapi 0/0; duplikat di-dedupe', async () => {
    const { useCase, voteRepo } = makeDeps(
      new Map([
        ['word:01JDWORDMAKATN0000000000A', { upvotes: 4, downvotes: 1 }],
        ['meaning:01JDMEANINGMAKATN00000000A', { upvotes: 0, downvotes: 0 }],
      ]),
    );

    // duplikat word dikirim dua kali
    const items = await useCase.execute([WORD, MEANING, PRON, WORD]);

    expect(voteRepo.countMany).toHaveBeenCalledWith([WORD, MEANING, PRON]);
    expect(items).toEqual([
      { targetType: 'word', targetId: WORD.entityId, upvotes: 4, downvotes: 1 },
      { targetType: 'meaning', targetId: MEANING.entityId, upvotes: 0, downvotes: 0 },
      { targetType: 'pronunciation', targetId: PRON.entityId, upvotes: 0, downvotes: 0 },
    ]);
  });

  it('input kosong → array kosong', async () => {
    const { useCase, voteRepo } = makeDeps(new Map());
    expect(await useCase.execute([])).toEqual([]);
    expect(voteRepo.countMany).toHaveBeenCalledWith([]);
  });
});
