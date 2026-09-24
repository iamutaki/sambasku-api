import { NotFoundError } from '@/shared/errors/app-error';
import { isVerifierRole } from '@/modules/word/application/utils/resolve-publication';
import type { PublicProfile } from '../../domain/entities/public-profile.entity';
import type { PublicUserRepository } from '../../domain/repositories/public-user.repository';

export class GetPublicProfileUseCase {
  constructor(private readonly publicUserRepo: PublicUserRepository) {}

  async execute(username: string): Promise<PublicProfile> {
    const user = await this.publicUserRepo.findPublicByUsername(username);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User tidak ditemukan');
    }

    const stats = await this.publicUserRepo.loadStats(user.id);

    return {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      role: user.role,
      isVerifier: isVerifierRole(user.role),
      joinedAt: user.joinedAt,
      avatarUrl: user.avatarUrl,
      stats,
    };
  }
}
