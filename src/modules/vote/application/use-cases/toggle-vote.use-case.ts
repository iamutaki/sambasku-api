import { NotFoundError } from '@/shared/errors/app-error';
import type {
  ToggleVoteResult,
  VoteRepository,
  VoteTargetType,
} from '../../domain/repositories/vote.repository';

export interface ToggleVoteCommand {
  userId: string;
  targetType: VoteTargetType;
  targetId: string;
  value: 1 | -1;
}

// Toggle vote (08-api-upvote-downvote.md): vote searah kedua kali = batal,
// beda arah = replace - server yang memutuskan, client hanya mengirim arah
// yang dipilih user. TANPA audit (KEPUTUSAN PRODUK: volume tinggi, bukan
// aksi admin; analitik cukup dari tabel votes sendiri).
export class ToggleVoteUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(cmd: ToggleVoteCommand): Promise<ToggleVoteResult> {
    const target = { entityType: cmd.targetType, entityId: cmd.targetId };

    // Eksistensi target hanya dicek di endpoint tulis ini - vote ke target
    // yang sudah dihapus → 404 (endpoint counts sengaja tidak mengecek).
    if (!(await this.voteRepo.targetExists(target))) {
      throw new NotFoundError('VOTE_TARGET_NOT_FOUND', 'Target vote tidak ditemukan atau sudah dihapus');
    }

    return this.voteRepo.toggle(cmd.userId, target, cmd.value);
  }
}
