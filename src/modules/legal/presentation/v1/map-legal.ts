import type { LegalDocument } from '../../domain/entities/legal-document.entity';

export function mapLegalDocumentPublic(doc: LegalDocument) {
  return {
    document_type: doc.documentType,
    version: doc.version,
    title: doc.title,
    body_markdown: doc.bodyMarkdown,
    status: doc.status,
    published_at: doc.publishedAt?.toISOString() ?? null,
  };
}

export function mapLegalDocumentAdmin(doc: LegalDocument) {
  return {
    ...mapLegalDocumentPublic(doc),
    id: doc.id,
    created_by: doc.createdBy,
    updated_by: doc.updatedBy,
    created_at: doc.createdAt.toISOString(),
    updated_at: doc.updatedAt?.toISOString() ?? null,
  };
}
