import type { CommentBlocklistWord, CursorPage } from '../entities/comment-blocklist-word.entity';

export interface CommentBlocklistRepository {
  listActive(params: {
    limit: number;
    cursor?: string;
    /** Partial match, case-insensitive. Kosong = tanpa filter. */
    q?: string;
  }): Promise<CursorPage<CommentBlocklistWord>>;
  /** Semua kata aktif (untuk filter create) - tanpa pagination */
  listAllActiveWords(): Promise<string[]>;
  findActiveByWord(word: string): Promise<CommentBlocklistWord | null>;
  /** Kata aktif yang ada di antara `words` (sudah dinormalisasi). */
  findActiveWordSet(words: string[]): Promise<Set<string>>;
  create(data: { word: string; createdBy: string }): Promise<CommentBlocklistWord>;
  /** Insert batch. `firstId` dipakai audit ringkas. */
  createMany(items: { word: string; createdBy: string }[]): Promise<{ count: number; firstId: string | null }>;
  softDelete(id: string, actorId: string): Promise<boolean>;
  findById(id: string): Promise<CommentBlocklistWord | null>;
}
