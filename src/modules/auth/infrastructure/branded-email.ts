import { OTP_EMAIL_LOGO_CONTENT_ID } from './otp-email-logo';

const NAVY = '#1B365D';
const GOLD = '#C5A35A';
const CREAM = '#F6F1E8';
const MUTED = '#6B7280';

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Hanya http(s). Nilai lain diabaikan supaya href tidak jadi javascript:. */
export function emailActionHref(url: string): string | null {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return escapeEmailHtml(trimmed);
}

function documentShell(title: string, rows: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeEmailHtml(title)}</title>
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
              <img src="cid:${OTP_EMAIL_LOGO_CONTENT_ID}" width="300" alt="SambasKu" style="display:block;border:0;width:300px;max-width:100%;height:auto;" />
            </td>
          </tr>
${rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function eyebrowRow(label: string): string {
  return `          <tr>
            <td align="center" style="padding:4px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;color:${GOLD};">
              ${escapeEmailHtml(label)}
            </td>
          </tr>`;
}

/** Kartu kode 8 karakter — dipakai verifikasi, reset password, dan hapus akun. */
export function brandedCodeEmailHtml(input: {
  title: string;
  eyebrow: string;
  intro: string;
  code: string;
  note: string;
  detail?: string;
  action?: { href: string; label: string };
  footer: string;
}): string {
  const actionHref = input.action ? emailActionHref(input.action.href) : null;
  const detail = input.detail
    ? `
          <tr>
            <td align="center" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${NAVY};">
              ${escapeEmailHtml(input.detail)}
            </td>
          </tr>`
    : '';
  const action = actionHref && input.action
    ? `
          <tr>
            <td align="center" style="padding:12px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">
              <a href="${actionHref}" style="color:${NAVY};font-weight:700;text-decoration:underline;">${escapeEmailHtml(input.action.label)}</a>
            </td>
          </tr>`
    : '';

  return documentShell(
    input.title,
    `${eyebrowRow(input.eyebrow)}
          <tr>
            <td align="center" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${MUTED};">
              ${escapeEmailHtml(input.intro)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${GOLD};border-radius:12px;background:${CREAM};">
                <tr>
                  <td style="padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;letter-spacing:3px;font-weight:700;color:${NAVY};">
                    ${escapeEmailHtml(input.code)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${NAVY};">
              ${escapeEmailHtml(input.note)}
            </td>
          </tr>${detail}${action}
          <tr>
            <td align="center" style="padding:8px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              ${escapeEmailHtml(input.footer)}
            </td>
          </tr>`,
  );
}

/** Kartu pesan tanpa kode — ucapan dan pemberitahuan. */
export function brandedMessageEmailHtml(input: {
  title: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  footer: string;
}): string {
  const paragraphs = input.paragraphs
    .map(
      (paragraph, index) => `          <tr>
            <td align="center" style="padding:${index === 0 ? '16px' : '12px'} 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${index === 0 ? NAVY : MUTED};">
              ${escapeEmailHtml(paragraph)}
            </td>
          </tr>`,
    )
    .join('\n');

  return documentShell(
    input.title,
    `${eyebrowRow(input.eyebrow)}
          <tr>
            <td align="center" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:1.3;color:${NAVY};">
              ${escapeEmailHtml(input.heading)}
            </td>
          </tr>
${paragraphs}
          <tr>
            <td align="center" style="padding:16px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
              ${escapeEmailHtml(input.footer)}
            </td>
          </tr>`,
  );
}
