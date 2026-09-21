import { OTP_EMAIL_LOGO_CONTENT_ID } from './otp-email-logo';

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

export function resetPasswordEmailText(resetUrl: string, displayCode: string): string {
  return (
    `Kode reset password SambasKu (berlaku 10 menit): ${displayCode}\n\n` +
    `Atau tautan cadangan (berlaku 1 jam):\n${resetUrl}\n\n` +
    'Abaikan email ini jika Anda tidak meminta reset password.'
  );
}

export function resetPasswordEmailHtml(resetUrl: string, displayCode: string): string {
  const code = escapeHtml(displayCode);
  const href = escapeHtml(resetUrl);
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset password SambasKu</title>
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
              Reset password
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
            <td align="center" style="padding:16px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              Cadangan: ketuk tautan jika lebih nyaman di browser.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:4px 32px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="${NAVY}" style="border-radius:12px;border:1px solid ${GOLD};">
                    <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Atur password baru
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              Abaikan email ini jika Anda tidak meminta reset password di SambasKu.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
