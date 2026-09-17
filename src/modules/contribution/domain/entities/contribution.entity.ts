// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// (03-api-kontribusi-verifikasi.md, Section 22 - approval gate)

/** Status antrean di tabel contributions */
export type ContributionStatus = 'pending' | 'approved' | 'rejected' | 'corrected';
/** Entity yang bisa dikontribusikan + direview */
export type ContributionEntityType = 'word' | 'pronunciation' | 'word_image' | 'example';
/** Keputusan verifikator */
export type ReviewDecision = 'approve' | 'reject' | 'correct';

export interface Contribution {
  id: string;
  userId: string;
  contributorUsername: string | null;
  entityType: ContributionEntityType;
  entityId: string;
  action: string;
  status: ContributionStatus;
  description: string | null;
  createdAt: Date;
}

export interface ContributionReview {
  reviewerId: string | null;
  status: ContributionStatus;
  comment: string | null;
  createdAt: Date;
}

export interface ReviewOutcome {
  contributionId: string;
  entityType: ContributionEntityType;
  entityId: string;
  status: ContributionStatus;
}
