import { alias } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, lt } from 'drizzle-orm';
import { users, wordImportSessions } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewWordImportSession,
  WordImportSession,
  WordImportSessionItem,
  WordImportSessionStatus,
} from '../domain/entities/word-import-session.entity';
import type { WordImportSessionRepository } from '../domain/repositories/word-import-session.repository';

type Row = typeof wordImportSessions.$inferSelect;

const triggeredUsers = alias(users, 'import_triggered_by');
const attributedUsers = alias(users, 'import_attributed_to');

function parseItems(raw: string): WordImportSessionItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        lemma: String(row.lemma ?? ''),
        outcome: (row.outcome as WordImportSessionItem['outcome']) ?? 'invalid',
        meanings_added: Number(row.meanings_added ?? 0),
        message: typeof row.message === 'string' ? row.message : undefined,
      };
    });
  } catch {
    return [];
  }
}

function toEntity(
  row: Row,
  triggeredByUsername: string | null,
  attributedToUsername: string | null,
): WordImportSession {
  return {
    id: row.id,
    triggeredBy: row.triggeredBy,
    triggeredByUsername,
    attributedTo: row.attributedTo,
    attributedToUsername,
    sourceLabel: row.sourceLabel,
    status: row.status as WordImportSessionStatus,
    total: row.total,
    createdCount: row.createdCount,
    duplicatesCount: row.duplicatesCount,
    meaningsAddedCount: row.meaningsAddedCount,
    invalidCount: row.invalidCount,
    items: parseItems(row.itemsJson),
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export class WordImportSessionRepositoryImpl implements WordImportSessionRepository {
  constructor(private readonly db: AppDatabase) {}

  async upsert(session: NewWordImportSession): Promise<WordImportSession> {
    const finishedAt = session.finishedAt ?? new Date();
    const itemsJson = JSON.stringify(session.items);
    await this.db
      .insert(wordImportSessions)
      .values({
        id: session.id,
        triggeredBy: session.triggeredBy,
        attributedTo: session.attributedTo,
        sourceLabel: session.sourceLabel ?? null,
        status: session.status,
        total: session.total,
        createdCount: session.createdCount,
        duplicatesCount: session.duplicatesCount,
        meaningsAddedCount: session.meaningsAddedCount,
        invalidCount: session.invalidCount,
        itemsJson,
        finishedAt,
      })
      .onConflictDoUpdate({
        target: wordImportSessions.id,
        set: {
          status: session.status,
          total: session.total,
          createdCount: session.createdCount,
          duplicatesCount: session.duplicatesCount,
          meaningsAddedCount: session.meaningsAddedCount,
          invalidCount: session.invalidCount,
          itemsJson,
          sourceLabel: session.sourceLabel ?? null,
          finishedAt,
        },
      });
    const found = await this.findById(session.id);
    if (!found) throw new Error('Import session hilang setelah upsert');
    return found;
  }

  async findById(id: string): Promise<WordImportSession | null> {
    const [row] = await this.db
      .select({
        session: wordImportSessions,
        triggeredByUsername: triggeredUsers.username,
        attributedToUsername: attributedUsers.username,
      })
      .from(wordImportSessions)
      .leftJoin(triggeredUsers, eq(wordImportSessions.triggeredBy, triggeredUsers.id))
      .leftJoin(attributedUsers, eq(wordImportSessions.attributedTo, attributedUsers.id))
      .where(eq(wordImportSessions.id, id))
      .limit(1);
    if (!row) return null;
    return toEntity(row.session, row.triggeredByUsername, row.attributedToUsername);
  }

  async list(filter: { limit: number; cursor?: string }): Promise<CursorPage<WordImportSession>> {
    const where = filter.cursor ? and(lt(wordImportSessions.id, filter.cursor)) : undefined;
    const rows = await this.db
      .select({
        session: wordImportSessions,
        triggeredByUsername: triggeredUsers.username,
        attributedToUsername: attributedUsers.username,
      })
      .from(wordImportSessions)
      .leftJoin(triggeredUsers, eq(wordImportSessions.triggeredBy, triggeredUsers.id))
      .leftJoin(attributedUsers, eq(wordImportSessions.attributedTo, attributedUsers.id))
      .where(where)
      .orderBy(desc(wordImportSessions.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = (hasMore ? rows.slice(0, filter.limit) : rows).map((row) =>
      toEntity(row.session, row.triggeredByUsername, row.attributedToUsername),
    );
    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }
}
