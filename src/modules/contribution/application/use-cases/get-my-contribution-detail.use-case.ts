import { NotFoundError } from '@/shared/errors/app-error';
import type { WordSuggestionRepository } from '@/modules/word-suggestions/domain/repositories/word-suggestion.repository';
import type { ContributionEntityType, MySubmission, MySubmissionKind } from '../../domain/entities/contribution.entity';
import type { ContributionRepository } from '../../domain/repositories/contribution.repository';

/**
 * Detail satu item Kontribusi Saya. Bukan milik pemohon → 404
 * (jangan 403: jangan bocor keberadaan id orang lain).
 */
export class GetMyContributionDetailUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly suggestionRepo: WordSuggestionRepository,
  ) {}

  async execute(userId: string, kind: MySubmissionKind, id: string): Promise<MySubmission> {
    if (kind === 'suggestion') {
      const row = await this.suggestionRepo.findById(id);
      if (!row || row.userId !== userId) {
        throw new NotFoundError('SUGGESTION_NOT_FOUND', 'Usulan tidak ditemukan');
      }
      const detail = await this.suggestionRepo.getSuggestionDetail(id);
      const lemma = detail?.suggestion.wordLemma ?? null;
      return {
        id: row.id,
        kind: 'suggestion',
        entityType: 'word_suggestion',
        lemma,
        status: row.status,
        createdAt: row.createdAt,
        reviewComment: row.reviewComment,
        wordId: row.wordId,
        action: null,
        reason: row.reason,
        reasonCode: row.reasonCode,
        reviewedAt: row.reviewedAt,
      };
    }

    const contribution = await this.contributionRepo.findById(id);
    if (!contribution || contribution.userId !== userId) {
      throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi tidak ditemukan');
    }
    const review = await this.contributionRepo.findReview(id);
    let wordId: string | null =
      contribution.entityType === 'word' ? contribution.entityId : null;
    if (!wordId && contribution.entityType !== 'word') {
      const child = await this.contributionRepo.findChildWithParent(
        contribution.entityType as Exclude<ContributionEntityType, 'word'>,
        contribution.entityId,
      );
      wordId = child?.wordId ?? null;
    }
    return {
      id: contribution.id,
      kind: 'contribution',
      entityType: contribution.entityType,
      lemma: contribution.wordLemma,
      status: contribution.status,
      createdAt: contribution.createdAt,
      reviewComment: review?.comment ?? null,
      wordId,
      action: contribution.action,
      reason: null,
      reasonCode: null,
      reviewedAt: review?.createdAt ?? null,
    };
  }
}
