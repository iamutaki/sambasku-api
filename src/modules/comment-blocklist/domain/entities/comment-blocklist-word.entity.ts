export interface CommentBlocklistWord {
  id: string;
  word: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
