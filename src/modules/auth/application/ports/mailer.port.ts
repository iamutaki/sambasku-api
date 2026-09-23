export interface MailerPort {
  sendResetPasswordEmail(to: string, resetUrl: string, displayCode: string): Promise<void>;
  sendVerificationOtpEmail(to: string, displayCode: string): Promise<void>;
  sendAccountDeletionEmail(to: string, displayCode: string, pageUrl: string): Promise<void>;
}
