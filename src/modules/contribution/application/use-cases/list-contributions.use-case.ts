import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { Contribution } from '../../domain/entities/contribution.entity';
import type { ContributionListFilter, ContributionRepository } from '../../domain/repositories/contribution.repository';

// Antrean review — filter + cursor pagination dipakai apa adanya dari
// repository (meta {limit, next_cursor, has_more} dibentuk controller).
export class ListContributionsUseCase {
  constructor(private readonly contributionRepo: ContributionRepository) {}

  execute(filter: ContributionListFilter): Promise<CursorPage<Contribution>> {
    return this.contributionRepo.list(filter);
  }
}
