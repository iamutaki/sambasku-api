import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
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
  /** Dari JWT azp - atribusi klien */
  clientId?: string | null;
}

// Toggle vote (08-api-upvote-downvote.md): vote searah kedua kali = batal,
// beda arah = replace - server yang memutuskan, client hanya mengirim arah
// yang dipilih user. TANPA audit (KEPUTUSAN PRODUK: volume tinggi, bukan
// aksi admin; analitik cukup dari tabel votes sendiri).
//
// KEPUTUSAN PRODUK: target `translation_help` (pertanyaan) upvote-only -
// downvote ditolak (komunitas minta bantuan, bukan konten yang di-downvote).
export class ToggleVoteUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(cmd: ToggleVoteCommand): Promise<ToggleVoteResult> {
    if (cmd.targetType === 'translation_help' && cmd.value === -1) {
      throw new ValidationError([
        {
          field: 'value',
          message: 'Pertanyaan bantuan hanya bisa di-upvote',
        },
      ]);
    }

    const target = { entityType: cmd.targetType, entityId: cmd.targetId };

    // Eksistensi target hanya dicek di endpoint tulis ini - vote ke target
    // yang sudah dihapus → 404 (endpoint counts sengaja tidak mengecek).
    if (!(await this.voteRepo.targetExists(target))) {
      throw new NotFoundError('VOTE_TARGET_NOT_FOUND', 'Target vote tidak ditemukan atau sudah dihapus');
    }

    return this.voteRepo.toggle(cmd.userId, target, cmd.value, cmd.clientId ?? null);
  }
}
