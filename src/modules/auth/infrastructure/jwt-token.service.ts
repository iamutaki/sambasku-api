import { importPKCS8, importSPKI, jwtVerify, SignJWT, errors } from 'jose';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AccessTokenPayload, TokenServicePort } from '../application/ports/token-service.port';

export interface JwtTokenServiceOptions {
  privateKeyPem: string;
  publicKeyPem: string;
  accessTokenTtlSeconds: number;
}

// RS256: private key menandatangani, public key memverifikasi —
// service yang hanya perlu verifikasi tidak perlu pegang private key.
export class JwtTokenService implements TokenServicePort {
  private privateKeyPromise?: Promise<CryptoKey>;
  private publicKeyPromise?: Promise<CryptoKey>;

  constructor(private readonly opts: JwtTokenServiceOptions) {}

  private async privateKey(): Promise<CryptoKey> {
    this.privateKeyPromise ??= importPKCS8(this.opts.privateKeyPem, 'RS256');
    return this.privateKeyPromise;
  }

  private async publicKey(): Promise<CryptoKey> {
    this.publicKeyPromise ??= importSPKI(this.opts.publicKeyPem, 'RS256');
    return this.publicKeyPromise;
  }

  async generateAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({ role: payload.role })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(payload.user_id)
      .setIssuedAt()
      .setExpirationTime(`${this.opts.accessTokenTtlSeconds}s`)
      .sign(await this.privateKey());
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, await this.publicKey());
      const user_id = payload.sub;
      if (!user_id || typeof payload.role !== 'string') {
        throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak valid');
      }
      return { user_id, role: payload.role };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      if (err instanceof errors.JWTExpired) {
        throw new UnauthorizedError('TOKEN_EXPIRED', 'Access token kadaluarsa');
      }
      throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak valid');
    }
  }
}
