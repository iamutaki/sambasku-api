import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss } from '../../domain/entities/search-miss.entity';
import type { SearchMissListFilter, SearchMissRepository } from '../../domain/repositories/search-miss.repository';

// Beranda (scope public — paling dicari, belum terjawab) & panel admin
// (scope admin — semua + filter). Passthrough; meta dibentuk controller.
export class ListSearchMissesUseCase {
  constructor(private readonly searchMissRepo: SearchMissRepository) {}

  execute(filter: SearchMissListFilter): Promise<CursorPage<SearchMiss>> {
    return this.searchMissRepo.list(filter);
  }
}
