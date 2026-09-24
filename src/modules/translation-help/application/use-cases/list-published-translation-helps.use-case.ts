import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export class ListPublishedTranslationHelpsUseCase {
  constructor(private readonly repo: TranslationHelpRepository) {}

  execute(input: { limit: number; cursor?: string }): Promise<CursorPage<TranslationHelp>> {
    return this.repo.list({
      status: 'published',
      limit: input.limit,
      cursor: input.cursor,
    });
  }
}
