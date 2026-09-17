import { env } from '@/shared/config/env';
import type { MailerPort } from '../application/ports/mailer.port';
import { ResendMailerService } from './resend-mailer.service';
import { SmtpMailerService } from './smtp-mailer.service';

// Pilih impl MailerPort dari konfigurasi (Section 8 — ganti provider =
// ganti impl, use case tidak tahu bedanya):
// - RESEND_API_KEY ter-set → email HTTP (jalur Cloudflare Workers)
// - selain itu → SMTP (jalur Node staging/production)
// - tidak keduanya → SmtpMailerService mode dev (link reset hanya di-log)
export function createMailer(): MailerPort {
  if (env.RESEND_API_KEY) return new ResendMailerService();
  return new SmtpMailerService();
}
