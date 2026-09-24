import { describe, it, expect, vi } from 'vitest';
import { ToggleVoteUseCase } from '../../application/use-cases/toggle-vote.use-case';
import type { VoteRepository } from '../../domain/repositories/vote.repository';

function makeDeps(exists = true) {
  const voteRepo = {
    targetExists: vi.fn().mockResolvedValue(exists),
    toggle: vi.fn().mockResolvedValue({ myVote: 1, upvotes: 1, downvotes: 0 }),
    countMany: vi.fn(),
    findUserVotes: vi.fn(),
  } as unknown as VoteRepository;
  return { voteRepo, useCase: new ToggleVoteUseCase(voteRepo) };
}

const USER = '01JDUSERKONTRIB0000000000A';
const WORD_ID = '01JDWORDMAKATN0000000000A';
const TARGET = { entityType: 'word' as const, entityId: WORD_ID };

describe('ToggleVoteUseCase', () => {
  it('target ada → toggle(userId, target, value) dipanggil, hasil diteruskan', async () => {
    const { useCase, voteRepo } = makeDeps();
    const result = await useCase.execute({ userId: USER, targetType: 'word', targetId: WORD_ID, value: 1 });

    expect(voteRepo.targetExists).toHaveBeenCalledWith(TARGET);
    expect(voteRepo.toggle).toHaveBeenCalledWith(USER, TARGET, 1);
    expect(result).toEqual({ myVote: 1, upvotes: 1, downvotes: 0 });
  });

  it('target tidak ada / sudah soft-deleted → 404 VOTE_TARGET_NOT_FOUND, toggle TIDAK dipanggil', async () => {
    const { useCase, voteRepo } = makeDeps(false);
    await expect(
      useCase.execute({ userId: USER, targetType: 'word', targetId: WORD_ID, value: -1 }),
    ).rejects.toMatchObject({ errorCode: 'VOTE_TARGET_NOT_FOUND', statusCode: 404 });
    expect(voteRepo.toggle).not.toHaveBeenCalled();
  });

  it('translation_help + downvote → VALIDATION_ERROR, toggle TIDAK dipanggil', async () => {
    const { useCase, voteRepo } = makeDeps();
    await expect(
      useCase.execute({
        userId: USER,
        targetType: 'translation_help',
        targetId: WORD_ID,
        value: -1,
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR', statusCode: 400 });
    expect(voteRepo.targetExists).not.toHaveBeenCalled();
    expect(voteRepo.toggle).not.toHaveBeenCalled();
  });
});
