/**
 * Port lookup definisi lemma - provider-agnostic (api-base-stack Section 8).
 * Impl hari ini: KBBI via kbbi.raf555.dev (lihat swagger doc.json).
 * Ganti sumber = file infrastructure baru; use case & response kontrak tetap.
 */

export interface ProviderDefinitionLabel {
  code: string;
  name: string;
  kind: string;
}

export interface ProviderDefinitionRaw {
  definition: string;
  referencedLemma?: string;
  labels?: ProviderDefinitionLabel[];
  usageExamples?: string[];
}

export interface ProviderEntryRaw {
  entry: string;
  definitions?: ProviderDefinitionRaw[];
  isPrecategorical?: boolean;
  pronunciation?: string;
}

export interface ProviderLemmaRaw {
  lemma: string;
  entries: ProviderEntryRaw[];
}

export interface LemmaDefinitionProviderPort {
  /** identitas di response `data.provider` - mis. `kbbi` */
  readonly providerName: string;
  /**
   * null = lemma tidak ada di provider (HTTP 404 hulu).
   * Throw BadGatewayError / ServiceUnavailableError untuk gagal hulu / belum dikonfigurasi.
   */
  lookup(normalizedLemma: string): Promise<ProviderLemmaRaw | null>;
}
