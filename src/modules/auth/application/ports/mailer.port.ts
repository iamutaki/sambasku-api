export interface MailerPort {
  sendResetPasswordEmail(to: string, resetUrl: string): Promise<void>;
  sendVerificationOtpEmail(to: string, displayCode: string): Promise<void>;
}
