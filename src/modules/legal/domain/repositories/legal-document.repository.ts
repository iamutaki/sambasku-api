import type {
  LegalDocument,
  LegalDocumentStatus,
  LegalDocumentType,
  NewLegalDocumentDraft,
  UpdateLegalDocumentDraft,
} from '../entities/legal-document.entity';

export interface LegalDocumentListFilter {
  documentType?: LegalDocumentType;
  status?: LegalDocumentStatus;
  limit: number;
  cursor?: string;
}

export interface LegalDocumentListResult {
  items: LegalDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface LegalDocumentRepository {
  findById(id: string): Promise<LegalDocument | null>;
  findByTypeAndVersion(
    documentType: LegalDocumentType,
    version: string,
  ): Promise<LegalDocument | null>;
  findPublishedByType(documentType: LegalDocumentType): Promise<LegalDocument | null>;
  list(filter: LegalDocumentListFilter): Promise<LegalDocumentListResult>;
  createDraft(input: NewLegalDocumentDraft): Promise<LegalDocument>;
  updateDraft(id: string, input: UpdateLegalDocumentDraft): Promise<LegalDocument>;
  /**
   * Publish dokumen: set published, archive published lama tipe sama,
   * update app_settings legal.*_version - dalam satu transaksi.
   */
  publish(id: string, actorId: string): Promise<LegalDocument>;
  archive(id: string, actorId: string): Promise<LegalDocument>;
}
