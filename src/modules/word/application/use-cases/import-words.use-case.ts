import { BadRequestError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { LanguageRepository } from '@/modules/language/domain/repositories/language.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { Actor } from './create-word.use-case';
import {
  decideImportPublication,
  meaningFingerprint,
  normalizeLemma,
  preparedMeaning,
  type ImportWordInput,
  type ImportWordResult,
} from '../import-words';

export interface ImportWordsResult {
  items: ImportWordResult[];
}

export class ImportWordsUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly languageRepo: LanguageRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(
    input: { mode: 'validate' | 'commit'; items: ImportWordInput[] },
    actor: Actor,
  ): Promise<ImportWordsResult> {
    if (input.items.length > 25) {
      throw new BadRequestError('IMPORT_TOO_LARGE', 'Maksimal 25 kata per permintaan');
    }
    const refs = await this.resolveRefs();
    const items: ImportWordResult[] = [];
    for (const item of input.items) {
      items.push(await this.one(item, actor, refs, input.mode));
    }
    if (input.mode === 'commit') {
      const created = items.filter((i) => i.outcome === 'created').length;
      const added = items.reduce((n, i) => n + i.meanings_added, 0);
      const skipped = items.filter((i) => i.outcome === 'skipped').length;
      const invalid = items.filter((i) => i.outcome === 'invalid').length;
      await this.auditRepo.record({
        userId: actor.userId,
        action: 'create',
        entityType: 'word_import',
        entityId: actor.requestId ?? 'word-import',
        newData: { created, meanings_added: added, skipped, invalid },
        requestId: actor.requestId ?? null,
      });
    }
    return { items };
  }

  private async resolveRefs() {
    const languages = await this.languageRepo.listLanguages(false);
    const sambas = languages.find((l) => l.code.toUpperCase() === 'SBS');
    const indonesia = languages.find((l) => l.code.toUpperCase() === 'IDN');
    if (!sambas || !indonesia) {
      throw new BadRequestError('IMPORT_REFS', 'Bahasa Sambas atau Indonesia belum tersedia');
    }
    const dialects = await this.languageRepo.listDialects(sambas.id, false);
    const dialect =
      dialects.find((d) => d.isDefault) ??
      dialects.find((d) => d.code.trim().toLowerCase() === 'umum');
    const classes = await this.wordRepo.listWordClasses();
    const umum = classes.find((c) => c.code.trim().toLowerCase() === 'umum');
    if (!umum) {
      throw new BadRequestError('IMPORT_REFS', 'Kelas kata umum belum tersedia');
    }
    return {
      languageId: sambas.id,
      translationLanguageId: indonesia.id,
      dialectId: dialect?.id,
      wordClassId: umum.id,
    };
  }

  private async one(
    item: ImportWordInput,
    actor: Actor,
    refs: { languageId: string; translationLanguageId: string; dialectId?: string; wordClassId: string },
    mode: 'validate' | 'commit',
  ): Promise<ImportWordResult> {
    const lemma = item.lemma.trim();
    const meanings = item.meanings
      .map(preparedMeaning)
      .filter((m): m is NonNullable<typeof m> => m !== null);
    const unique: typeof meanings = [];
    const seen = new Set<string>();
    for (const meaning of meanings) {
      const key = meaningFingerprint(meaning);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(meaning);
    }
    if (!lemma || unique.length === 0) {
      return {
        lemma,
        outcome: 'invalid',
        meanings_added: 0,
        meanings_skipped: 0,
        message: 'Lemma kosong atau tidak ada makna yang terisi',
      };
    }

    const parent = await this.wordRepo.findActiveByLemma(refs.languageId, lemma);
    const publication = decideImportPublication({
      verify: item.verify,
      role: actor.role,
      parentStatus: parent?.status ?? null,
    });
    const forcedNote = publication.forcedDraft
      ? 'Kata induk belum tayang, makna baru disimpan sebagai draf'
      : undefined;

    if (!parent) {
      if (mode === 'validate') {
        return {
          lemma,
          outcome: 'created',
          status: publication.status,
          is_verified: publication.isVerified,
          meanings_added: unique.length,
          meanings_skipped: item.meanings.length - unique.length,
        };
      }
      const word = await this.wordRepo.saveWithRelations(
        {
          languageId: refs.languageId,
          dialectId: refs.dialectId,
          lemma,
          notes: item.notes?.trim() || undefined,
          wordType: 'word',
          meanings: unique.map((m, index) => ({
            wordClassId: refs.wordClassId,
            definition: m.definition,
            isHaveDefinition: m.isHaveDefinition,
            isHaveTranslation: m.isHaveTranslation,
            orderIndex: index + 1,
            translations: m.isHaveTranslation
              ? [{ languageId: refs.translationLanguageId, translationText: m.translation, translationType: 'direct' }]
              : [],
            examples: m.example
              ? [{ sourceLanguageId: refs.languageId, sourceSentence: m.example, sourceType: 'other' }]
              : [],
          })),
          categoryIds: [],
          relatedWords: [],
          status: publication.status,
          isVerified: publication.isVerified,
        },
        actor.userId,
      );
      return {
        lemma: word.lemma,
        outcome: 'created',
        status: publication.status,
        is_verified: word.isVerified,
        meanings_added: unique.length,
        meanings_skipped: item.meanings.length - unique.length,
      };
    }

    const existing = new Set(
      (await this.wordRepo.listMeaningKeys(parent.id)).map((m) =>
        meaningFingerprint({
          definition: m.isHaveDefinition ? m.definition : '',
          translation: m.translation,
          isHaveDefinition: m.isHaveDefinition,
          isHaveTranslation: m.isHaveTranslation,
        }),
      ),
    );
    const fresh = unique.filter((m) => !existing.has(meaningFingerprint(m)));
    const skipped = unique.length - fresh.length + (item.meanings.length - unique.length);
    if (fresh.length === 0) {
      return {
        lemma,
        outcome: 'skipped',
        meanings_added: 0,
        meanings_skipped: skipped,
        message: 'Makna ini sudah ada pada kata tersebut',
      };
    }
    if (mode === 'validate') {
      return {
        lemma,
        outcome: 'meanings_added',
        status: publication.status,
        is_verified: publication.isVerified,
        meanings_added: fresh.length,
        meanings_skipped: skipped,
        message: forcedNote ?? 'Makna ditambahkan, catatan tidak menempel pada kata induk',
      };
    }
    for (const meaning of fresh) {
      const saved = await this.wordRepo.addMeaning(
        parent.id,
        {
          wordClassId: refs.wordClassId,
          definition: meaning.definition,
          isHaveDefinition: meaning.isHaveDefinition,
          isHaveTranslation: meaning.isHaveTranslation,
          translations: meaning.isHaveTranslation
            ? [{ languageId: refs.translationLanguageId, translationText: meaning.translation, translationType: 'direct' }]
            : [],
          status: publication.status,
          isVerified: publication.isVerified,
        },
        actor.userId,
      );
      if (meaning.example) {
        await this.wordRepo.addExample(
          saved.id,
          {
            sourceLanguageId: refs.languageId,
            sourceSentence: meaning.example,
            sourceType: 'other',
            status: publication.status === 'draft' ? 'pending_review' : 'published',
            isVerified: publication.isVerified,
          },
          actor.userId,
        );
      }
    }
    return {
      lemma,
      outcome: 'meanings_added',
      status: publication.status,
      is_verified: publication.isVerified,
      meanings_added: fresh.length,
      meanings_skipped: skipped,
      message: forcedNote ?? 'Makna ditambahkan tanpa mengubah kata induk',
    };
  }
}

export { normalizeLemma };
