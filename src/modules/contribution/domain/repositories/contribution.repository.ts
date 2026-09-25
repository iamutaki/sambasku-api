import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  Contribution,
  ContributionEntityType,
  ContributionReview,
  ContributionStatus,
  MySubmission,
  ReviewDecision,
  ReviewOutcome,
} from '../entities/contribution.entity';

export interface ContributionListFilter {
  status?: ContributionStatus;
  entityType?: string;
  action?: string;
  /** Batasi antrean ke kontribusi kata ini (entity word atau anaknya). */
  wordId?: string;
  limit: number;
  /** cursor-based (Section 13): ULID id item terakhir halaman sebelumnya */
  cursor?: string;
}

export interface MyContributionListFilter {
  userId: string;
  status?: ContributionStatus;
  limit: number;
  cursor?: string;
}

// Patch koreksi untuk entity anak - replace semantics (field tak dikirim → null)
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

/** Koreksi metadata audio (bukan ganti file upload) */
export interface WordAudioPatch {
  speakerName: string | null;
  dialectId: string | null;
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
    wordAudio?: WordAudioPatch;
    example?: ExamplePatch;
  };
  /**
   * true = caller sudah klaim lewat withPendingLock - jangan claimPending lagi
   * (hemat 2 round-trip Turso di Workers).
   */
  alreadyClaimed?: boolean;
  /**
   * true = kata sudah published+verified oleh updateWithRelations dalam lock
   * yang sama. reviewWord skip re-publish penuh; tetap cek twin merge.
   */
  wordAlreadyLive?: boolean;
  /**
   * Foto pada usulan kata yang tidak boleh tayang. Setelah publish anak,
   * baris ini dikunci kembali ke rejected. Abaikan saat decision bukan approve.
   */
  rejectedImageIds?: string[];
}

// Koreksi entity anak TANPA publish (publish=false pada endpoint correct):
// patch diterapkan, is_corrected=true, tapi status tetap 'pending_review'
// dan tidak ada keputusan review (kontribusi tetap di antrean).
export interface ApplyChildCorrectionCommand {
  entityType: 'pronunciation' | 'word_image' | 'word_audio' | 'example';
  entityId: string;
  actorId: string;
  pronunciation?: PronunciationPatch;
  wordImage?: WordImagePatch;
  wordAudio?: WordAudioPatch;
  example?: ExamplePatch;
}

/** Baris entity anak + referensi parent - untuk layar review & snapshot koreksi */
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
// update entity + contributions.status + INSERT contribution_reviews.
// Klaim atomik: UPDATE contributions WHERE status='pending' (LibSQL/SQLite
// tidak punya SELECT FOR UPDATE). Yang kalah dapat 409, bukan 500.
// Koreksi kata memegang klaim yang sama lewat withPendingLock sebelum
// updateWithRelations, supaya dua tulis tidak saling menimpa.
export interface ContributionRepository {
  list(filter: ContributionListFilter): Promise<CursorPage<Contribution>>;
  /** Daftar kontribusi milik satu user (halaman Kontribusi Saya). */
  listMine(filter: MyContributionListFilter): Promise<CursorPage<MySubmission>>;
  findById(id: string): Promise<Contribution | null>;
  /** baris review terakhir untuk kontribsi (null kalau belum ada keputusan) */
  findReview(contributionId: string): Promise<ContributionReview | null>;
  findChildWithParent(
    entityType: 'pronunciation' | 'word_image' | 'word_audio' | 'example' | 'meaning',
    entityId: string,
  ): Promise<ChildEntityWithParent | null>;
  review(cmd: ReviewCommand, tx?: unknown): Promise<ReviewOutcome>;
  /**
   * Buka transaksi, klaim baris masih pending, lalu jalankan kerja
   * (koreksi kata) pada transaksi yang sama. tx diteruskan ke review /
   * updateWithRelations. 404 jika id hilang, 409 jika bukan pending.
   */
  withPendingLock<T>(id: string, work: (tx: unknown) => Promise<T>): Promise<T>;
  /** koreksi entity anak tanpa publish (lihat ApplyChildCorrectionCommand) */
  applyChildCorrection(cmd: ApplyChildCorrectionCommand): Promise<void>;
}
