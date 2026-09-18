import { z } from 'zod';
import type { VoteTarget, VoteTargetType } from '@/modules/vote/domain/repositories/vote.repository';

const ulid = z.string().length(26, 'ID harus ULID 26 karakter');

export const voteTargetTypeEnum = z.enum(['word', 'meaning', 'example', 'pronunciation', 'word_image', 'comment']);

export const toggleVoteSchema = z.object({
  target_type: voteTargetTypeEnum,
  target_id: ulid,
  // 1 = upvote, -1 = downvote (0 tidak diterima - batal = vote searah ulang)
  value: z.union([z.literal(1), z.literal(-1)]),
});

export type ToggleVoteBody = z.infer<typeof toggleVoteSchema>;

// Panjang 26 + enum type cukup sebagai guard format; guard sesungguhnya
// adalah cek eksistensi di use case (404). Alfabet sengaja longgar
// ([0-9A-Za-z], bukan Crockford ketat) karena fixture ULID handmade di
// repo memakai huruf bebas (mis. 01U2E... mengandung U).
const TARGET_PATTERN = /^(word|meaning|example|pronunciation|word_image|comment):[0-9A-Za-z]{26}$/;
export const MAX_VOTE_TARGETS = 50;

// "word:01X,meaning:01Y" → array target tervalidasi (trim, dedupe, maks 50)
export const targetsQuerySchema = z.object({
  targets: z.string().transform((val, ctx) => {
    const items = [...new Set(val.split(',').map((s) => s.trim()).filter(Boolean))];
    if (
      items.length === 0 ||
      items.length > MAX_VOTE_TARGETS ||
      items.some((i) => !TARGET_PATTERN.test(i))
    ) {
      ctx.addIssue({
        code: 'custom',
        input: val,
        message: `targets harus 1-${MAX_VOTE_TARGETS} pasang "type:id" (ULID 26 char) dipisah koma`,
      });
      return z.NEVER;
    }
    return items.map((i) => {
      const [entityType, entityId] = i.split(':') as [VoteTargetType, string];
      return { entityType, entityId } satisfies VoteTarget;
    });
  }),
});

export const toggleVoteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    target_type: voteTargetTypeEnum,
    target_id: z.string(),
    my_vote: z.union([z.literal(1), z.literal(-1), z.null()]),
    upvotes: z.number().int(),
    downvotes: z.number().int(),
  }),
});

export const voteCountsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      target_type: voteTargetTypeEnum,
      target_id: z.string(),
      upvotes: z.number().int(),
      downvotes: z.number().int(),
    }),
  ),
});

export const myVotesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      target_type: voteTargetTypeEnum,
      target_id: z.string(),
      value: z.union([z.literal(1), z.literal(-1)]),
    }),
  ),
});
