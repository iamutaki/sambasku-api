import { z } from 'zod';
import {
  TAKEDOWN_REASON_CODES,
  WORD_REPORT_REASON_CODES,
} from '@/modules/word/domain/entities/word.entity';
import { opaqueId } from '@/shared/validation/id';

export const takedownReasonCodeSchema = z.enum(TAKEDOWN_REASON_CODES);
export const wordReportReasonCodeSchema = z.enum(WORD_REPORT_REASON_CODES);

const noteSchema = z.string().trim().max(1000, 'Catatan maksimal 1000 karakter').optional();

function requireNoteForReason(
  value: { reason_code: (typeof WORD_REPORT_REASON_CODES)[number]; note?: string },
  ctx: z.RefinementCtx,
) {
  const note = value.note?.trim() ?? '';
  if ((value.reason_code === 'other' || value.reason_code === 'duplicate') && note.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'Catatan wajib diisi untuk alasan ini',
    });
  }
}

export const createWordReportBodySchema = z
  .object({
    reason_code: wordReportReasonCodeSchema,
    note: noteSchema,
    image_id: opaqueId.optional(),
  })
  .superRefine(requireNoteForReason)
  .superRefine((value, ctx) => {
    if (value.reason_code === 'violent_image' && !value.image_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['image_id'],
        message: 'ID foto wajib diisi untuk laporan kekerasan',
      });
    }
    if (value.reason_code !== 'violent_image' && value.image_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['image_id'],
        message: 'image_id hanya untuk alasan violent_image',
      });
    }
  });

export const takedownWordBodySchema = z
  .object({
    reason_code: takedownReasonCodeSchema,
    note: noteSchema,
  })
  .superRefine((value, ctx) => {
    const note = value.note?.trim() ?? '';
    if ((value.reason_code === 'other' || value.reason_code === 'duplicate') && note.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Catatan wajib diisi untuk alasan ini',
      });
    }
  });

export const resolveWordReportBodySchema = z.object({
  note: noteSchema,
});

export const wordIdParamSchema = z.object({ id: opaqueId });
export const wordReportIdParamSchema = z.object({ id: opaqueId });

export const listWordReportsQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
});

export const createWordReportResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    word_id: z.string(),
    image_id: z.string().nullable().optional(),
    status: z.literal('open'),
    created_at: z.string(),
  }),
});

export const wordReportItemSchema = z.object({
  id: z.string(),
  word_id: z.string(),
  image_id: z.string().nullable(),
  lemma: z.string(),
  word_status: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  reason_code: wordReportReasonCodeSchema,
  note: z.string().nullable(),
  status: z.enum(['open', 'resolved']),
  resolution: z.enum(['dismissed', 'taken_down', 'corrected', 'flagged_image']).nullable(),
  resolution_note: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

export const wordReportItemResponseSchema = z.object({
  success: z.literal(true),
  data: wordReportItemSchema,
});

export const wordReportListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(wordReportItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export type CreateWordReportBody = z.infer<typeof createWordReportBodySchema>;
export type TakedownWordBody = z.infer<typeof takedownWordBodySchema>;
export type ResolveWordReportBody = z.infer<typeof resolveWordReportBodySchema>;
export type ListWordReportsQuery = z.infer<typeof listWordReportsQuerySchema>;
