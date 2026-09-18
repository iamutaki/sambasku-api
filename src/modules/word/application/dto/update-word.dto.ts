import type { CreateWordDto, RelationType } from './create-word.dto';

// 05-api-edit-kata.md - edit kata existing (PUT /admin/words/:id, full
// replace). Body = CreateWordDto dengan SATU pengecualian: related_words
// HANYA Form A (link kata yang sudah ada). Form B (kreasi kata inline,
// 04 doc) hanya di create - repository tidak punya jalur update untuk
// kata inline; buat dulu lewat POST, lalu link.
export type UpdateWordRelatedDto = { wordId: string; relationType: RelationType };

export type UpdateWordDto = Omit<CreateWordDto, 'relatedWords'> & {
  relatedWords: UpdateWordRelatedDto[];
};
