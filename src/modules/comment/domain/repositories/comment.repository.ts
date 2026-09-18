import type { Comment, CursorPage, NewComment } from '../entities/comment.entity';

export interface ListCommentsParams {
  limit: number;
  cursor?: string;
}

export interface ListAdminCommentsParams extends ListCommentsParams {
  status?: Comment['status'];
}

// Kontrak repository modul comment (09-api-comment.md). Implementasi
// Drizzle di infrastructure/. Semua query memfilter isNull(deletedAt).
export interface CommentRepository {
  create(data: NewComment): Promise<Comment>;

  /**
   * Komentar PUBLISHED pada sebuah kata - urut terbaru dulu (id DESC,
   * ULID time-sortable), cursor pagination. Username via LEFT JOIN users.
   */
  listByWord(wordId: string, params: ListCommentsParams): Promise<CursorPage<Comment>>;

  /** By id, belum soft-deleted (semua status - untuk delete & review). */
  findById(id: string): Promise<Comment | null>;

  /**
   * Soft-delete (pola WordRepository): set deleted_at + deleted_by.
   * Return false kalau tidak ada / sudah terhapus.
   */
  softDelete(id: string, actorId: string): Promise<boolean>;

  /**
   * Antrean moderasi: semua status (belum terhapus), filter status
   * optional, urut terbaru dulu + username.
   */
  listAdmin(params: ListAdminCommentsParams): Promise<CursorPage<Comment>>;

  /**
   * Keputusan moderasi SATU UPDATE atomik:
   * WHERE id = :id AND status = 'pending_review' AND deleted_at IS NULL
   * SET status = decision, reviewed_by, reviewed_at.
   * Return false = tidak ada / SUDAH direview → use case terjemahkan ke
   * 409 (race dua moderator klik bersamaan → satu 200, satu 409).
   */
  review(id: string, decision: 'approve' | 'reject', reviewerId: string): Promise<boolean>;
}
