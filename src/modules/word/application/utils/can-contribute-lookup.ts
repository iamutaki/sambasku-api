import { eq } from 'drizzle-orm';
import { db } from '@/shared/database/drizzle/client';
import { users } from '@/shared/database/drizzle/schema';

export async function lookupCanContribute(userId: string): Promise<boolean | null> {
  const [row] = await db
    .select({ canContribute: users.canContribute })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return row.canContribute;
}
