import { z } from 'zod';
import type { VoteTarget, VoteTargetType } from '@/modules/vote/domain/repositories/vote.repository';
import { opaqueId } from '@/shared/validation/id';

const ulid = opaqueId;

export const voteTargetTypeEnum = z.enum([
  'word',
  'meaning',
  'example',
  'pronunciation',
  'word_image',
  'comment',
  'translation_help_reply',
  'translation_help',
]);

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
const TARGET_PATTERN =
  /^(word|meaning|example|pronunciation|word_image|comment|translation_help_reply|translation_help):[0-9A-Za-z]{26}$/;
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

export const voteHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
  target_type: voteTargetTypeEnum.optional(),
  value: z.enum(['1', '-1']).optional(),
});

export type VoteHistoryQuery = z.infer<typeof voteHistoryQuerySchema>;

const voteHistoryWordSchema = z.object({
  id: z.string(),
  lemma: z.string(),
  word_type: z.string(),
  is_verified: z.boolean(),
});

export const voteHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      target_type: voteTargetTypeEnum,
      target_id: z.string(),
      value: z.union([z.literal(1), z.literal(-1)]),
      voted_at: z.string(),
      word: voteHistoryWordSchema.nullable(),
    }),
  ),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
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

/** GET /api/v1/votes/deck - antrean kata belum di-vote (34-api-vote-deck.md). */
export const voteDeckQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  cursor: z.string().min(1).optional(),
});

export type VoteDeckQuery = z.infer<typeof voteDeckQuerySchema>;

export const voteDeckResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      lemma: z.string(),
      language_id: z.string(),
      language_code: z.string(),
      word_type: z.string(),
      status: z.string(),
      is_verified: z.boolean(),
      approved_at: z.string(),
      sense: z.string().nullable(),
      upvotes: z.number().int(),
      downvotes: z.number().int(),
    }),
  ),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});
