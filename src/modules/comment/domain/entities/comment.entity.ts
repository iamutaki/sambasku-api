// Komentar pada lemma (09-api-comment.md). username di-resolve via LEFT
// JOIN users saat baca (pola audit_logs) - null kalau penulis terhapus.
export type CommentStatus = 'published' | 'taken_down' | 'deleted_by_author';

export interface Comment {
  id: string;
  wordId: string;
  /** Lemma kata (JOIN words) - null kalau kata sudah hilang */
  wordLemma: string | null;
  userId: string;
  username: string | null;
  /** Body tayang (terfilter blocklist jika ada) */
  body: string;
  /** Teks asli sebelum sensor; null jika tidak disensor / sudah di-uncensor */
  bodyOriginal: string | null;
  status: CommentStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface NewComment {
  wordId: string;
  userId: string;
  body: string;
  bodyOriginal?: string | null;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
