import type { DuplicateWordGroup, WordRepository } from '../../domain/repositories/word.repository';

/** Preferensi default entri yang dipertahankan dalam kelompok duplikat. */
export function pickDefaultKeepWordId(items: DuplicateWordGroup['items']): string {
  const scored = [...items].sort((a, b) => {
    const score = (w: (typeof items)[number]) => {
      let s = 0;
      if (w.status === 'published') s += 4;
      if (w.isVerified) s += 2;
      return s;
    };
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return scored[0]?.id ?? items[0].id;
}

export class ListDuplicateWordsUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(): Promise<{ groups: DuplicateWordGroup[]; totalGroups: number }> {
    const groups = await this.wordRepo.listDuplicateGroups();
    return { groups, totalGroups: groups.length };
  }
}
