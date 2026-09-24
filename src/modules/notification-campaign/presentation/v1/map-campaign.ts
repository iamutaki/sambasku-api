import type {
  DeepLinkKind,
  NotificationCampaign,
  NotificationTemplate,
} from '../../domain/entities/campaign.entity';

export function mapTemplate(t: NotificationTemplate) {
  return {
    id: t.id,
    name: t.name,
    title: t.title,
    body: t.body,
    deep_link_kind: t.deepLinkKind as DeepLinkKind,
    deep_link_value: t.deepLinkValue,
    created_by: t.createdBy,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt ? t.updatedAt.toISOString() : null,
  };
}

export function mapCampaign(c: NotificationCampaign) {
  return {
    id: c.id,
    template_id: c.templateId,
    title: c.title,
    body: c.body,
    deep_link_kind: c.deepLinkKind,
    deep_link_value: c.deepLinkValue,
    audience_type: c.audienceType,
    status: c.status,
    send_at: c.sendAt ? c.sendAt.toISOString() : null,
    targeted_users: c.targetedUsers,
    push_success: c.pushSuccess,
    push_failed: c.pushFailed,
    inbox_written: c.inboxWritten,
    topic_sent: c.topicSent,
    last_error: c.lastError,
    created_by: c.createdBy,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt ? c.updatedAt.toISOString() : null,
  };
}
