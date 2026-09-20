import { describe, it, expect, vi } from 'vitest';
import { GetPublicProfileUseCase } from '../../application/use-cases/get-public-profile.use-case';
import type { PublicUserRepository } from '../../domain/repositories/public-user.repository';

const JOINED = new Date('2026-08-01T00:00:00Z');

function makeRepo(user: Awaited<ReturnType<PublicUserRepository['findPublicByUsername']>>) {
  return {
    findPublicByUsername: vi.fn().mockResolvedValue(user),
    countApprovedContributions: vi.fn(),
    countVerificationsDone: vi.fn(),
    loadStats: vi.fn().mockResolvedValue({ contributionsApproved: 12, verificationsDone: 34 }),
  } as unknown as PublicUserRepository;
}

describe('GetPublicProfileUseCase', () => {
  it('reviewer → is_verifier true + stats diteruskan', async () => {
    const repo = makeRepo({
      id: '01JDUSERREVIEW000000000000',
      username: 'budi',
      role: 'reviewer',
      joinedAt: JOINED,
    });
    const profile = await new GetPublicProfileUseCase(repo).execute('budi');

    expect(repo.findPublicByUsername).toHaveBeenCalledWith('budi');
    expect(profile).toMatchObject({
      username: 'budi',
      role: 'reviewer',
      isVerifier: true,
      joinedAt: JOINED,
      stats: { contributionsApproved: 12, verificationsDone: 34 },
    });
  });

  it('contributor → is_verifier false', async () => {
    const repo = makeRepo({
      id: '01JDUSERKONTRIB00000000000',
      username: 'siti',
      role: 'contributor',
      joinedAt: JOINED,
    });
    const profile = await new GetPublicProfileUseCase(repo).execute('siti');
    expect(profile.isVerifier).toBe(false);
  });

  it('repo null (tidak ada / deleted / inactive) → 404 USER_NOT_FOUND', async () => {
    const repo = makeRepo(null);
    const useCase = new GetPublicProfileUseCase(repo);

    await expect(useCase.execute('tidakada')).rejects.toMatchObject({
      errorCode: 'USER_NOT_FOUND',
      statusCode: 404,
    });
    expect(repo.loadStats).not.toHaveBeenCalled();
  });
});
