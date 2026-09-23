import { NotFoundError } from '@/shared/errors/app-error';
import type { WordDetail } from '../../domain/entities/word.entity';
import type { WordRepository } from '../../domain/repositories/word.repository';

export class GetWordByIdUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(id: string, opts?: { includeAllStatuses?: boolean }): Promise<WordDetail> {
    // Default (publik): repository hanya mengembalikan published + belum
    // soft-deleted. includeAllStatuses (05-api-edit-kata.md): prefill form
    // edit admin - draft/pending_review/rejected juga terbaca.
    const detail = await this.wordRepo.findDetailById(id, opts);
    if (!detail) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    return detail;
  }
}
