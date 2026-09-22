import { NotFoundError } from '@/shared/errors/app-error';
import type { PublicActivityItem } from '../../domain/entities/public-profile.entity';
import type { PublicUserRepository } from '../../domain/repositories/public-user.repository';

const ACTIVITY_LIMIT = 20;
/** Ambil lebih banyak per sumber lalu merge — cukup untuk 20 terbaru. */
const PER_SOURCE = 20;

export class GetPublicActivityUseCase {
  constructor(private readonly publicUserRepo: PublicUserRepository) {}

  async execute(username: string): Promise<PublicActivityItem[]> {
    const user = await this.publicUserRepo.findPublicByUsername(username);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User tidak ditemukan');
    }

    const [contributions, comments, verifications] = await Promise.all([
      this.publicUserRepo.listRecentApprovedContributions(user.id, PER_SOURCE),
      this.publicUserRepo.listRecentPublishedComments(user.id, PER_SOURCE),
      this.publicUserRepo.listRecentVerifications(user.id, PER_SOURCE),
    ]);

    return [...contributions, ...comments, ...verifications]
      .sort((a, b) => {
        const t = b.occurredAt.getTime() - a.occurredAt.getTime();
        if (t !== 0) return t;
        return (b.lemma ?? '').localeCompare(a.lemma ?? '');
      })
      .slice(0, ACTIVITY_LIMIT);
  }
}
