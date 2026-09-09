export interface MailerPort {
  sendResetPasswordEmail(to: string, resetUrl: string): Promise<void>;
}
