import { NotFoundError } from '@/shared/errors/app-error';
import type { WordDetail } from '../../domain/entities/word.entity';
import type { WordRepository } from '../../domain/repositories/word.repository';

export class GetWordByIdUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(id: string): Promise<WordDetail> {
    // Repository hanya mengembalikan published + belum soft-deleted;
    // draft/pending_review bukan urusan endpoint publik ini
    const detail = await this.wordRepo.findDetailById(id);
    if (!detail) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    return detail;
  }
}
