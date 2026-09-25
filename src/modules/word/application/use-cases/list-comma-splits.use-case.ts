import type { WordRepository } from '../../domain/repositories/word.repository';

export class ListCommaSplitsUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(): Promise<{
    lemmas: Awaited<ReturnType<WordRepository['listCommaSplitCandidates']>>['lemmas'];
    translations: Awaited<ReturnType<WordRepository['listCommaSplitCandidates']>>['translations'];
    total: number;
  }> {
    const { lemmas, translations } = await this.wordRepo.listCommaSplitCandidates();
    return {
      lemmas,
      translations,
      total: lemmas.length + translations.length,
    };
  }
}
