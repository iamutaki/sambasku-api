import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import type { MailerPort } from '../application/ports/mailer.port';
import { rememberOtp } from './otp-capture';

// Email via API HTTP (Resend) - jalur untuk Cloudflare Workers karena SMTP
// butuh socket TCP yang tidak tersedia di Workers. Tetap implements
// MailerPort (Section 8): ganti provider email HTTP lain = satu file ini.
// Best-effort: kegagalan kirim di-log, TIDAK dilempar.
export class ResendMailerService implements MailerPort {
  async sendResetPasswordEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      'Reset Password - Kamus Digital Sambas-Indonesia',
      `Link reset password Anda (berlaku 1 jam):\n${resetUrl}\n\nAbaikan email ini jika Anda tidak meminta reset password.`,
    );
  }

  async sendVerificationOtpEmail(to: string, displayCode: string): Promise<void> {
    rememberOtp(to, displayCode);
    await this.send(
      to,
      'Kode verifikasi - SambasKu',
      `Kode verifikasi SambasKu (berlaku 10 menit): ${displayCode}\n\nJangan bagikan kode ini. Abaikan email ini jika Anda tidak mendaftar.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!env.RESEND_API_KEY) {
      logger.info({ to, subject }, 'DEV: Resend tanpa API key, email tidak dikirim');
      return;
    }
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
          subject,
          text,
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
