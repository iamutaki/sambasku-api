import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  Contribution,
  ContributionEntityType,
  ContributionReview,
  ContributionStatus,
  ReviewDecision,
  ReviewOutcome,
} from '../entities/contribution.entity';

export interface ContributionListFilter {
  status?: ContributionStatus;
  entityType?: string;
  action?: string;
  limit: number;
  /** cursor-based (Section 13): ULID id item terakhir halaman sebelumnya */
  cursor?: string;
}

// Patch koreksi untuk entity anak — replace semantics (field tak dikirim → null)
export interface PronunciationPatch {
  notation: string;
  value: string;
  dialectId: string | null;
  audioUrl: string | null;
  speakerName: string | null;
  notes: string | null;
}

export interface WordImagePatch {
  url: string;
  providerFileId: string;
  altText: string | null;
  isPrimary: boolean;
}

export interface ExamplePatch {
  sourceSentence: string;
  targetSentence: string | null;
  sourceType: string | null;
  notes: string | null;
}

export interface ReviewCommand {
  contributionId: string;
  decision: ReviewDecision;
  reviewerId: string;
  comment: string | null;
  /** hanya untuk decision 'correct' pada entity anak */
  childPatch?: {
    pronunciation?: PronunciationPatch;
    wordImage?: WordImagePatch;
    example?: ExamplePatch;
  };
}

/** Baris entity anak + referensi parent — untuk layar review & snapshot koreksi */
export interface ChildEntityWithParent {
  id: string;
  wordId: string;
  wordLemma: string | null;
  meaningId?: string;
  // field entity (payload polymorphic untuk UI review)
  data: Record<string, unknown>;
  status: string;
  isVerified: boolean;
  isCorrected: boolean;
}

export type { CursorPage };
export type { ContributionEntityType };

// Kontrak repository modul contribution. review() DIJAMIN satu transaksi:
// update entity + contributions.status + INSERT contribution_reviews, dengan
// cek pending DI DALAM transaksi (race double-review → 409, bukan 500).
// Entity 'word' saat 'correct' TIDAK diubah di sini — use case memakai
// WordRepository.updateWithRelations lebih dulu (dua tulis, window kecil,
// didokumentasikan di docs/api/03-api-kontribusi-verifikasi.md).
export interface ContributionRepository {
  list(filter: ContributionListFilter): Promise<CursorPage<Contribution>>;
  findById(id: string): Promise<Contribution | null>;
  /** baris review terakhir untuk kontribsi (null kalau belum ada keputusan) */
  findReview(contributionId: string): Promise<ContributionReview | null>;
  findChildWithParent(
    entityType: 'pronunciation' | 'word_image' | 'example',
    entityId: string,
  ): Promise<ChildEntityWithParent | null>;
  review(cmd: ReviewCommand): Promise<ReviewOutcome>;
}
