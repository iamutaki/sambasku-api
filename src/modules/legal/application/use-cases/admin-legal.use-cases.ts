import { BadRequestError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type {
  LegalDocumentStatus,
  LegalDocumentType,
} from '../../domain/entities/legal-document.entity';
import type { LegalDocumentRepository } from '../../domain/repositories/legal-document.repository';

export class ListAdminLegalDocumentsUseCase {
  constructor(private readonly legalRepo: LegalDocumentRepository) {}

  async execute(opts: {
    documentType?: LegalDocumentType;
    status?: LegalDocumentStatus;
    limit: number;
    cursor?: string;
  }) {
    return this.legalRepo.list(opts);
  }
}

export class CreateLegalDocumentDraftUseCase {
  constructor(
    private readonly legalRepo: LegalDocumentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: {
    documentType: LegalDocumentType;
    version: string;
    title: string;
    bodyMarkdown: string;
    createdBy: string;
    requestId?: string | null;
  }) {
    if (!input.version.trim()) {
      throw new BadRequestError('VALIDATION_ERROR', 'Versi wajib diisi', [
        { field: 'version', message: 'Versi wajib diisi' },
      ]);
    }
    if (!input.title.trim()) {
      throw new BadRequestError('VALIDATION_ERROR', 'Judul wajib diisi', [
        { field: 'title', message: 'Judul wajib diisi' },
      ]);
    }
    if (!input.bodyMarkdown.trim()) {
      throw new BadRequestError('VALIDATION_ERROR', 'Isi dokumen wajib diisi', [
        { field: 'body_markdown', message: 'Isi dokumen wajib diisi' },
      ]);
    }

    const doc = await this.legalRepo.createDraft({
      documentType: input.documentType,
      version: input.version.trim(),
      title: input.title.trim(),
      bodyMarkdown: input.bodyMarkdown,
      createdBy: input.createdBy,
    });

    await this.auditRepo.record({
      userId: input.createdBy,
      action: 'create',
      entityType: 'legal_document',
      entityId: doc.id,
      newData: {
        document_type: doc.documentType,
        version: doc.version,
        status: doc.status,
      },
      requestId: input.requestId ?? null,
    });

    return doc;
  }
}

export class UpdateLegalDocumentDraftUseCase {
  constructor(
    private readonly legalRepo: LegalDocumentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: {
    id: string;
    title?: string;
    bodyMarkdown?: string;
    updatedBy: string;
    requestId?: string | null;
  }) {
    const doc = await this.legalRepo.updateDraft(input.id, {
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      updatedBy: input.updatedBy,
    });

    await this.auditRepo.record({
      userId: input.updatedBy,
      action: 'update',
      entityType: 'legal_document',
      entityId: doc.id,
      newData: {
        document_type: doc.documentType,
        version: doc.version,
        status: doc.status,
      },
      requestId: input.requestId ?? null,
    });

    return doc;
  }
}

export class PublishLegalDocumentUseCase {
  constructor(
    private readonly legalRepo: LegalDocumentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: { id: string; actorId: string; requestId?: string | null }) {
    const doc = await this.legalRepo.publish(input.id, input.actorId);

    await this.auditRepo.record({
      userId: input.actorId,
      action: 'publish',
      entityType: 'legal_document',
      entityId: doc.id,
      newData: {
        document_type: doc.documentType,
        version: doc.version,
        status: doc.status,
        legal_setting_updated: true,
      },
      requestId: input.requestId ?? null,
    });

    return doc;
  }
}

export class ArchiveLegalDocumentUseCase {
  constructor(
    private readonly legalRepo: LegalDocumentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: { id: string; actorId: string; requestId?: string | null }) {
    const doc = await this.legalRepo.archive(input.id, input.actorId);

    await this.auditRepo.record({
      userId: input.actorId,
      action: 'archive',
      entityType: 'legal_document',
      entityId: doc.id,
      newData: {
        document_type: doc.documentType,
        version: doc.version,
        status: doc.status,
      },
      requestId: input.requestId ?? null,
    });

    return doc;
  }
}
