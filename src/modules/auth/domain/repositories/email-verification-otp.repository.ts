import type { EmailVerificationOtp } from '../../domain/entities/email-verification-otp.entity';

export interface NewEmailVerificationOtp {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}

export interface EmailVerificationOtpRepository {
  replaceForUser(input: NewEmailVerificationOtp): Promise<EmailVerificationOtp>;
  findByUserId(userId: string): Promise<EmailVerificationOtp | null>;
  incrementAttempts(id: string): Promise<number>;
  deleteByUserId(userId: string): Promise<void>;
  /**
   * Hapus OTP hanya jika hash cocok (atomic). False = sudah dipakai /
   * tidak ada / hash beda - menjamin kode sekali pakai saat race.
   */
  consumeIfMatch(userId: string, codeHash: string): Promise<boolean>;
}
