import { NotFoundError } from '@/shared/errors/app-error';
import type { WordDetail } from '../../domain/entities/word.entity';
import type { WordRepository } from '../../domain/repositories/word.repository';

/** Detail kata published berdasarkan lemma - pendukung URL publik /words/<lemma>. */
export class GetWordByLemmaUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(lemma: string): Promise<WordDetail> {
    const id = await this.wordRepo.findPublishedIdByLemma(lemma);
    if (!id) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan lemma tersebut tidak ditemukan');
    }
    // Reuse logika detail by id (children published-only, dsb.)
    const detail = await this.wordRepo.findDetailById(id);
    if (!detail) {
      // Race tipis: publish dicabut di antara dua query - treat 404
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan lemma tersebut tidak ditemukan');
    }
    return detail;
  }
}
