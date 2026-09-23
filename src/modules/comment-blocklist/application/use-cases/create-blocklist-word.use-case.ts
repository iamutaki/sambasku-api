import { ConflictError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentBlocklistWord } from '../../domain/entities/comment-blocklist-word.entity';
import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';

export class CreateBlocklistWordUseCase {
  constructor(
    private readonly repo: CommentBlocklistRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: {
    word: string;
    actorId: string;
    requestId?: string | null;
  }): Promise<CommentBlocklistWord> {
    const normalized = cmd.word.trim().toLowerCase();
    const existing = await this.repo.findActiveByWord(normalized);
    if (existing) {
      throw new ConflictError('BLOCKLIST_WORD_EXISTS', 'Kata tersebut sudah ada di blocklist');
    }

    const created = await this.repo.create({ word: normalized, createdBy: cmd.actorId });
    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'create',
      entityType: 'comment_blocklist_word',
      entityId: created.id,
      newData: { word: created.word },
      requestId: cmd.requestId ?? null,
    });
    return created;
  }
}
