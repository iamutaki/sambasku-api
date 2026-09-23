import type { PasswordHasherPort } from '../application/ports/password-hasher.port';

// PBKDF2-HMAC-SHA256 via Web Crypto - NATIF di Node 18+ dan Cloudflare
// Workers, tanpa WASM. (hash-wasm/argon2 tidak bisa dipakai: Workers
// melarang kompilasi WASM dinamis - hanya .wasm statis hasil build.)
//
// ponytail: 100.000 iterasi = PLAFON Cloudflare Workers ("iteration counts
// above 100000 are not supported") - di bawah rekomendasi OWASP 600k.
// Kompensasi: rate limit login ketat (5/15 menit, Section 15). Naikkan ke
// @noble/hashes scrypt (pure-JS, memory-hard, tanpa plafon) kalau threat
// model-nya menuntut - format hash self-describing membuat migrasi mulus.
//
// Format hash menyimpan parameternya sendiri (self-describing) sehingga
// verifikasi tetap benar walau parameter naik di masa depan:
//   pbkdf2-sha256$<iterasi>$<salt_b64>$<hash_b64>
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = 'pbkdf2-sha256';

const encoder = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function derive(
  password: string,
  // Uint8Array<ArrayBuffer> (bukan default ArrayBufferLike) agar memenuhi
  // BufferSource milik Web Crypto di TypeScript baru
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

// Perbandingan konstan-waktu - jangan bocorkan posisi byte yang beda
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export class Pbkdf2PasswordService implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(plain, salt, ITERATIONS, KEY_BYTES);
    return [PREFIX, ITERATIONS, toB64(salt), toB64(key)].join('$');
  }

  async compare(plain: string, passwordHash: string): Promise<boolean> {
    try {
      const [prefix, iterationsText, saltB64, hashB64] = passwordHash.split('$');
      if (prefix !== PREFIX) {
        // Hash format lama (mis. argon2 dari era pra-Workers) tidak bisa
        // diverifikasi di runtime tanpa WASM - gagal login, user lewat
        // jalur forgot-password. (Staging/dev: jalankan ulang `pnpm seed`
        // untuk meng-hash ulang semua user.)
        return false;
      }
      const iterations = Number.parseInt(iterationsText, 10);
      if (!Number.isFinite(iterations) || iterations < 1) return false;
      const key = await derive(plain, fromB64(saltB64), iterations, KEY_BYTES);
      return timingSafeEqual(key, fromB64(hashB64));
    } catch {
      return false; // hash rusak/format salah → anggap gagal, bukan crash
    }
  }
}
