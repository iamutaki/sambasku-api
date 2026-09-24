/** Topic FCM untuk broadcast campaign ke semua device terpasang. */
export const CAMPAIGN_FCM_TOPIC = 'sambasku_campaigns';

/** User per invocation batch (budget subrequest Workers). */
export const CAMPAIGN_CHUNK_SIZE = 10;

/** Maks chunk per invocasi processor (cron / send). */
export const CAMPAIGN_MAX_CHUNKS_PER_RUN = 5;

export type DeepLinkKind = 'word' | 'contribution' | 'suggestion' | 'url' | 'none';

export type CampaignAudienceType = 'all' | 'selected';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CampaignRecipientStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped_no_token';

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  deepLinkKind: DeepLinkKind;
  deepLinkValue: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface NotificationCampaign {
  id: string;
  templateId: string | null;
  title: string;
  body: string;
  deepLinkKind: DeepLinkKind;
  deepLinkValue: string | null;
  audienceType: CampaignAudienceType;
  status: CampaignStatus;
  sendAt: Date | null;
  targetedUsers: number;
  pushSuccess: number;
  pushFailed: number;
  inboxWritten: number;
  inboxCursor: string | null;
  topicSent: boolean;
  lastError: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  userId: string;
  status: CampaignRecipientStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export function buildCampaignPushData(campaign: {
  id: string;
  deepLinkKind: DeepLinkKind;
  deepLinkValue: string | null;
}): Record<string, string> {
  const data: Record<string, string> = {
    type: 'campaign',
    campaign_id: campaign.id,
    target_kind: 'campaign',
    target_id: campaign.id,
  };
  if (campaign.deepLinkKind && campaign.deepLinkKind !== 'none' && campaign.deepLinkValue) {
    data.deep_link_kind = campaign.deepLinkKind;
    data.deep_link_value = campaign.deepLinkValue;
    if (campaign.deepLinkKind === 'word') {
      data.target_kind = 'word';
      data.target_id = campaign.deepLinkValue;
    } else if (campaign.deepLinkKind === 'contribution') {
      data.target_kind = 'contribution';
      data.target_id = campaign.deepLinkValue;
    } else if (campaign.deepLinkKind === 'suggestion') {
      data.target_kind = 'suggestion';
      data.target_id = campaign.deepLinkValue;
    } else if (campaign.deepLinkKind === 'url') {
      data.url = campaign.deepLinkValue;
    }
  }
  return data;
}
