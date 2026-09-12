// Barrel schema — Drizzle butuh semua tabel terdaftar di satu tempat.
// Tabel modul lain ditambahkan seiring modulnya dibuat.
export * from './users.schema';
export * from './refresh-tokens.schema';
export * from './password-reset-tokens.schema';
export * from './languages.schema';
export * from './dialects.schema';
export * from './word-classes.schema';
export * from './words.schema';
export * from './meanings.schema';
export * from './meaning-translations.schema';
export * from './examples.schema';
export * from './categories.schema';
export * from './word-categories.schema';
export * from './word-images.schema';
export * from './word-variants.schema';
export * from './lexical-relations.schema';
export * from './pronunciations.schema';
export * from './contributions.schema';
export * from './contribution-reviews.schema';
export * from './audit-logs.schema';
