import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { LanguageRepository } from '@/modules/language/domain/repositories/language.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss } from '../../domain/entities/search-miss.entity';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';

export type ResolveSearchMissAction = 'variant' | 'synonym' | 'translation';

export interface ResolveSearchMissCommand {
  missId: string;
  actorId: string;
  action: ResolveSearchMissAction;
  wordId: string;
  /** opsional: makna spesifik untuk action=translation */
  meaningId?: string;
  requestId?: string | null;
}

export interface ResolveSearchMissResult {
  miss: SearchMiss;
  action: ResolveSearchMissAction;
  targetWordId: string;
  createdWordId: string | null;
  variantId: string | null;
}

/**
 * Selesaikan search-miss tanpa buat entri baru dari nol:
 * - variant (arah lemma): tempel term sebagai word_variants
 * - synonym (arah lemma): buat kata published + wariskan makna + relasi synonym
 * - translation (arah translation): tambah terjemahan Indonesia ke makna kata
 */
export class ResolveSearchMissUseCase {
  constructor(
    private readonly searchMissRepo: SearchMissRepository,
    private readonly wordRepo: WordRepository,
    private readonly languageRepo: LanguageRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ResolveSearchMissCommand): Promise<ResolveSearchMissResult> {
    const miss = await this.searchMissRepo.findById(cmd.missId);
    if (!miss) {
      throw new NotFoundError(
        'SEARCH_MISS_NOT_FOUND',
        'Pencarian kosong dengan id tersebut tidak ditemukan',
      );
    }

    const word = await this.wordRepo.findById(cmd.wordId);
    if (!word || word.deletedAt) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    if (word.status !== 'published') {
      throw new ValidationError([
        { field: 'word_id', message: 'Kata target harus berstatus published' },
      ]);
    }

    let createdWordId: string | null = null;
    let variantId: string | null = null;

    if (cmd.action === 'variant') {
      if (miss.direction !== 'lemma') {
        throw new ValidationError([
          {
            field: 'action',
            message: 'action=variant hanya untuk miss arah lemma (pakai translation atau Buat kata)',
          },
        ]);
      }
      const variant = await this.wordRepo.addVariant(
        cmd.wordId,
        {
          form: miss.term,
          variantType: 'alternative',
          notes: `Dari search miss ${miss.id}`,
        },
        cmd.actorId,
      );
      variantId = variant.id;
    } else if (cmd.action === 'synonym') {
      if (miss.direction !== 'lemma') {
        throw new ValidationError([
          {
            field: 'action',
            message: 'action=synonym hanya untuk miss arah lemma (pakai translation atau Buat kata)',
          },
        ]);
      }
      if (miss.term.trim().toLowerCase() === word.lemma.trim().toLowerCase()) {
        throw new ValidationError([
          { field: 'word_id', message: 'Lemma miss sama dengan kata target - pakai variant atau dismiss' },
        ]);
      }
      const created = await this.wordRepo.createSynonymWord(cmd.wordId, miss.term, cmd.actorId, {
        searchMissId: miss.id,
      });
      createdWordId = created.id;
    } else {
      if (miss.direction !== 'translation') {
        throw new ValidationError([
          {
            field: 'action',
            message: 'action=translation hanya untuk miss arah translation (pakai variant/synonym)',
          },
        ]);
      }
      const languages = await this.languageRepo.listLanguages(true);
      const idLang = languages.find((l) => l.code === 'id');
      if (!idLang) {
        throw new ValidationError([
          { field: 'action', message: 'Bahasa Indonesia (code=id) belum terdaftar di sistem' },
        ]);
      }
      await this.wordRepo.addTranslation(
        cmd.wordId,
        {
          languageId: idLang.id,
          translationText: miss.term,
          meaningId: cmd.meaningId,
        },
        cmd.actorId,
      );
    }

    const after = await this.searchMissRepo.findById(cmd.missId);
    if (!after) {
      throw new NotFoundError(
        'SEARCH_MISS_NOT_FOUND',
        'Pencarian kosong dengan id tersebut tidak ditemukan',
      );
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'search_miss',
      entityId: cmd.missId,
      newData: {
        resolved_as: cmd.action,
        target_word_id: cmd.wordId,
        created_word_id: createdWordId,
        variant_id: variantId,
        term: miss.term,
      },
      requestId: cmd.requestId ?? null,
    });

    return {
      miss: after,
      action: cmd.action,
      targetWordId: cmd.wordId,
      createdWordId,
      variantId,
    };
  }
}
