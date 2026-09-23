import { OTP_EMAIL_LOGO_CONTENT_ID } from './otp-email-logo';

export const DEFAULT_MAIL_FROM = 'SambasKu <no-reply@iamutaki.com>';

const NAVY = '#1B365D';
const GOLD = '#C5A35A';
const CREAM = '#F6F1E8';
const MUTED = '#6B7280';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function otpEmailText(displayCode: string): string {
  return (
    `Kode verifikasi SambasKu (berlaku 10 menit): ${displayCode}\n\n` +
    'Jangan bagikan kode ini. Abaikan email ini jika Anda tidak mendaftar.'
  );
}

export function otpEmailHtml(displayCode: string): string {
  const code = escapeHtml(displayCode);
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kode verifikasi SambasKu</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eadfcd;">
          <tr>
            <td style="height:6px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px 12px;">
              <img src="cid:${OTP_EMAIL_LOGO_CONTENT_ID}" width="220" alt="SambasKu" style="display:block;border:0;width:220px;max-width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:4px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;color:${GOLD};">
              Verifikasi akun
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${MUTED};">
              Masukkan 8 karakter 0-9A-Z di aplikasi
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${GOLD};border-radius:12px;background:${CREAM};">
                <tr>
                  <td style="padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;letter-spacing:3px;font-weight:700;color:${NAVY};">
                    ${code}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${NAVY};">
              Berlaku 10 menit. Format tampilan XXXX-XXXX.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              Jangan bagikan kode ini. Abaikan email ini jika Anda tidak mendaftar di SambasKu.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
