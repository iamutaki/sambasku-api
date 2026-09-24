import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentBlocklistRepository } from '@/modules/comment-blocklist/domain/repositories/comment-blocklist.repository';
import { applyBlocklistFilter } from '@/modules/comment-blocklist/application/utils/apply-blocklist-filter';
import type { TranslationHelpReply } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface CreateTranslationHelpReplyCommand {
  helpId: string;
  userId: string;
  body: string;
  requestId?: string | null;
}

export class CreateTranslationHelpReplyUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly blocklistRepo: CommentBlocklistRepository,
  ) {}

  async execute(cmd: CreateTranslationHelpReplyCommand): Promise<TranslationHelpReply> {
    const body = cmd.body.trim();
    if (body.length < 1) {
      throw new ValidationError([{ field: 'body', message: 'Balasan minimal 1 karakter' }]);
    }
    if (body.length > 500) {
      throw new ValidationError([{ field: 'body', message: 'Balasan maksimal 500 karakter' }]);
    }

    const help = await this.repo.findById(cmd.helpId);
    if (!help) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }
    if (help.status !== 'published') {
      throw new ConflictError(
        'TRANSLATION_HELP_NOT_PUBLISHED',
        'Balasan hanya bisa ditambahkan pada bantuan yang sudah tayang',
      );
    }

    const blocked = await this.blocklistRepo.listAllActiveWords();
    const filteredBody = applyBlocklistFilter(body, blocked);
    const wasFiltered = filteredBody !== body;

    const reply = await this.repo.createReply({
      helpId: cmd.helpId,
      userId: cmd.userId,
      body: filteredBody,
      bodyOriginal: wasFiltered ? body : null,
    });

    await this.auditRepo.record({
      userId: cmd.userId,
      action: 'create',
      entityType: 'translation_help_reply',
      entityId: reply.id,
      newData: {
        help_id: cmd.helpId,
        status: 'published',
        censored: wasFiltered,
      },
      requestId: cmd.requestId ?? null,
    });

    return (await this.repo.findReplyById(reply.id)) ?? reply;
  }
}
