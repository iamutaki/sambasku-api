import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import type {
  LemmaDefinitionProviderPort,
  ProviderLemmaRaw,
} from '../application/ports/lemma-definition-provider.port';

const DEFAULT_BASE_URL = 'https://kbbi.raf555.dev';
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Adapter KBBI - GET /api/v1/entry/{entry}
 * Spec: https://kbbi.raf555.dev/swagger/doc.json
 * Base URL di-inject dari factory (hindari import env di sini supaya unit test ringan).
 */
export class Raf555KbbiProvider implements LemmaDefinitionProviderPort {
  readonly providerName = 'raf555';
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async lookup(normalizedLemma: string): Promise<ProviderLemmaRaw | null> {
    if (!this.baseUrl) {
      throw new ServiceUnavailableError(
        'LEMMA_DEFINITION_PROVIDER_UNAVAILABLE',
        'Penyedia definisi kamus belum dikonfigurasi',
      );
    }

    const url = `${this.baseUrl}/api/v1/entry/${encodeURIComponent(normalizedLemma)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'LEMMA_DEFINITION_PROVIDER_ERROR',
        'Gagal mengambil definisi dari penyedia kamus',
      );
    }

    if (res.status === 404) return null;

    if (!res.ok) {
      throw new BadGatewayError(
        'LEMMA_DEFINITION_PROVIDER_ERROR',
        'Gagal mengambil definisi dari penyedia kamus',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'LEMMA_DEFINITION_PROVIDER_ERROR',
        'Gagal mengambil definisi dari penyedia kamus',
      );
    }

    if (!isProviderLemmaRaw(body)) {
      throw new BadGatewayError(
        'LEMMA_DEFINITION_PROVIDER_ERROR',
        'Gagal mengambil definisi dari penyedia kamus',
      );
    }

    return body;
  }
}

function isProviderLemmaRaw(body: unknown): body is ProviderLemmaRaw {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  return typeof o.lemma === 'string' && Array.isArray(o.entries);
}
