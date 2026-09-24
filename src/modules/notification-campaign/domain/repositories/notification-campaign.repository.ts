import type {
  CampaignAudienceType,
  CampaignRecipient,
  CampaignRecipientStatus,
  CampaignStatus,
  DeepLinkKind,
  NotificationCampaign,
  NotificationTemplate,
} from '../entities/campaign.entity';

export interface CreateTemplateInput {
  name: string;
  title: string;
  body: string;
  deepLinkKind: DeepLinkKind;
  deepLinkValue: string | null;
  createdBy: string;
}

export interface UpdateTemplateInput {
  name?: string;
  title?: string;
  body?: string;
  deepLinkKind?: DeepLinkKind;
  deepLinkValue?: string | null;
}

export interface CreateCampaignInput {
  templateId: string | null;
  title: string;
  body: string;
  deepLinkKind: DeepLinkKind;
  deepLinkValue: string | null;
  audienceType: CampaignAudienceType;
  sendAt: Date | null;
  createdBy: string;
}

export interface CampaignStatsDelta {
  pushSuccess?: number;
  pushFailed?: number;
  inboxWritten?: number;
  targetedUsers?: number;
}

export interface CampaignListOptions {
  limit: number;
  cursor?: string;
  status?: CampaignStatus;
}

export interface CampaignListResult {
  items: NotificationCampaign[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TemplateListOptions {
  limit: number;
  cursor?: string;
}

export interface TemplateListResult {
  items: NotificationTemplate[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NotificationCampaignRepository {
  // Templates
  createTemplate(input: CreateTemplateInput): Promise<NotificationTemplate>;
  updateTemplate(id: string, input: UpdateTemplateInput): Promise<NotificationTemplate | null>;
  softDeleteTemplate(id: string): Promise<boolean>;
  findTemplateById(id: string): Promise<NotificationTemplate | null>;
  listTemplates(opts: TemplateListOptions): Promise<TemplateListResult>;

  // Campaigns
  createCampaign(input: CreateCampaignInput): Promise<NotificationCampaign>;
  findCampaignById(id: string): Promise<NotificationCampaign | null>;
  listCampaigns(opts: CampaignListOptions): Promise<CampaignListResult>;
  updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    patch?: { sendAt?: Date | null; lastError?: string | null; topicSent?: boolean; inboxCursor?: string | null },
  ): Promise<void>;
  incrementCampaignStats(id: string, delta: CampaignStatsDelta): Promise<void>;
  setTargetedUsers(id: string, count: number): Promise<void>;

  /** Campaign scheduled yang sudah waktunya, atau status sending. */
  listDueCampaigns(limit: number): Promise<NotificationCampaign[]>;

  // Recipients
  insertRecipients(campaignId: string, userIds: string[]): Promise<number>;
  listPendingRecipients(campaignId: string, limit: number): Promise<CampaignRecipient[]>;
  updateRecipientStatus(
    id: string,
    status: CampaignRecipientStatus,
    error?: string | null,
  ): Promise<void>;
  countRecipientsByStatus(campaignId: string): Promise<Record<CampaignRecipientStatus, number>>;
  listFailedRecipients(campaignId: string, limit: number): Promise<CampaignRecipient[]>;
  resetFailedToPending(campaignId: string): Promise<number>;

  /** User unik dengan device token aktif (untuk audience=all inbox). */
  listActiveDeviceUserIds(opts: { limit: number; cursor?: string | null }): Promise<{
    userIds: string[];
    nextCursor: string | null;
  }>;
  countUsersWithActiveDevices(): Promise<number>;
  countActiveDevicesForUsers(userIds: string[]): Promise<number>;
}
