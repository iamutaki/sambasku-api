import nodemailer from 'nodemailer';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import type { MailerPort } from '../application/ports/mailer.port';
import { rememberOtp } from './otp-capture';
import { accountDeletionEmailHtml, accountDeletionEmailText } from './account-deletion-email';
import { otpEmailHtml, otpEmailText } from './otp-email';
import { resetPasswordEmailHtml, resetPasswordEmailText } from './reset-password-email';
import {
  OTP_EMAIL_LOGO_BASE64,
  OTP_EMAIL_LOGO_CONTENT_ID,
  OTP_EMAIL_LOGO_FILENAME,
  OTP_EMAIL_LOGO_MIME,
} from './otp-email-logo';

// Kalau SMTP belum dikonfigurasi (dev lokal), link reset hanya di-log -
// email asli tidak pernah dikirim diam-diam dari environment sandbox.
export class SmtpMailerService implements MailerPort {
  private transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      })
    : null;

  async sendResetPasswordEmail(to: string, resetUrl: string, displayCode: string): Promise<void> {
    if (!this.transporter) {
      logger.info({ resetUrl, displayCode }, 'DEV: email reset password tidak dikirim, SMTP belum di-set');
      return;
    }

    await this.transporter.sendMail({
      from: env.SMTP_USER,
      to,
      subject: 'Reset password - SambasKu',
      text: resetPasswordEmailText(displayCode),
      html: resetPasswordEmailHtml(displayCode),
      attachments: [
        {
          filename: OTP_EMAIL_LOGO_FILENAME,
          content: Buffer.from(OTP_EMAIL_LOGO_BASE64, 'base64'),
          contentType: OTP_EMAIL_LOGO_MIME,
          cid: OTP_EMAIL_LOGO_CONTENT_ID,
        },
      ],
    });
  }

  async sendAccountDeletionEmail(to: string, displayCode: string, pageUrl: string): Promise<void> {
    rememberOtp(to, displayCode);
    const text = accountDeletionEmailText(displayCode, pageUrl);
    if (!this.transporter) {
      logger.info({ to, displayCode }, 'DEV: email hapus akun tidak dikirim, SMTP belum di-set');
      return;
    }
    await this.transporter.sendMail({
      from: env.SMTP_USER,
      to,
      subject: 'Kode hapus akun - SambasKu',
      text,
      html: accountDeletionEmailHtml(displayCode),
    });
  }

  async sendVerificationOtpEmail(to: string, displayCode: string): Promise<void> {
    rememberOtp(to, displayCode);
    const text = otpEmailText(displayCode);
    if (!this.transporter) {
      logger.info({ to, displayCode }, 'DEV: OTP tidak dikirim, SMTP belum di-set');
      return;
    }
    await this.transporter.sendMail({
      from: env.SMTP_USER,
      to,
      subject: 'Kode verifikasi - SambasKu',
      text,
      html: otpEmailHtml(displayCode),
      attachments: [
        {
          filename: OTP_EMAIL_LOGO_FILENAME,
          content: Buffer.from(OTP_EMAIL_LOGO_BASE64, 'base64'),
          contentType: OTP_EMAIL_LOGO_MIME,
          cid: OTP_EMAIL_LOGO_CONTENT_ID,
        },
      ],
    });
  }
}
