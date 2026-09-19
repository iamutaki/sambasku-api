import type {
  BookmarkListOptions,
  BookmarkListResult,
  BookmarkRepository,
} from '../../domain/repositories/bookmark.repository';

// Daftar bookmark user login (16-api-bookmark.md): pagination cursor untuk
// halaman Bookmark mobile; word_ids = mode cek status batch (state tombol
// bookmark di detail kata). Dedupe word_ids sudah di validator.
export class GetMyBookmarksUseCase {
  constructor(private readonly bookmarkRepo: BookmarkRepository) {}

  async execute(userId: string, opts: BookmarkListOptions): Promise<BookmarkListResult> {
    return this.bookmarkRepo.listByUser(userId, opts);
  }
}
