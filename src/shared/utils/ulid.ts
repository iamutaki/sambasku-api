import { ulid } from 'ulid';

// Strategi ID — ULID (api-base-stack.md Section 19):
// time-sortable, URL-safe, 26 char, digenerate di aplikasi bukan DB sequence.
export function generateId(): string {
  return ulid();
}
