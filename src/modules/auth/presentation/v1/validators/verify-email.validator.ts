import { z } from 'zod';
import { loginResponseSchema } from './login.validator';

export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().trim().min(6).max(16),
  client_type: z.enum(['web', 'mobile']).default('web'),
});

export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;

export const verifyEmailResponseSchema = loginResponseSchema;

export const resendOtpSchema = z.object({
  email: z.email(),
});

export type ResendOtpBody = z.infer<typeof resendOtpSchema>;

export const resendOtpResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});
