import { createHash, randomBytes } from 'node:crypto';

// Refresh/reset token = random string 96-char hex; disimpan hanya SHA-256 hash-nya.
// SHA-256 cukup untuk token high-entropy (bukan password — itu tugas argon2).
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
