import { ServiceUnavailableError, ValidationError } from '@/shared/errors/app-error';
import { env } from '@/shared/config/env';
import type { LemmaDefinitionProviderPort } from '../application/ports/lemma-definition-provider.port';
import type { LemmaDefinitionProviderRegistry } from '../application/ports/lemma-definition-provider-registry.port';
import { KBBI_PROVIDER_IDS, type KbbiProviderId } from '../application/kbbi-provider-ids';
import { Raf555KbbiProvider } from './raf555-kbbi.provider';

const DEFAULT_RAF555_BASE_URL = 'https://kbbi.raf555.dev';

export type { KbbiProviderId };
export { KBBI_PROVIDER_IDS };

/**
 * Registry multi-provider (Section 8).
 * - Env `KBBI_PROVIDER` = default kalau query `provider` absen
 * - Query `?provider=raf555` override per-request (hanya whitelist + yang ter-register)
 * - Provider baru = register di sini + env `NAMA_*`
 */
export function createLemmaDefinitionProviderRegistry(): LemmaDefinitionProviderRegistry {
  const providers = new Map<string, LemmaDefinitionProviderPort>();

  // raf555: register kecuali RAF555_BASE_URL="" (eksplisit mati)
  if (!(env.RAF555_BASE_URL !== undefined && env.RAF555_BASE_URL.trim() === '')) {
    providers.set(
      'raf555',
      new Raf555KbbiProvider(env.RAF555_BASE_URL?.trim() || DEFAULT_RAF555_BASE_URL),
    );
  }

  const configured = (env.KBBI_PROVIDER ?? 'raf555').trim().toLowerCase();
  const isOff = configured === '' || configured === 'none' || configured === 'off';

  if (!isOff && !KBBI_PROVIDER_IDS.includes(configured as KbbiProviderId)) {
    throw new Error(
      `KBBI_PROVIDER "${env.KBBI_PROVIDER}" tidak dikenal - tersedia: ${KBBI_PROVIDER_IDS.join(', ')}, none`,
    );
  }

  if (!isOff && !providers.has(configured)) {
    throw new Error(
      `KBBI_PROVIDER="${configured}" dipilih tapi belum dikonfigurasi (cek env URL provider)`,
    );
  }

  const defaultId: string | null = isOff ? null : configured;

  return {
    defaultId,
    availableIds: [...providers.keys()],
    resolve(requestedId) {
      const raw = requestedId?.trim().toLowerCase();
      const id = raw || defaultId;

      if (!id) {
        throw new ServiceUnavailableError(
          'LEMMA_DEFINITION_PROVIDER_UNAVAILABLE',
          'Penyedia definisi kamus belum dikonfigurasi',
        );
      }

      if (raw && !KBBI_PROVIDER_IDS.includes(raw as KbbiProviderId)) {
        throw new ValidationError([
          {
            field: 'provider',
            message: `Provider tidak dikenal. Tersedia: ${KBBI_PROVIDER_IDS.join(', ')}`,
          },
        ]);
      }

      const provider = providers.get(id);
      if (!provider) {
        throw new ServiceUnavailableError(
          'LEMMA_DEFINITION_PROVIDER_UNAVAILABLE',
          `Provider "${id}" tidak tersedia / belum dikonfigurasi`,
        );
      }

      return provider;
    },
  };
}
