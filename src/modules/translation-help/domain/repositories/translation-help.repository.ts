import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewTranslationHelp,
  NewTranslationHelpReply,
  TranslationHelp,
  TranslationHelpImage,
  TranslationHelpListFilter,
  TranslationHelpReply,
  TranslationHelpStatus,
} from '../entities/translation-help.entity';

export interface TranslationHelpRepository {
  create(input: NewTranslationHelp): Promise<TranslationHelp>;
  findById(id: string): Promise<TranslationHelp | null>;
  list(filter: TranslationHelpListFilter): Promise<CursorPage<TranslationHelp>>;

  updateStatus(input: {
    id: string;
    fromStatus: TranslationHelpStatus;
    toStatus: TranslationHelpStatus;
    actorId: string;
    rejectionNote?: string | null;
    images?: TranslationHelpImage[];
  }): Promise<TranslationHelp | null>;

  setPinnedReply(input: {
    helpId: string;
    replyId: string | null;
    actorId: string;
  }): Promise<TranslationHelp | null>;

  createReply(input: NewTranslationHelpReply): Promise<TranslationHelpReply>;
  findReplyById(id: string): Promise<TranslationHelpReply | null>;
  listReplies(helpId: string): Promise<TranslationHelpReply[]>;

  markReplyDeletedByAuthor(id: string, actorId: string): Promise<boolean>;
  takedownReply(id: string, reviewerId: string): Promise<boolean>;
}
