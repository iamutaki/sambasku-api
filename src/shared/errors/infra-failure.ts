/**
 * Deteksi kegagalan KAPASITAS runtime - bukan bug aplikasi.
 *
 * Kenapa perlu: tiap query Drizzle ke Turso adalah satu subrequest HTTP. Saat
 * Worker melewati batas subrequest per request, `fetch()` melempar
 * "Too many subrequests." Tanpa deteksi ini error tersebut jatuh ke cabang
 * generik `error-handler.middleware.ts` dan keluar sebagai JSON 500
 * INTERNAL_ERROR - tidak bisa dibedakan dari bug biasa, sehingga circuit
 * breaker di mobile/web/console TIDAK akan pindah tier justru pada kegagalan
 * yang paling perlu dipindahkan.
 *
 * Dipetakan ke 503 UPSTREAM_CAPACITY supaya klien tahu ini layak di-failover.
 * Tier 2 dan 3 adalah proses Node tanpa batas subrequest, jadi kode ini
 * memang khas tier 1 (Cloudflare Workers).
 */

import { collectMessages } from '@/shared/errors/error-chain';

const CAPACITY_SIGNATURES = [
  'too many subrequests',
  'exceeded the limit for the number of subrequests',
  'network connection lost',
  'script will never generate a response',
  'exceeded cpu time limit',
  'worker exceeded resource limits',
] as const;

export function isCapacityFailure(err: unknown): boolean {
  const haystack = collectMessages(err).join(' ').toLowerCase();
  if (haystack === '') return false;
  return CAPACITY_SIGNATURES.some((sig) => haystack.includes(sig));
}
