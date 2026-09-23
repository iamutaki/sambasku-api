import { NotFoundError } from '@/shared/errors/app-error';
import type {
  BookmarkRepository,
  ToggleBookmarkResult,
} from '../../domain/repositories/bookmark.repository';

export interface ToggleBookmarkCommand {
  userId: string;
  wordId: string;
}

// Toggle bookmark (16-api-bookmark.md): idempotent satu arah - ada = lepas,
// belum ada = pasang; server yang memutuskan state final, client hanya
// mengirim word_id. TANPA audit (KEPUTUSAN PRODUK: preseden votes - baris
// user-state volume tinggi, bukan aksi admin).
export class ToggleBookmarkUseCase {
  constructor(private readonly bookmarkRepo: BookmarkRepository) {}

  async execute(cmd: ToggleBookmarkCommand): Promise<ToggleBookmarkResult> {
    // Eksistensi kata dicek hanya di endpoint tulis ini - bookmark ke kata
    // yang sudah dihapus → 404 (endpoint my sengaja tidak mengecek).
    if (!(await this.bookmarkRepo.wordExists(cmd.wordId))) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata tidak ditemukan atau sudah dihapus');
    }

    return this.bookmarkRepo.toggle(cmd.userId, cmd.wordId);
  }
}
