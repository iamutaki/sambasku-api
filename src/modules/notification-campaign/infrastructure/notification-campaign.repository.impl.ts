import { and, count, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  deviceTokens,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationTemplates,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  CampaignAudienceType,
  CampaignRecipient,
  CampaignRecipientStatus,
  CampaignStatus,
  DeepLinkKind,
  NotificationCampaign,
  NotificationTemplate,
} from '../domain/entities/campaign.entity';
import type {
  CampaignListOptions,
  CampaignListResult,
  CampaignStatsDelta,
  CreateCampaignInput,
  CreateTemplateInput,
  NotificationCampaignRepository,
  TemplateListOptions,
  TemplateListResult,
  UpdateTemplateInput,
} from '../domain/repositories/notification-campaign.repository';

function toTemplate(row: typeof notificationTemplates.$inferSelect): NotificationTemplate {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    deepLinkKind: row.deepLinkKind as DeepLinkKind,
    deepLinkValue: row.deepLinkValue,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toCampaign(row: typeof notificationCampaigns.$inferSelect): NotificationCampaign {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    body: row.body,
    deepLinkKind: row.deepLinkKind as DeepLinkKind,
    deepLinkValue: row.deepLinkValue,
    audienceType: row.audienceType as CampaignAudienceType,
    status: row.status as CampaignStatus,
    sendAt: row.sendAt,
    targetedUsers: row.targetedUsers,
    pushSuccess: row.pushSuccess,
    pushFailed: row.pushFailed,
    inboxWritten: row.inboxWritten,
    inboxCursor: row.inboxCursor,
    topicSent: Boolean(row.topicSent),
    lastError: row.lastError,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRecipient(row: typeof notificationCampaignRecipients.$inferSelect): CampaignRecipient {
  return {
    id: row.id,
    campaignId: row.campaignId,
    userId: row.userId,
    status: row.status as CampaignRecipientStatus,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class NotificationCampaignRepositoryImpl implements NotificationCampaignRepository {
  constructor(private readonly db: AppDatabase) {}

  async createTemplate(input: CreateTemplateInput): Promise<NotificationTemplate> {
    const [row] = await this.db
      .insert(notificationTemplates)
      .values({
        name: input.name,
        title: input.title,
        body: input.body,
        deepLinkKind: input.deepLinkKind,
        deepLinkValue: input.deepLinkValue,
        createdBy: input.createdBy,
      })
      .returning();
    return toTemplate(row);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<NotificationTemplate | null> {
    const [row] = await this.db
      .update(notificationTemplates)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.deepLinkKind !== undefined ? { deepLinkKind: input.deepLinkKind } : {}),
        ...(input.deepLinkValue !== undefined ? { deepLinkValue: input.deepLinkValue } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(notificationTemplates.id, id), isNull(notificationTemplates.deletedAt)))
      .returning();
    return row ? toTemplate(row) : null;
  }

  async softDeleteTemplate(id: string): Promise<boolean> {
    const updated = await this.db
      .update(notificationTemplates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notificationTemplates.id, id), isNull(notificationTemplates.deletedAt)))
      .returning({ id: notificationTemplates.id });
    return updated.length > 0;
  }

  async findTemplateById(id: string): Promise<NotificationTemplate | null> {
    const [row] = await this.db
      .select()
      .from(notificationTemplates)
      .where(and(eq(notificationTemplates.id, id), isNull(notificationTemplates.deletedAt)))
      .limit(1);
    return row ? toTemplate(row) : null;
  }

  async listTemplates(opts: TemplateListOptions): Promise<TemplateListResult> {
    const rows = await this.db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          isNull(notificationTemplates.deletedAt),
          opts.cursor ? lt(notificationTemplates.id, opts.cursor) : undefined,
        ),
      )
      .orderBy(desc(notificationTemplates.id))
      .limit(opts.limit + 1);
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: page.map(toTemplate),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      hasMore,
    };
  }

  async createCampaign(input: CreateCampaignInput): Promise<NotificationCampaign> {
    const [row] = await this.db
      .insert(notificationCampaigns)
      .values({
        templateId: input.templateId,
        title: input.title,
        body: input.body,
        deepLinkKind: input.deepLinkKind,
        deepLinkValue: input.deepLinkValue,
        audienceType: input.audienceType,
        status: 'draft',
        sendAt: input.sendAt,
        createdBy: input.createdBy,
      })
      .returning();
    return toCampaign(row);
  }

  async findCampaignById(id: string): Promise<NotificationCampaign | null> {
    const [row] = await this.db
      .select()
      .from(notificationCampaigns)
      .where(eq(notificationCampaigns.id, id))
      .limit(1);
    return row ? toCampaign(row) : null;
  }

  async listCampaigns(opts: CampaignListOptions): Promise<CampaignListResult> {
    const rows = await this.db
      .select()
      .from(notificationCampaigns)
      .where(
        and(
          opts.status ? eq(notificationCampaigns.status, opts.status) : undefined,
          opts.cursor ? lt(notificationCampaigns.id, opts.cursor) : undefined,
        ),
      )
      .orderBy(desc(notificationCampaigns.id))
      .limit(opts.limit + 1);
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: page.map(toCampaign),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      hasMore,
    };
  }

  async updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    patch?: {
      sendAt?: Date | null;
      lastError?: string | null;
      topicSent?: boolean;
      inboxCursor?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(notificationCampaigns)
      .set({
        status,
        updatedAt: new Date(),
        ...(patch?.sendAt !== undefined ? { sendAt: patch.sendAt } : {}),
        ...(patch?.lastError !== undefined ? { lastError: patch.lastError } : {}),
        ...(patch?.topicSent !== undefined ? { topicSent: patch.topicSent } : {}),
        ...(patch?.inboxCursor !== undefined ? { inboxCursor: patch.inboxCursor } : {}),
      })
      .where(eq(notificationCampaigns.id, id));
  }

  async incrementCampaignStats(id: string, delta: CampaignStatsDelta): Promise<void> {
    await this.db
      .update(notificationCampaigns)
      .set({
        ...(delta.pushSuccess
          ? { pushSuccess: sql`${notificationCampaigns.pushSuccess} + ${delta.pushSuccess}` }
          : {}),
        ...(delta.pushFailed
          ? { pushFailed: sql`${notificationCampaigns.pushFailed} + ${delta.pushFailed}` }
          : {}),
        ...(delta.inboxWritten
          ? { inboxWritten: sql`${notificationCampaigns.inboxWritten} + ${delta.inboxWritten}` }
          : {}),
        ...(delta.targetedUsers !== undefined
          ? { targetedUsers: delta.targetedUsers }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(notificationCampaigns.id, id));
  }

  async setTargetedUsers(id: string, count: number): Promise<void> {
    await this.db
      .update(notificationCampaigns)
      .set({ targetedUsers: count, updatedAt: new Date() })
      .where(eq(notificationCampaigns.id, id));
  }

  async listDueCampaigns(limit: number): Promise<NotificationCampaign[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(notificationCampaigns)
      .where(
        or(
          eq(notificationCampaigns.status, 'sending'),
          and(
            eq(notificationCampaigns.status, 'scheduled'),
            lte(notificationCampaigns.sendAt, now),
          ),
        ),
      )
      .orderBy(notificationCampaigns.createdAt)
      .limit(limit);
    return rows.map(toCampaign);
  }

  async insertRecipients(campaignId: string, userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const unique = [...new Set(userIds)];
    const inserted = await this.db
      .insert(notificationCampaignRecipients)
      .values(unique.map((userId) => ({ campaignId, userId, status: 'pending' as const })))
      .onConflictDoNothing({
        target: [
          notificationCampaignRecipients.campaignId,
          notificationCampaignRecipients.userId,
        ],
      })
      .returning({ id: notificationCampaignRecipients.id });
    return inserted.length;
  }

  async listPendingRecipients(campaignId: string, limit: number): Promise<CampaignRecipient[]> {
    const rows = await this.db
      .select()
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, campaignId),
          eq(notificationCampaignRecipients.status, 'pending'),
        ),
      )
      .orderBy(notificationCampaignRecipients.id)
      .limit(limit);
    return rows.map(toRecipient);
  }

  async updateRecipientStatus(
    id: string,
    status: CampaignRecipientStatus,
    error?: string | null,
  ): Promise<void> {
    await this.db
      .update(notificationCampaignRecipients)
      .set({
        status,
        error: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(notificationCampaignRecipients.id, id));
  }

  async countRecipientsByStatus(
    campaignId: string,
  ): Promise<Record<CampaignRecipientStatus, number>> {
    const rows = await this.db
      .select({
        status: notificationCampaignRecipients.status,
        value: count(),
      })
      .from(notificationCampaignRecipients)
      .where(eq(notificationCampaignRecipients.campaignId, campaignId))
      .groupBy(notificationCampaignRecipients.status);

    const result: Record<CampaignRecipientStatus, number> = {
      pending: 0,
      sent: 0,
      failed: 0,
      skipped_no_token: 0,
    };
    for (const row of rows) {
      result[row.status as CampaignRecipientStatus] = Number(row.value);
    }
    return result;
  }

  async listFailedRecipients(campaignId: string, limit: number): Promise<CampaignRecipient[]> {
    const rows = await this.db
      .select()
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, campaignId),
          or(
            eq(notificationCampaignRecipients.status, 'failed'),
            eq(notificationCampaignRecipients.status, 'skipped_no_token'),
          ),
        ),
      )
      .orderBy(desc(notificationCampaignRecipients.id))
      .limit(limit);
    return rows.map(toRecipient);
  }

  async resetFailedToPending(campaignId: string): Promise<number> {
    const updated = await this.db
      .update(notificationCampaignRecipients)
      .set({ status: 'pending', error: null, updatedAt: new Date() })
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, campaignId),
          or(
            eq(notificationCampaignRecipients.status, 'failed'),
            eq(notificationCampaignRecipients.status, 'skipped_no_token'),
          ),
        ),
      )
      .returning({ id: notificationCampaignRecipients.id });
    return updated.length;
  }

  async listActiveDeviceUserIds(opts: {
    limit: number;
    cursor?: string | null;
  }): Promise<{ userIds: string[]; nextCursor: string | null }> {
    const rows = await this.db
      .selectDistinct({ userId: deviceTokens.userId })
      .from(deviceTokens)
      .where(
        and(
          isNull(deviceTokens.deletedAt),
          opts.cursor ? sql`${deviceTokens.userId} > ${opts.cursor}` : undefined,
        ),
      )
      .orderBy(deviceTokens.userId)
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const userIds = page.map((r) => r.userId);
    return {
      userIds,
      nextCursor: hasMore && userIds.length > 0 ? userIds[userIds.length - 1]! : null,
    };
  }

  async countUsersWithActiveDevices(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(distinct ${deviceTokens.userId})` })
      .from(deviceTokens)
      .where(isNull(deviceTokens.deletedAt));
    return Number(row?.value ?? 0);
  }

  async countActiveDevicesForUsers(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const [row] = await this.db
      .select({ value: count() })
      .from(deviceTokens)
      .where(and(isNull(deviceTokens.deletedAt), inArray(deviceTokens.userId, userIds)));
    return Number(row?.value ?? 0);
  }
}
