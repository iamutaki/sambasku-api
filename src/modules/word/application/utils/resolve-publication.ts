import type { ChildStatus } from '../../domain/entities/word.entity';

// Section 22 (approval gate): SATU helper untuk semua endpoint submit —
// create-word + kontribusi media (03-api-kontribusi-verifikasi.md).
// Role verifikator (admin/editor/root/reviewer) self-verified langsung
// tayang; contributor masuk antrean pending_review (tidak tayang).
export function resolvePublication(requested: 'draft' | 'published', role: string) {
  if (requested === 'draft') return { status: 'draft' as const, isVerified: false };
  const isVerifier = ['admin', 'editor', 'root', 'reviewer'].includes(role);
  return isVerifier
    ? { status: 'published' as const, isVerified: true }
    : { status: 'pending_review' as const, isVerified: false };
}

// Konten anak tidak punya 'draft' — langsung gerbang published/pending
export function resolveChildPublication(role: string): { status: ChildStatus; isVerified: boolean } {
  const p = resolvePublication('published', role);
  return { status: p.status as ChildStatus, isVerified: p.isVerified };
}
