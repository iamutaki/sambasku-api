export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token?: string;
  email?: string;
  code?: string;
  newPassword: string;
}
