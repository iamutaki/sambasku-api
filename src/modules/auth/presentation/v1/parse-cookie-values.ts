/**
 * Semua nilai cookie dengan nama yang sama (urutan header).
 *
 * Hono `getCookie` hanya mengambil yang pertama. Setelah
 * `REFRESH_COOKIE_DOMAIN=.sambasku.com`, browser sering menyimpan
 * cookie host-only lama + cookie Domain baru - keduanya dikirim ke
 * `api.sambasku.com`. Mengambil yang pertama saja = token rotasi lama
 * di luar grace → 401 saat reload.
 */
export function getAllCookieValues(cookieHeader: string | null, name: string): string[] {
  if (!cookieHeader) return [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}
