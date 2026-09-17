import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import type { MailerPort } from '../application/ports/mailer.port';

// Email via API HTTP (Resend) — jalur untuk Cloudflare Workers karena SMTP
// butuh socket TCP yang tidak tersedia di Workers. Tetap implements
// MailerPort (Section 8): ganti provider email HTTP lain = satu file ini.
// Best-effort, pola yang sama dengan SmtpMailerService: kegagalan kirim
// di-log, TIDAK dilempar (endpoint forgot-password selalu 200 — anti-
// enumeration).
export class ResendMailerService implements MailerPort {
  async sendResetPasswordEmail(to: string, resetUrl: string): Promise<void> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: env.MAIL_FROM ?? 'Kamus Sambas <onboarding@resend.dev>',
          to,
          subject: 'Reset Password — Kamus Digital Sambas-Indonesia',
          text: `Link reset password Anda (berlaku 1 jam):\n${resetUrl}\n\nAbaikan email ini jika Anda tidak meminta reset password.`,
        }),
      });
      if (!res.ok) {
        logger.error({ status: res.status }, 'Resend kirim email gagal');
      }
    } catch (err) {
      logger.error({ err }, 'Resend kirim email error');
    }
  }
}
