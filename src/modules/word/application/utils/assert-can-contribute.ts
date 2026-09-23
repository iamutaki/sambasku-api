import { ForbiddenError } from '@/shared/errors/app-error';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';

/** null = user tidak ketemu (izinkan, supaya tes unit tidak butuh database). */
type CanContributeLookup = (userId: string) => Promise<boolean | null>;

let lookup: CanContributeLookup = async () => null;

/** Dipanggil sekali dari app.ts. Tanpa ini, pengecekan hak menulis tidak aktif. */
export function bindCanContributeLookup(fn: CanContributeLookup): void {
  lookup = fn;
}

export async function assertCanContribute(userId: string): Promise<void> {
  if (userId === ANONIM_USER_ID) return;
  const allowed = await lookup(userId);
  if (allowed === false) {
    throw new ForbiddenError(
      'CONTRIBUTION_NOT_ALLOWED',
      'Akun ini tidak bisa mengirim usulan saat ini.',
    );
  }
}
