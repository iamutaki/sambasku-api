import { ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Word, WordStatus } from '../../domain/entities/word.entity';
import type { WordRepository, MissingReferences } from '../../domain/repositories/word.repository';
import type { CreateWordDto } from '../dto/create-word.dto';

export interface CreateWordResult {
  word: Word;
  warnings: { field: string; message: string }[];
}

export interface Actor {
  userId: string;
  role: string;
  /** dari requestIdMiddleware — menyambung audit DB ↔ log aplikasi (Section 14 & 21) */
  requestId?: string | null;
}

export class CreateWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(dto: CreateWordDto, actor: Actor): Promise<CreateWordResult> {
    // 0. Aturan silang: has_component hanya untuk entri frasa (idiom/peribahasa/ungkapan)
    if (
      dto.wordType === 'word' &&
      dto.relatedWords.some((r) => r.relationType === 'has_component')
    ) {
      throw new ValidationError([
        {
          field: 'related_words',
          message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan',
        },
      ]);
    }

    // 1. Validasi referensi eksternal (id harus ada di DB) → VALIDATION_ERROR per field
    const missing = await this.wordRepo.findMissingReferences({
      languageId: dto.languageId,
      dialectId: dto.dialectId,
      wordClassIds: dto.meanings.map((m) => m.wordClassId),
      languageIds: collectLanguageIds(dto),
      categoryIds: dto.categoryIds,
      relatedWordIds: dto.relatedWords.map((r) => r.wordId),
      variantDialectIds: (dto.variants ?? [])
        .map((v) => v.dialectId)
        .filter((id): id is string => !!id),
    });
    const details = mapMissingToDetails(dto, missing);
    if (details.length > 0) throw new ValidationError(details);

    // 2. Cek duplikat — warning, bukan error
    const isDuplicate = await this.wordRepo.findDuplicate(dto.languageId, dto.lemma);
    const warnings = isDuplicate
      ? [{ field: 'lemma', message: 'Lemma serupa sudah ada di bahasa ini' }]
      : [];

    // 3. Status akhir tergantung role — sumber kebenaran status adalah backend
    const status: WordStatus = resolveStatus(dto.status, actor.role);

    // 4. Simpan atomik (transaction hidup di implementasi repository)
    const word = await this.wordRepo.saveWithRelations({ ...dto, status }, actor.userId);

    // 5. Audit trail (Section 21) — snapshot ringkas, tanpa isi lengkap anak-anak
    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'word',
      entityId: word.id,
      newData: {
        lemma: word.lemma,
        word_type: word.wordType,
        language_id: word.languageId,
        status: word.status,
        meanings_count: dto.meanings.length,
      },
      requestId: actor.requestId ?? null,
    });

    return { word, warnings };
  }
}

function resolveStatus(requested: 'draft' | 'published', role: string): WordStatus {
  if (requested === 'draft') return 'draft';
  return role === 'admin' || role === 'editor' ? 'published' : 'pending_review';
}

function collectLanguageIds(dto: CreateWordDto): string[] {
  const ids: string[] = [];
  for (const meaning of dto.meanings) {
    for (const t of meaning.translations) ids.push(t.languageId);
    for (const ex of meaning.examples ?? []) {
      ids.push(ex.sourceLanguageId);
      if (ex.targetLanguageId) ids.push(ex.targetLanguageId);
    }
  }
  return [...new Set(ids)];
}

function mapMissingToDetails(
  dto: CreateWordDto,
  missing: MissingReferences,
): { field: string; message: string }[] {
  const details: { field: string; message: string }[] = [];

  if (missing.languageId) {
    details.push({ field: 'language_id', message: 'Bahasa tidak ditemukan' });
  }
  if (missing.dialectId) {
    details.push({ field: 'dialect_id', message: 'Dialek tidak ditemukan' });
  }
  for (const id of missing.wordClasses) {
    const idx = dto.meanings.findIndex((m) => m.wordClassId === id);
    const field = idx >= 0 ? `meanings.${idx}.word_class_id` : 'word_class_id';
    details.push({ field, message: `Kelas kata tidak ditemukan (${id})` });
  }
  for (const id of missing.languages) {
    details.push({ field: 'language_id', message: `Bahasa tidak ditemukan (${id})` });
  }
  for (const id of missing.categories) {
    details.push({ field: 'category_ids', message: `Kategori tidak ditemukan (${id})` });
  }
  for (const id of missing.words) {
    const idx = dto.relatedWords.findIndex((r) => r.wordId === id);
    const field = idx >= 0 ? `related_words.${idx}.word_id` : 'related_words';
    details.push({ field, message: `Kata tidak ditemukan (${id})` });
  }
  if (missing.dialects.length > 0) {
    details.push({ field: 'variants', message: `Dialek tidak ditemukan (${missing.dialects.join(', ')})` });
  }
  return details;
}
