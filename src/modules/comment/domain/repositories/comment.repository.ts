import type { Comment, CursorPage, NewComment } from '../entities/comment.entity';

export interface ListCommentsParams {
  limit: number;
  cursor?: string;
}

export interface ListAdminCommentsParams extends ListCommentsParams {
  /** absen = semua status (embed detail kata); antrean mengirim eksplisit */
  status?: Comment['status'];
  /** filter komentar satu kata (section komentar di detail admin) */
  wordId?: string;
}

export interface ListMyCommentsParams extends ListCommentsParams {
  userId: string;
  status?: Comment['status'];
}

// Kontrak repository modul comment (09-api-comment.md). Soft-delete
// (deleted_at) hanya purge keras; list publik memfilter isNull(deletedAt).
export interface CommentRepository {
  create(data: NewComment): Promise<Comment>;

  /**
   * Komentar tayang pada sebuah kata: published | taken_down |
   * deleted_by_author, urut terbaru (id DESC), cursor pagination.
   */
  listByWord(wordId: string, params: ListCommentsParams): Promise<CursorPage<Comment>>;

  /** By id, belum soft-deleted (semua status - untuk delete & takedown). */
  findById(id: string): Promise<Comment | null>;

  softDelete(id: string, actorId: string): Promise<boolean>;

  markDeletedByAuthor(id: string, actorId: string): Promise<boolean>;

  listAdmin(params: ListAdminCommentsParams): Promise<CursorPage<Comment>>;

  listByUser(params: ListMyCommentsParams): Promise<CursorPage<Comment>>;

  takedown(id: string, reviewerId: string): Promise<boolean>;

  /**
   * Pulihkan teks asli: body = body_original, body_original = null.
   * WHERE body_original IS NOT NULL AND deleted_at IS NULL.
   */
  uncensor(id: string): Promise<boolean>;
}
