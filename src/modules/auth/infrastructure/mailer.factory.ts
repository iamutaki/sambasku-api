import { env } from '@/shared/config/env';
import type { MailerPort } from '../application/ports/mailer.port';
import { ResendMailerService } from './resend-mailer.service';
import { SmtpMailerService } from './smtp-mailer.service';

// Pilih impl MailerPort dari konfigurasi (Section 8 - ganti provider =
// ganti impl, use case tidak tahu bedanya):
// MAIL_PROVIDER=resend|smtp. Kosong: Resend jika key ada, else SMTP/log.
export function createMailer(): MailerPort {
  const named = env.MAIL_PROVIDER?.trim().toLowerCase();
  if (named === 'resend') return new ResendMailerService();
  if (named === 'smtp') return new SmtpMailerService();
  if (env.RESEND_API_KEY) return new ResendMailerService();
  return new SmtpMailerService();
}
