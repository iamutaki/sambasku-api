import { describe, it, expect } from 'vitest';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { GoogleTokenVerifier } from '../../infrastructure/google-token-verifier';

describe('GoogleTokenVerifier', () => {
  it('GOOGLE_CLIENT_ID kosong → 503, tidak panggil jose', async () => {
    const verifier = new GoogleTokenVerifier(undefined);
    await expect(verifier.verify('eyJhbGciOiJSUzI1NiIs...')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    await expect(verifier.verify('token')).rejects.toMatchObject({
      errorCode: 'GOOGLE_AUTH_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('GOOGLE_CLIENT_ID whitespace → 503', async () => {
    const verifier = new GoogleTokenVerifier('   ');
    await expect(verifier.verify('token')).rejects.toMatchObject({
      errorCode: 'GOOGLE_AUTH_UNAVAILABLE',
    });
  });
});
