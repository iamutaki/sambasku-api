export interface EmailVerificationOtp {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  createdAt: Date;
}
