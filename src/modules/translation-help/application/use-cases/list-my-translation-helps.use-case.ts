import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  TranslationHelp,
  TranslationHelpStatus,
} from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export class ListMyTranslationHelpsUseCase {
  constructor(private readonly repo: TranslationHelpRepository) {}

  execute(input: {
    userId: string;
    status?: TranslationHelpStatus;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<TranslationHelp>> {
    return this.repo.list({
      userId: input.userId,
      status: input.status,
      limit: input.limit,
      cursor: input.cursor,
    });
  }
}
