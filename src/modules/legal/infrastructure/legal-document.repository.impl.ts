import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { appSettings, legalDocuments } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { BadRequestError, ConflictError, NotFoundError } from '@/shared/errors/app-error';
import {
  LEGAL_PRIVACY_VERSION_KEY,
  LEGAL_TERMS_VERSION_KEY,
} from '../domain/entities/app-setting.entity';
import type {
  LegalDocument,
  LegalDocumentStatus,
  LegalDocumentType,
  NewLegalDocumentDraft,
  UpdateLegalDocumentDraft,
} from '../domain/entities/legal-document.entity';
import type {
  LegalDocumentListFilter,
  LegalDocumentListResult,
  LegalDocumentRepository,
} from '../domain/repositories/legal-document.repository';

type Row = typeof legalDocuments.$inferSelect;

function toEntity(row: Row): LegalDocument {
  return {
    id: row.id,
    documentType: row.documentType as LegalDocumentType,
    version: row.version,
    title: row.title,
    bodyMarkdown: row.bodyMarkdown,
    status: row.status as LegalDocumentStatus,
    publishedAt: row.publishedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class LegalDocumentRepositoryImpl implements LegalDocumentRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string): Promise<LegalDocument | null> {
    const [row] = await this.db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
    return row ? toEntity(row) : null;
  }

  async findByTypeAndVersion(
    documentType: LegalDocumentType,
    version: string,
  ): Promise<LegalDocument | null> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.documentType, documentType),
          eq(legalDocuments.version, version),
        ),
      )
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findPublishedByType(documentType: LegalDocumentType): Promise<LegalDocument | null> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.documentType, documentType),
          eq(legalDocuments.status, 'published'),
        ),
      )
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async list(filter: LegalDocumentListFilter): Promise<LegalDocumentListResult> {
    const limit = filter.limit;
    const conditions = [];
    if (filter.documentType) {
      conditions.push(eq(legalDocuments.documentType, filter.documentType));
    }
    if (filter.status) {
      conditions.push(eq(legalDocuments.status, filter.status));
    }
    if (filter.cursor) {
      conditions.push(
        or(
          lt(legalDocuments.createdAt, new Date(Number(filter.cursor))),
          and(
            eq(legalDocuments.createdAt, new Date(Number(filter.cursor))),
            lt(legalDocuments.id, filter.cursor),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(legalDocuments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(legalDocuments.createdAt), desc(legalDocuments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? String(last.createdAt.getTime()) : null;

    return { items, nextCursor, hasMore };
  }

  async createDraft(input: NewLegalDocumentDraft): Promise<LegalDocument> {
    const existing = await this.findByTypeAndVersion(input.documentType, input.version);
    if (existing) {
      throw new ConflictError(
        'LEGAL_VERSION_EXISTS',
        'Versi dokumen untuk tipe ini sudah ada',
      );
    }
    const [row] = await this.db
      .insert(legalDocuments)
      .values({
        documentType: input.documentType,
        version: input.version.trim(),
        title: input.title.trim(),
        bodyMarkdown: input.bodyMarkdown,
        status: 'draft',
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        updatedAt: new Date(),
      })
      .returning();
    return toEntity(row);
  }

  async updateDraft(id: string, input: UpdateLegalDocumentDraft): Promise<LegalDocument> {
    const current = await this.findById(id);
    if (!current) {
      throw new NotFoundError('LEGAL_DOCUMENT_NOT_FOUND', 'Dokumen legal tidak ditemukan');
    }
    if (current.status !== 'draft') {
      throw new BadRequestError(
        'LEGAL_DOCUMENT_NOT_DRAFT',
        'Hanya draft yang boleh diubah',
      );
    }
    const [row] = await this.db
      .update(legalDocuments)
      .set({
        title: input.title?.trim() ?? current.title,
        bodyMarkdown: input.bodyMarkdown ?? current.bodyMarkdown,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(legalDocuments.id, id))
      .returning();
    return toEntity(row);
  }

  async publish(id: string, actorId: string): Promise<LegalDocument> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.id, id))
        .limit(1);
      if (!current) {
        throw new NotFoundError('LEGAL_DOCUMENT_NOT_FOUND', 'Dokumen legal tidak ditemukan');
      }
      if (current.status === 'archived') {
        throw new BadRequestError(
          'LEGAL_DOCUMENT_ARCHIVED',
          'Dokumen yang sudah diarsipkan tidak dapat dipublikasikan',
        );
      }

      const now = new Date();
      const settingKey =
        current.documentType === 'terms'
          ? LEGAL_TERMS_VERSION_KEY
          : LEGAL_PRIVACY_VERSION_KEY;

      await tx
        .update(legalDocuments)
        .set({
          status: 'archived',
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(
          and(
            eq(legalDocuments.documentType, current.documentType),
            eq(legalDocuments.status, 'published'),
            sql`${legalDocuments.id} != ${id}`,
          ),
        );

      const [published] = await tx
        .update(legalDocuments)
        .set({
          status: 'published',
          publishedAt: now,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(legalDocuments.id, id))
        .returning();

      await tx
        .insert(appSettings)
        .values({
          key: settingKey,
          value: current.version,
          updatedAt: now,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: current.version,
            updatedAt: now,
            updatedBy: actorId,
          },
        });

      return toEntity(published);
    });
  }

  async archive(id: string, actorId: string): Promise<LegalDocument> {
    const current = await this.findById(id);
    if (!current) {
      throw new NotFoundError('LEGAL_DOCUMENT_NOT_FOUND', 'Dokumen legal tidak ditemukan');
    }
    if (current.status === 'archived') {
      return current;
    }
    const [row] = await this.db
      .update(legalDocuments)
      .set({
        status: 'archived',
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(legalDocuments.id, id))
      .returning();
    return toEntity(row);
  }
}
