import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss, SearchMissDirection } from '../entities/search-miss.entity';

export interface SearchMissListFilter {
  /** public = hanya yang belum terjawab + visible; admin = semua + cursor */
  scope: 'public' | 'admin';
  direction?: SearchMissDirection;
  /** admin only - filter status terjawab (derived) */
  fulfilled?: boolean;
  /** admin only - filter gate tayang (14-api) */
  visible?: boolean;
  limit: number;
  cursor?: string;
}

export interface SearchMissUpdatePatch {
  term?: string;
  isVisible?: boolean;
}

// Interface lintas modul (pola Section 4): di-inject ke SearchWordsUseCase
// (modul word) untuk mencatat pencarian kosong, dan dipakai modul sendiri
// untuk endpoint beranda + panel admin.
export interface SearchMissRepository {
  /** Upsert istilah: hit_count + 1 kalau sudah pernah dicari. Best-effort. */
  record(input: { term: string; direction: SearchMissDirection }): Promise<void>;
  /** Load miss aktif (deleted_at IS NULL). Null kalau tidak ada / dismissed. */
  findById(id: string): Promise<SearchMiss | null>;
  list(filter: SearchMissListFilter): Promise<CursorPage<SearchMiss>>;
  /** Soft-delete (dismiss dari panel admin). Return false kalau tidak ada. */
  dismiss(id: string, actorId: string): Promise<boolean>;
  /**
   * Partial update term / is_visible (14-api). Null kalau tidak ada.
   * Unique (term,direction) collision → throw ConflictError.
   */
  update(id: string, patch: SearchMissUpdatePatch): Promise<SearchMiss | null>;
}
