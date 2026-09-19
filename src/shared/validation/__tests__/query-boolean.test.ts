import { describe, it, expect } from 'vitest';
import { queryBooleanSchema } from '@/shared/validation/query-boolean';

describe('queryBooleanSchema', () => {
  it('"false" → false (bukan true seperti z.coerce.boolean)', () => {
    expect(queryBooleanSchema.parse('false')).toBe(false);
    expect(queryBooleanSchema.parse('true')).toBe(true);
    expect(queryBooleanSchema.parse('0')).toBe(false);
    expect(queryBooleanSchema.parse('1')).toBe(true);
    expect(queryBooleanSchema.parse(false)).toBe(false);
    expect(queryBooleanSchema.parse(true)).toBe(true);
    expect(queryBooleanSchema.parse(undefined)).toBeUndefined();
    expect(queryBooleanSchema.parse('')).toBeUndefined();
  });
});
