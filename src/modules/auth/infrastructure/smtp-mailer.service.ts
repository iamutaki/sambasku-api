import nodemailer from 'nodemailer';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import type { MailerPort } from '../application/ports/mailer.port';

// Kalau SMTP belum dikonfigurasi (dev lokal), link reset hanya di-log —
// email asli tidak pernah dikirim diam-diam dari environment sandbox.
export class SmtpMailerService implements MailerPort {
  private transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      })
    : null;

  async sendResetPasswordEmail(to: string, resetUrl: string): Promise<void> {
    if (!this.transporter) {
      logger.info({ resetUrl }, 'DEV: email reset password tidak dikirim, SMTP belum di-set');
      return;
    }

    await this.transporter.sendMail({
      from: env.SMTP_USER,
      to,
      subject: 'Reset Password — Kamus Digital Sambas-Indonesia',
      text: `Link reset password Anda (berlaku 1 jam):\n${resetUrl}\n\nAbaikan email ini jika Anda tidak meminta reset password.`,
    });
  }
}
