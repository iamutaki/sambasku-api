export type ConsentDocumentType = 'terms' | 'privacy';
export type ConsentSource = 'register' | 'social_gate' | 'reconsent' | 'accept_legal';

export interface UserConsent {
  id: string;
  userId: string;
  documentType: ConsentDocumentType;
  documentVersion: string;
  acceptedAt: Date;
  source: ConsentSource;
  clientId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface NewUserConsent {
  userId: string;
  documentType: ConsentDocumentType;
  documentVersion: string;
  source: ConsentSource;
  clientId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  acceptedAt?: Date;
}
