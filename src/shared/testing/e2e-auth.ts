import { otpCapture } from '@/modules/auth/infrastructure/otp-capture';

/** Kode tampilan terakhir (XXXX-XXXX) dari mailer. Hanya untuk e2e. */
export function capturedOtpDisplayCode(): string {
  const code = otpCapture.lastDisplayCode;
  if (!code) throw new Error('OTP tidak tertangkap dari mailer');
  return code;
}
