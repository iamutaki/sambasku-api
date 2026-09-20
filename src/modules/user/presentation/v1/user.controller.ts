import type { Context } from 'hono';
import type { GetPublicProfileUseCase } from '../../application/use-cases/get-public-profile.use-case';

export class UserController {
  constructor(private readonly deps: { getPublicProfile: GetPublicProfileUseCase }) {}

  async publicProfile(c: Context, username: string) {
    const profile = await this.deps.getPublicProfile.execute(username);

    return c.json({
      success: true as const,
      data: {
        username: profile.username,
        role: profile.role,
        is_verifier: profile.isVerifier,
        joined_at: profile.joinedAt.toISOString(),
        stats: {
          contributions_approved: profile.stats.contributionsApproved,
          verifications_done: profile.stats.verificationsDone,
        },
      },
    });
  }
}
