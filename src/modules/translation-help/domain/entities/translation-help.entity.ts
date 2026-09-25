export type TranslationHelpStatus =
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'taken_down';

export type TranslationHelpReplyStatus = 'published' | 'taken_down' | 'deleted_by_author';

export interface TranslationHelpImage {
  url: string;
  providerFileId: string;
  publicUrl: string | null;
}

export interface TranslationHelp {
  id: string;
  userId: string;
  username: string | null;
  body: string | null;
  images: TranslationHelpImage[];
  status: TranslationHelpStatus;
  rejectionNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  pinnedReplyId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewTranslationHelp {
  userId: string;
  body: string | null;
  images: TranslationHelpImage[];
}

export interface TranslationHelpReply {
  id: string;
  helpId: string;
  userId: string;
  username: string | null;
  /** Role penulis - dipakai highlight verifikator di render, bukan flag DB. */
  userRole: string | null;
  body: string;
  bodyOriginal: string | null;
  status: TranslationHelpReplyStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface NewTranslationHelpReply {
  helpId: string;
  userId: string;
  body: string;
  bodyOriginal?: string | null;
}

export interface TranslationHelpListFilter {
  status?: TranslationHelpStatus;
  userId?: string;
  limit: number;
  cursor?: string;
  /** latest = id desc; popular = upvotes desc lalu id desc (hanya published). */
  sort?: 'latest' | 'popular';
}

export interface TranslationHelpReplyListFilter {
  helpId: string;
  limit?: number;
}

/** Role yang ditandai badge Verifikator di thread balasan. */
export const VERIFIER_HIGHLIGHT_ROLES = new Set(['admin', 'editor', 'reviewer', 'root']);

export function isVerifierRole(role: string | null | undefined): boolean {
  return role != null && VERIFIER_HIGHLIGHT_ROLES.has(role);
}
