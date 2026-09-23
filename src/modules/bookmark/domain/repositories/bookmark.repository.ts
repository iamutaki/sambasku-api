/** Ringkasan kata yang di-bookmark - subset minimal untuk list UI. */
export interface BookmarkWordSummary {
  id: string;
  lemma: string;
  wordType: string;
  isVerified: boolean;
  /** false bila kata bukan published (misalnya taken_down). */
  available: boolean;
}

export interface BookmarkItem {
  /** Id baris bookmark (cursor pagination). */
  id: string;
  wordId: string;
  bookmarkedAt: Date;
  word: BookmarkWordSummary;
}

export interface ToggleBookmarkResult {
  /** State final user pada kata: false = bookmark batal (toggle off). */
  isBookmarked: boolean;
  /** Waktu pasang terakhir; null setelah toggle off. */
  bookmarkedAt: Date | null;
}

export interface BookmarkListOptions {
  limit: number;
  cursor?: string;
  /** Filter batch (cek status di detail kata) - tanpa cursor pagination. */
  wordIds?: string[];
}

/** Batas word_ids per request cek status batch (sama seperti vote). */
export const MAX_BOOKMARK_WORD_IDS = 50;

export interface BookmarkListResult {
  items: BookmarkItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Repository bookmark (16-api-bookmark.md). Bookmark mati = hard delete
 * (preseden votes: baris user-state TIDAK pakai deleted_at), TANPA audit.
 */
export interface BookmarkRepository {
  /** Cek kata ada & belum soft-deleted (PK + deleted_at IS NULL). */
  wordExists(wordId: string): Promise<boolean>;

  /**
   * Toggle SATU transaction: bookmark ada = lepas (baris dihapus hard),
   * belum ada = pasang (ON CONFLICT DO NOTHING - unik user_id+word_id
   * menjaga race). Return state final.
   */
  toggle(userId: string, wordId: string): Promise<ToggleBookmarkResult>;

  /**
   * List bookmark user join words (deleted_at words IS NULL), terbaru
   * duluan, cursor = id bookmark (LIMIT+1 has_more detection). Dengan
   * wordIds: filter batch tanpa pagination (hasMore selalu false).
   */
  listByUser(userId: string, opts: BookmarkListOptions): Promise<BookmarkListResult>;
}
