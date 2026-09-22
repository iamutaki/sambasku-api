import type { CommentBlocklistWord, CursorPage } from '../entities/comment-blocklist-word.entity';

export interface CommentBlocklistRepository {
  listActive(params: { limit: number; cursor?: string }): Promise<CursorPage<CommentBlocklistWord>>;
  /** Semua kata aktif (untuk filter create) - tanpa pagination */
  listAllActiveWords(): Promise<string[]>;
  findActiveByWord(word: string): Promise<CommentBlocklistWord | null>;
  create(data: { word: string; createdBy: string }): Promise<CommentBlocklistWord>;
  softDelete(id: string, actorId: string): Promise<boolean>;
  findById(id: string): Promise<CommentBlocklistWord | null>;
}
