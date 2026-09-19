import type {
  ProviderDefinitionRaw,
  ProviderEntryRaw,
  ProviderLemmaRaw,
} from './ports/lemma-definition-provider.port';
import type {
  LemmaDefinitionEntryDto,
  LemmaDefinitionLookupResultDto,
  LemmaDefinitionSenseDto,
  LemmaDefinitionSuggestionDto,
} from './dto/lemma-definition-lookup.dto';

const KELAS_KATA = 'Kelas Kata';

/** Ambil nomor homonim dari string entry provider: `a.pel (2)` → 2. */
export function parseHomonymIndex(entryLabel: string, fallbackIndex: number): number {
  const m = entryLabel.match(/\((\d+)\)\s*$/);
  if (m) return Number(m[1]);
  return fallbackIndex;
}

function pickWordClass(labels: NonNullable<ProviderDefinitionRaw['labels']>) {
  const kelas = labels.find((l) => l.kind === KELAS_KATA);
  return {
    code: kelas?.code?.trim() || null,
    label: kelas?.name?.trim() || null,
  };
}

function buildNotes(labels: NonNullable<ProviderDefinitionRaw['labels']>): string | null {
  const others = labels
    .filter((l) => l.kind !== KELAS_KATA)
    .map((l) => l.name.trim())
    .filter(Boolean);
  return others.length > 0 ? others.join(', ') : null;
}

/** Ganti placeholder `--` di contoh KBBI dengan lemma agar UI lebih terbaca. */
export function expandExamplePlaceholders(example: string, lemma: string): string {
  return example.replace(/--/g, lemma);
}

function resolveDefinitionText(def: ProviderDefinitionRaw): string | null {
  const text = (def.definition ?? '').trim();
  if (text) return text;
  const ref = (def.referencedLemma ?? '').trim();
  if (ref) return `lihat ${ref}`;
  return null;
}

function mapSense(
  def: ProviderDefinitionRaw,
  senseIndex: number,
  lemma: string,
): LemmaDefinitionSenseDto | null {
  const definition = resolveDefinitionText(def);
  if (!definition) return null;

  const labels = def.labels ?? [];
  const { code, label } = pickWordClass(labels);
  const examples = (def.usageExamples ?? [])
    .map((e) => expandExamplePlaceholders(e.trim(), lemma))
    .filter(Boolean);

  return {
    sense_index: senseIndex,
    word_class_code: code,
    word_class_label: label,
    definition,
    examples,
    notes: buildNotes(labels),
  };
}

function mapEntry(
  raw: ProviderEntryRaw,
  arrayIndex: number,
  lemma: string,
): LemmaDefinitionEntryDto | null {
  const senses: LemmaDefinitionSenseDto[] = [];
  let senseIndex = 1;
  for (const def of raw.definitions ?? []) {
    const sense = mapSense(def, senseIndex, lemma);
    if (sense) {
      senses.push(sense);
      senseIndex += 1;
    }
  }
  if (senses.length === 0) return null;

  return {
    lemma,
    homonym_index: parseHomonymIndex(raw.entry ?? '', arrayIndex + 1),
    senses,
  };
}

function flattenSuggestions(entries: LemmaDefinitionEntryDto[]): LemmaDefinitionSuggestionDto[] {
  const out: LemmaDefinitionSuggestionDto[] = [];
  for (const entry of entries) {
    for (const sense of entry.senses) {
      out.push({
        id: `${entry.homonym_index}:${sense.sense_index}`,
        lemma: entry.lemma,
        homonym_index: entry.homonym_index,
        sense_index: sense.sense_index,
        word_class_code: sense.word_class_code,
        word_class_label: sense.word_class_label,
        definition: sense.definition,
        preview: sense.definition,
      });
    }
  }
  return out;
}

/** Raw provider → bentuk kontrak kita (entries + suggestions derived). */
export function mapProviderLemmaToLookupResult(opts: {
  query: string;
  normalizedQuery: string;
  providerName: string;
  fetchedAt: Date;
  cacheHit: boolean;
  raw: ProviderLemmaRaw | null;
}): LemmaDefinitionLookupResultDto {
  if (!opts.raw) {
    return {
      query: opts.query,
      normalized_query: opts.normalizedQuery,
      found: false,
      provider: opts.providerName,
      fetched_at: opts.fetchedAt.toISOString(),
      cache_hit: opts.cacheHit,
      entries: [],
      suggestions: [],
    };
  }

  const lemma = (opts.raw.lemma || opts.normalizedQuery).trim();
  const entries: LemmaDefinitionEntryDto[] = [];
  for (let i = 0; i < (opts.raw.entries ?? []).length; i++) {
    const mapped = mapEntry(opts.raw.entries[i]!, i, lemma);
    if (mapped) entries.push(mapped);
  }

  const suggestions = flattenSuggestions(entries);
  return {
    query: opts.query,
    normalized_query: opts.normalizedQuery,
    found: suggestions.length > 0,
    provider: opts.providerName,
    fetched_at: opts.fetchedAt.toISOString(),
    cache_hit: opts.cacheHit,
    entries,
    suggestions,
  };
}

/** Normalisasi query untuk cache key + panggil provider. */
export function normalizeLemmaQuery(lemma: string): string {
  return lemma.trim().replace(/\s+/g, ' ').toLowerCase();
}
