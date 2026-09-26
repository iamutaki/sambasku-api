import { describe, it, expect, vi } from 'vitest';
import { PublishLegalDocumentUseCase } from '../../application/use-cases/admin-legal.use-cases';
import type { LegalDocumentRepository } from '../../domain/repositories/legal-document.repository';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

describe('PublishLegalDocumentUseCase', () => {
  it('publish terms → audit + repo.publish', async () => {
    const docs = {
      publish: vi.fn().mockResolvedValue({
        id: '01DOC',
        documentType: 'terms',
        version: '2026-10-01',
        title: 'Syarat',
        bodyMarkdown: '# x',
        status: 'published',
        publishedAt: new Date(),
        createdBy: null,
        updatedBy: '01ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as unknown as LegalDocumentRepository;
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogRepository;

    const uc = new PublishLegalDocumentUseCase(docs, audit);
    const result = await uc.execute({ id: '01DOC', actorId: '01ADMIN' });

    expect(result.version).toBe('2026-10-01');
    expect(docs.publish).toHaveBeenCalledWith('01DOC', '01ADMIN');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publish', entityType: 'legal_document' }),
    );
  });
});
