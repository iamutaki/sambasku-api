export type LegalDocumentType = 'terms' | 'privacy';
export type LegalDocumentStatus = 'draft' | 'published' | 'archived';

export interface LegalDocument {
  id: string;
  documentType: LegalDocumentType;
  version: string;
  title: string;
  bodyMarkdown: string;
  status: LegalDocumentStatus;
  publishedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewLegalDocumentDraft {
  documentType: LegalDocumentType;
  version: string;
  title: string;
  bodyMarkdown: string;
  createdBy: string;
}

export interface UpdateLegalDocumentDraft {
  title?: string;
  bodyMarkdown?: string;
  updatedBy: string;
}
