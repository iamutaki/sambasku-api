import { env } from '@/shared/config/env';
import { BadGatewayError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import type { MailerPort } from '../application/ports/mailer.port';
import { rememberOtp } from './otp-capture';
import { accountDeletionEmailHtml, accountDeletionEmailText } from './account-deletion-email';
import { verifierApprovedEmailHtml, verifierApprovedEmailText } from './verifier-approved-email';
import { DEFAULT_MAIL_FROM, otpEmailHtml, otpEmailText } from './otp-email';
import { resetPasswordEmailHtml, resetPasswordEmailText } from './reset-password-email';
import {
  OTP_EMAIL_LOGO_BASE64,
  OTP_EMAIL_LOGO_CONTENT_ID,
  OTP_EMAIL_LOGO_FILENAME,
  OTP_EMAIL_LOGO_MIME,
} from './otp-email-logo';

// Email via API HTTP (Resend) - jalur untuk Cloudflare Workers karena SMTP
// butuh socket TCP yang tidak tersedia di Workers. Tetap implements
// MailerPort (Section 8): ganti provider email HTTP lain = satu file ini.
// Tanpa API key (dev lokal): log saja. Dengan API key: gagal kirim → error
// supaya UI hapus-akun/OTP tidak bilang "terkirim" padahal Resend menolak.
export class ResendMailerService implements MailerPort {
  async sendResetPasswordEmail(to: string, _resetUrl: string, displayCode: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset password - SambasKu',
      text: resetPasswordEmailText(displayCode),
      html: resetPasswordEmailHtml(displayCode),
      inlineLogo: true,
    });
  }

  async sendAccountDeletionEmail(to: string, displayCode: string, pageUrl: string): Promise<void> {
    rememberOtp(to, displayCode);
    await this.send({
      to,
      subject: 'Kode hapus akun - SambasKu',
      text: accountDeletionEmailText(displayCode, pageUrl),
      html: accountDeletionEmailHtml(displayCode, pageUrl),
      inlineLogo: true,
    });
  }

  async sendVerifierApprovedEmail(to: string, displayName: string): Promise<void> {
    await this.send({
      to,
      subject: 'Selamat menjadi Verifikator - SambasKu',
      text: verifierApprovedEmailText(displayName),
      html: verifierApprovedEmailHtml(displayName),
      inlineLogo: true,
    });
  }

  async sendVerificationOtpEmail(to: string, displayCode: string): Promise<void> {
    rememberOtp(to, displayCode);
    await this.send({
      to,
      subject: 'Kode verifikasi - SambasKu',
      text: otpEmailText(displayCode),
      html: otpEmailHtml(displayCode),
      inlineLogo: true,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    inlineLogo?: boolean;
  }): Promise<void> {
    if (!env.RESEND_API_KEY) {
      logger.info({ to: input.to, subject: input.subject }, 'DEV: Resend tanpa API key, email tidak dikirim');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        from: env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
      };
      if (input.html) payload.html = input.html;
      if (input.inlineLogo) {
        payload.attachments = [
          {
            content: OTP_EMAIL_LOGO_BASE64,
            filename: OTP_EMAIL_LOGO_FILENAME,
            content_type: OTP_EMAIL_LOGO_MIME,
            content_id: OTP_EMAIL_LOGO_CONTENT_ID,
          },
        ];
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error({ status: res.status, body }, 'Resend kirim email gagal');
        throw new BadGatewayError('EMAIL_SEND_FAILED', 'Gagal mengirim email. Coba lagi sebentar.');
      }
    } catch (err) {
      if (err instanceof BadGatewayError) throw err;
      logger.error({ err }, 'Resend kirim email error');
      throw new BadGatewayError('EMAIL_SEND_FAILED', 'Gagal mengirim email. Coba lagi sebentar.');
    }
  }
}
