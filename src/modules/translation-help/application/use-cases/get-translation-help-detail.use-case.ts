import { NotFoundError } from '@/shared/errors/app-error';
import type {
  TranslationHelp,
  TranslationHelpReply,
} from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface GetTranslationHelpDetailResult {
  help: TranslationHelp;
  replies: TranslationHelpReply[];
}

/**
 * Detail publik: published untuk semua; owner boleh lihat pending/rejected/taken_down sendiri.
 * Admin memakai endpoint terpisah.
 */
export class GetTranslationHelpDetailUseCase {
  constructor(private readonly repo: TranslationHelpRepository) {}

  async execute(input: {
    id: string;
    viewerUserId?: string | null;
    /** true = antrean admin, tampilkan semua status */
    asAdmin?: boolean;
  }): Promise<GetTranslationHelpDetailResult> {
    const help = await this.repo.findById(input.id);
    if (!help) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    if (!input.asAdmin) {
      const isOwner = input.viewerUserId != null && help.userId === input.viewerUserId;
      if (help.status !== 'published' && !isOwner) {
        throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
      }
    }

    const replies =
      help.status === 'published' || input.asAdmin
        ? await this.repo.listReplies(help.id)
        : [];

    return { help, replies };
  }
}
