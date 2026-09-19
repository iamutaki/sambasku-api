import { z } from 'zod';

/**
 * Query string boolean yang benar: "false" → false.
 * Jangan pakai z.coerce.boolean() untuk query - Boolean("false") === true.
 */
export const queryBooleanSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const v = val.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return val;
}, z.boolean().optional());
