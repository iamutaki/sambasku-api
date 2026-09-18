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
}
