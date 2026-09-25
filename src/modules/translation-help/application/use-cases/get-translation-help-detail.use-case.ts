import type { VoteRepository } from '@/modules/vote/domain/repositories/vote.repository';
import { NotFoundError } from '@/shared/errors/app-error';
import type {
  TranslationHelp,
  TranslationHelpReply,
} from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface TranslationHelpReplyWithVotes extends TranslationHelpReply {
  upvotes: number;
  downvotes: number;
}

export interface TranslationHelpWithUpvotes extends TranslationHelp {
  upvotes: number;
}

export interface GetTranslationHelpDetailResult {
  help: TranslationHelpWithUpvotes;
  replies: TranslationHelpReplyWithVotes[];
}

/**
 * Detail publik: published untuk semua; owner boleh lihat pending/rejected/taken_down sendiri.
 * Admin memakai endpoint terpisah.
 *
 * Vote: pertanyaan = upvotes saja (upvote-only); balasan = up+down.
 * Urutan reply: pinned → net desc → created_at desc.
 */
export class GetTranslationHelpDetailUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly voteRepo: VoteRepository,
  ) {}

  async execute(input: {
    id: string;
    viewerUserId?: string | null;
    /** true = antrean admin, tampilkan semua status */
    asAdmin?: boolean;
  }): Promise<GetTranslationHelpDetailResult> {
    const help = await this.repo.findById(input.id);
    if (!help) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    if (!input.asAdmin) {
      const isOwner = input.viewerUserId != null && help.userId === input.viewerUserId;
      if (help.status !== 'published' && !isOwner) {
        throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
      }
    }

    const rawReplies =
      help.status === 'published' || input.asAdmin
        ? await this.repo.listReplies(help.id)
        : [];

    const voteTargets = [
      { entityType: 'translation_help' as const, entityId: help.id },
      ...rawReplies.map((r) => ({
        entityType: 'translation_help_reply' as const,
        entityId: r.id,
      })),
    ];
    const counts = await this.voteRepo.countMany(voteTargets);

    const helpVotes = counts.get(`translation_help:${help.id}`) ?? {
      upvotes: 0,
      downvotes: 0,
    };

    const withVotes: TranslationHelpReplyWithVotes[] = rawReplies.map((r) => {
      const v = counts.get(`translation_help_reply:${r.id}`) ?? {
        upvotes: 0,
        downvotes: 0,
      };
      return { ...r, upvotes: v.upvotes, downvotes: v.downvotes };
    });

    const pinnedId = help.pinnedReplyId;
    withVotes.sort((a, b) => {
      const aPinned = pinnedId != null && a.id === pinnedId;
      const bPinned = pinnedId != null && b.id === pinnedId;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const netA = a.upvotes - a.downvotes;
      const netB = b.upvotes - b.downvotes;
      if (netA !== netB) return netB - netA;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      help: { ...help, upvotes: helpVotes.upvotes },
      replies: withVotes,
    };
  }
}
