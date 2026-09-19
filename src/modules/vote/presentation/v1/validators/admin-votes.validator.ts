import { z } from 'zod';

const VoteTargetTypeZodEnum = z.enum(['word', 'meaning', 'example', 'pronunciation', 'word_image', 'comment']);
export type AdminVoteTargetType = z.infer<typeof VoteTargetTypeZodEnum>;

// Query: GET /api/v1/admin/votes
export const listAdminVotesQuerySchema = z.object({
  // Partial match username ATAU email voter (case-insensitive ILIKE)
  q: z.string().max(100).optional(),
  // Filter exact target_type enum
  target_type: VoteTargetTypeZodEnum.optional(),
  // Filter exact vote value: 1 = up, -1 = down
  value: z.coerce
    .number()
    .int()
    .refine((v) => v === 1 || v === -1, { message: 'Vote value harus 1 atau -1' })
    .optional(),
  // Filter exact target_id (26 char ULID) untuk vote satu target
  target_id: z.string().length(26).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Compound cursor base64 (createdAt:id)
  cursor: z.string().optional(),
});
export type ListAdminVotesQuery = z.infer<typeof listAdminVotesQuerySchema>;

// Params: DELETE /api/v1/admin/votes/:id
export const deleteAdminVoteParamsSchema = z.object({
  id: z.string().length(26),
});
export type DeleteAdminVoteParams = z.infer<typeof deleteAdminVoteParamsSchema>;

// Body: DELETE /api/v1/admin/votes/reset-target
export const resetTargetVotesBodySchema = z.object({
  target_type: VoteTargetTypeZodEnum,
  target_id: z.string().length(26),
});
export type ResetTargetVotesBody = z.infer<typeof resetTargetVotesBodySchema>;

// Query: GET /api/v1/admin/votes/top-targets
export const topVoteTargetsQuerySchema = z.object({
  target_type: VoteTargetTypeZodEnum.default('word'),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
export type TopVoteTargetsQuery = z.infer<typeof topVoteTargetsQuerySchema>;

// ---------------- Wire response schemas ----------------
const adminVoteWireSchema = z.object({
  id: z.string().length(26),
  voter_id: z.string().length(26),
  voter_username: z.string(),
  voter_email: z.string().email(),
  target_type: VoteTargetTypeZodEnum,
  target_id: z.string().length(26),
  target_preview: z.string().nullable(),
  value: z.union([z.literal(1), z.literal(-1)]),
  created_at: z.string(), // ISO date string
  updated_at: z.string().nullable(),
});

export const listAdminVotesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(adminVoteWireSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const deleteAdminVoteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string() }),
});

export const resetTargetVotesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    target_type: VoteTargetTypeZodEnum,
    target_id: z.string().length(26),
    deleted_count: z.number().int().nonnegative(),
  }),
});

const adminTopTargetWireSchema = z.object({
  target_type: VoteTargetTypeZodEnum,
  target_id: z.string().length(26),
  target_preview: z.string().nullable(),
  upvotes: z.number().int().nonnegative(),
  downvotes: z.number().int().nonnegative(),
  net: z.number().int(),
});

export const topVoteTargetsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(adminTopTargetWireSchema),
});
