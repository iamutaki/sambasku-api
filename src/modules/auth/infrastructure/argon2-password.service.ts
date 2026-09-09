import { hash, verify } from 'argon2';
import type { PasswordHasherPort } from '../application/ports/password-hasher.port';

// argon2 memakai default argon2id — rekomendasi OWASP untuk password hashing
export class Argon2PasswordService implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async compare(plain: string, passwordHash: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false; // hash rusak/format salah → anggap gagal, bukan crash
    }
  }
}
