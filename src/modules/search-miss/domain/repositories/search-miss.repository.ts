import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss, SearchMissDirection } from '../entities/search-miss.entity';

export interface SearchMissListFilter {
  /** public = hanya yang belum terjawab, urut paling dicari; admin = semua + cursor */
  scope: 'public' | 'admin';
  direction?: SearchMissDirection;
  /** admin only — filter status terjawab (derived) */
  fulfilled?: boolean;
  limit: number;
  cursor?: string;
}

// Interface lintas modul (pola Section 4): di-inject ke SearchWordsUseCase
// (modul word) untuk mencatat pencarian kosong, dan dipakai modul sendiri
// untuk endpoint beranda + panel admin.
export interface SearchMissRepository {
  /** Upsert istilah: hit_count + 1 kalau sudah pernah dicari. Best-effort. */
  record(input: { term: string; direction: SearchMissDirection }): Promise<void>;
  list(filter: SearchMissListFilter): Promise<CursorPage<SearchMiss>>;
  /** Soft-delete (dismiss dari panel admin). Return false kalau tidak ada. */
  dismiss(id: string, actorId: string): Promise<boolean>;
}
