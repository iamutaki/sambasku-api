import { z } from 'zod';

export const deleteOwnAccountSchema = z.object({
  confirmation: z.string().refine((value) => value === 'HAPUS', {
    message: 'Ketik HAPUS untuk mengonfirmasi',
  }),
  password: z.string().optional(),
});

export type DeleteOwnAccountBody = z.infer<typeof deleteOwnAccountSchema>;

export const requestAccountDeletionSchema = z.object({
  email: z.email(),
});

export type RequestAccountDeletionBody = z.infer<typeof requestAccountDeletionSchema>;

export const confirmAccountDeletionSchema = z.object({
  email: z.email(),
  code: z.string().min(1, 'Kode wajib diisi'),
  confirmation: z.string().refine((value) => value === 'HAPUS', {
    message: 'Ketik HAPUS untuk mengonfirmasi',
  }),
});

export type ConfirmAccountDeletionBody = z.infer<typeof confirmAccountDeletionSchema>;

export const accountDeletionMessageSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});
