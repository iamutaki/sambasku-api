// Entitas domain - murni TypeScript, tidak tahu Drizzle/HTTP
// (03-api-kontribusi-verifikasi.md, Section 22 - approval gate)

/** Status antrean di tabel contributions */
export type ContributionStatus = 'pending' | 'approved' | 'rejected' | 'corrected';
/** Entity yang bisa dikontribusikan + direview */
export type ContributionEntityType = 'word' | 'pronunciation' | 'word_image' | 'example' | 'meaning';
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
  /** Provenance search-miss (12-api) - null kalau kontribusi biasa */
  searchMissId: string | null;
  searchMissTerm: string | null;
  searchMissDirection: 'lemma' | 'translation' | null;
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
  /**
   * Set saat approve kata digabung ke lemma published yang sudah ada
   * (12-api §8). entityId = id kata yang bertahan (target merge).
   */
  mergedIntoWordId?: string | null;
}
