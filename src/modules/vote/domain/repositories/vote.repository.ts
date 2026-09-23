// Target vote yang dikenal (08-api-upvote-downvote.md): entitas kamus +
// children-nya + komentar (09-api-comment.md).
export type VoteTargetType = 'word' | 'meaning' | 'example' | 'pronunciation' | 'word_image' | 'comment';

export interface VoteTarget {
  entityType: VoteTargetType;
  entityId: string;
}

export interface VoteCounts {
  upvotes: number;
  downvotes: number;
}

export interface ToggleVoteResult extends VoteCounts {
  /** State final user pada target: null = vote batal (toggle off) */
  myVote: 1 | -1 | null;
}

/**
 * Entity Vote dasar (schema tabel votes, 08-api-upvote-downvote.md).
 * Vote mati = hard delete (TIDAK ada deleted_at).
 */
export interface Vote {
  id: string;
  userId: string;
  entityType: VoteTargetType;
  entityId: string;
  value: 1 | -1;
  createdAt: Date;
  updatedAt: Date | null;
}

/** Item hasil join listAdmin votes + users (preview voter, tanpa password_hash). */
export interface AdminVoteListItem extends Vote {
  voterUsername: string;
  voterEmail: string;
  /** Label manusiawi target (body komentar / lemma / dst). Null jika target hilang. */
  targetPreview: string | null;
}

export interface AdminVoteCursor {
  createdAt: Date;
  id: string;
}

export interface AdminVoteListFilter {
  q?: string;
  entityType?: VoteTargetType;
  value?: 1 | -1;
  targetId?: string;
}

export interface AdminVoteListResult {
  items: AdminVoteListItem[];
  meta: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface AdminTopVoteTarget {
  entityType: VoteTargetType;
  entityId: string;
  upvotes: number;
  downvotes: number;
  net: number;
  targetPreview: string | null;
}

const ADMIN_CURSOR_SEP = ':';

/**
 * Encode compound cursor (created_at, id) ke base64url string.
 * Pure function (no framework) - aman re-export di domain.
 */
export function encodeAdminCursor(c: AdminVoteCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}${ADMIN_CURSOR_SEP}${c.id}`).toString('base64url');
}

/**
 * Decode cursor string ke AdminVoteCursor.
 * Domain TIDAK mengimport NotFoundError (lempar generic Error saja).
 * Presentation / Use Case layer yang wrap ke NotFoundError ber-code.
 */
export function decodeAdminCursor(s: string): AdminVoteCursor {
  const raw = Buffer.from(s, 'base64url').toString();
  const [iso, id] = raw.split(ADMIN_CURSOR_SEP);
  if (!iso || !id) throw new Error('INVALID_CURSOR_FORMAT');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_CURSOR_DATE');
  return { createdAt: d, id };
}

/** Ringkasan kata induk untuk baris riwayat vote. Null di item jika hilang. */
export interface VoteHistoryWord {
  id: string;
  lemma: string;
  wordType: string;
  isVerified: boolean;
}

export interface VoteHistoryItem {
  id: string;
  entityType: VoteTargetType;
  entityId: string;
  value: 1 | -1;
  /** votes.created_at - waktu pasang pertama, bukan ganti arah. */
  votedAt: Date;
  word: VoteHistoryWord | null;
}

export interface VoteHistoryListOptions {
  limit: number;
  cursor?: string;
  targetType?: VoteTargetType;
  value?: 1 | -1;
}

export interface VoteHistoryListResult {
  items: VoteHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface VoteRepository {
  /**
   * Cek target ada & belum soft-deleted (per tabel by PK). TIDAK memfilter
   * status - kata pending_review pun boleh di-vote by id (tidak berbahaya:
   * tidak pernah tampil publik).
   */
  targetExists(target: VoteTarget): Promise<boolean>;

  /**
   * Toggle SATU transaction: vote searah kedua kali = batal (baris dihapus
   * hard); baru / beda arah = upsert (ON CONFLICT DO UPDATE). Return state
   * final + counts segar. DIJAMIN atomik - use case tidak perlu tahu soal
   * transaction.
   */
  toggle(userId: string, target: VoteTarget, value: 1 | -1): Promise<ToggleVoteResult>;

  /**
   * Counts batch - key map "entityType:entityId". Target tanpa vote TIDAK
   * ikut di map (use case melengkapi 0/0 - SQL tetap sederhana).
   */
  countMany(targets: VoteTarget[]): Promise<Map<string, VoteCounts>>;

  /** Vote milik user untuk target batch - hanya target yang dipilih user. */
  findUserVotes(userId: string, targets: VoteTarget[]): Promise<Map<string, 1 | -1>>;

  /**
   * Riwayat vote satu user, terbaru dulu (id DESC). Page dulu (LIMIT+1),
   * lalu resolve kata induk. Baris tetap ada walau kata hilang (`word` null).
   */
  listByUser(userId: string, opts: VoteHistoryListOptions): Promise<VoteHistoryListResult>;

  /**
   * List vote admin cursor pagination compound (created_at, id) desc.
   * Join users (username, email) filter deleted_at users IS NULL.
   * ILIKE username/email untuk `q`. LIMIT+1 has_more detection.
   */
  listAdmin(
    filter: AdminVoteListFilter,
    limit: number,
    cursor: AdminVoteCursor | null,
  ): Promise<AdminVoteListResult>;

  /**
   * Hard delete satu vote by PK. NotFoundError jika 0 rows.
   * Vote tidak punya soft delete (schema KEPUTUSAN semantic: baris hilang).
   */
  deleteById(id: string): Promise<void>;

  /**
   * Hard delete SEMUA vote untuk target (spam brigading recovery).
   * Return count baris yang dihapus (0 = target tidak punya vote).
   */
  resetTarget(target: VoteTarget): Promise<number>;

  /**
   * Top target terurut skor bersih (net = sum(value)) desc.
   * GROUP BY (entity_type, entity_id). Filter entity_type exact match.
   */
  getTopTargets(entityType: VoteTargetType, limit: number): Promise<AdminTopVoteTarget[]>;
}
