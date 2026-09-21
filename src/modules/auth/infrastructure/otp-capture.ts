/** Capture last OTP for e2e. Jangan diandalkan di production. */
export const otpCapture: { lastTo: string | null; lastDisplayCode: string | null } = {
  lastTo: null,
  lastDisplayCode: null,
};

export function rememberOtp(to: string, displayCode: string): void {
  otpCapture.lastTo = to;
  otpCapture.lastDisplayCode = displayCode;
}
