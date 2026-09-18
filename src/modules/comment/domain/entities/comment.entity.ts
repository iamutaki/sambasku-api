// Komentar pada lemma (09-api-comment.md). username di-resolve via LEFT
// JOIN users saat baca (pola audit_logs) - null kalau penulis terhapus.
export type CommentStatus = 'pending_review' | 'published' | 'rejected';

export interface Comment {
  id: string;
  wordId: string;
  userId: string;
  username: string | null;
  body: string;
  status: CommentStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface NewComment {
  wordId: string;
  userId: string;
  body: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
