import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  TranslationHelp,
  TranslationHelpStatus,
} from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export class ListAdminTranslationHelpsUseCase {
  constructor(private readonly repo: TranslationHelpRepository) {}

  execute(input: {
    status?: TranslationHelpStatus;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<TranslationHelp>> {
    return this.repo.list({
      status: input.status,
      limit: input.limit,
      cursor: input.cursor,
    });
  }
}
