import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';

export class DeleteBlocklistWordUseCase {
  constructor(
    private readonly repo: CommentBlocklistRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: { id: string; actorId: string; requestId?: string | null }): Promise<void> {
    const existing = await this.repo.findById(cmd.id);
    if (!existing) {
      throw new NotFoundError('BLOCKLIST_WORD_NOT_FOUND', 'Kata blocklist tidak ditemukan');
    }

    const ok = await this.repo.softDelete(cmd.id, cmd.actorId);
    if (!ok) {
      throw new NotFoundError('BLOCKLIST_WORD_NOT_FOUND', 'Kata blocklist tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'comment_blocklist_word',
      entityId: existing.id,
      oldData: { word: existing.word },
      requestId: cmd.requestId ?? null,
    });
  }
}
