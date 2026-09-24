import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type {
  CreateNotificationTemplateUseCase,
  UpdateNotificationTemplateUseCase,
  DeleteNotificationTemplateUseCase,
  ListNotificationTemplatesUseCase,
  GetNotificationTemplateUseCase,
} from '../../application/use-cases/template.use-cases';
import type {
  CreateCampaignDraftUseCase,
  ListCampaignsUseCase,
  GetCampaignDetailUseCase,
  CancelCampaignUseCase,
  SendCampaignUseCase,
  RetryFailedCampaignRecipientsUseCase,
  EstimateCampaignAudienceUseCase,
} from '../../application/use-cases/campaign.use-cases';
import { mapCampaign, mapTemplate } from './map-campaign';
import type {
  CreateCampaignBody,
  CreateTemplateBody,
  EstimateAudienceBody,
  ListCampaignsQuery,
  ListTemplatesQuery,
  UpdateTemplateBody,
} from './validators/campaign.validator';

type AdminCtx = Context<{ Variables: AppVariables }>;

export class NotificationCampaignController {
  constructor(
    private readonly deps: {
      createTemplate: CreateNotificationTemplateUseCase;
      updateTemplate: UpdateNotificationTemplateUseCase;
      deleteTemplate: DeleteNotificationTemplateUseCase;
      listTemplates: ListNotificationTemplatesUseCase;
      getTemplate: GetNotificationTemplateUseCase;
      createCampaign: CreateCampaignDraftUseCase;
      listCampaigns: ListCampaignsUseCase;
      getCampaign: GetCampaignDetailUseCase;
      cancelCampaign: CancelCampaignUseCase;
      sendCampaign: SendCampaignUseCase;
      retryCampaign: RetryFailedCampaignRecipientsUseCase;
      estimateAudience: EstimateCampaignAudienceUseCase;
    },
  ) {}

  async createTemplate(c: AdminCtx, body: CreateTemplateBody) {
    const user = this.requireUser(c);
    const template = await this.deps.createTemplate.execute({
      name: body.name,
      title: body.title,
      body: body.body,
      deepLinkKind: body.deep_link_kind,
      deepLinkValue: body.deep_link_value,
      createdBy: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapTemplate(template) }, 201);
  }

  async updateTemplate(c: AdminCtx, id: string, body: UpdateTemplateBody) {
    const user = this.requireUser(c);
    const template = await this.deps.updateTemplate.execute({
      id,
      name: body.name,
      title: body.title,
      body: body.body,
      deepLinkKind: body.deep_link_kind,
      deepLinkValue: body.deep_link_value,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapTemplate(template) });
  }

  async deleteTemplate(c: AdminCtx, id: string) {
    const user = this.requireUser(c);
    await this.deps.deleteTemplate.execute({
      id,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: null });
  }

  async listTemplates(c: AdminCtx, query: ListTemplatesQuery) {
    const result = await this.deps.listTemplates.execute({
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: result.items.map(mapTemplate),
      meta: {
        limit: query.limit,
        next_cursor: result.nextCursor,
        has_more: result.hasMore,
      },
    });
  }

  async getTemplate(c: AdminCtx, id: string) {
    const template = await this.deps.getTemplate.execute(id);
    return c.json({ success: true as const, data: mapTemplate(template) });
  }

  async createCampaign(c: AdminCtx, body: CreateCampaignBody) {
    const user = this.requireUser(c);
    const campaign = await this.deps.createCampaign.execute({
      templateId: body.template_id,
      title: body.title,
      body: body.body,
      deepLinkKind: body.deep_link_kind,
      deepLinkValue: body.deep_link_value,
      audienceType: body.audience_type,
      userIds: body.user_ids,
      sendAt: body.send_at ? new Date(body.send_at) : null,
      createdBy: user.user_id,
    });
    return c.json({ success: true as const, data: mapCampaign(campaign!) }, 201);
  }

  async listCampaigns(c: AdminCtx, query: ListCampaignsQuery) {
    const result = await this.deps.listCampaigns.execute({
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
    });
    return c.json({
      success: true as const,
      data: result.items.map(mapCampaign),
      meta: {
        limit: query.limit,
        next_cursor: result.nextCursor,
        has_more: result.hasMore,
      },
    });
  }

  async getCampaign(c: AdminCtx, id: string) {
    const { campaign, recipientCounts, failures } = await this.deps.getCampaign.execute(id);
    return c.json({
      success: true as const,
      data: {
        ...mapCampaign(campaign),
        recipient_counts: recipientCounts,
        failures: failures.map((f) => ({
          id: f.id,
          user_id: f.userId,
          status: f.status,
          error: f.error,
        })),
      },
    });
  }

  async sendCampaign(c: AdminCtx, id: string) {
    const user = this.requireUser(c);
    const campaign = await this.deps.sendCampaign.execute({
      id,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
      processNow: true,
    });
    return c.json({ success: true as const, data: mapCampaign(campaign!) });
  }

  async cancelCampaign(c: AdminCtx, id: string) {
    const user = this.requireUser(c);
    const campaign = await this.deps.cancelCampaign.execute({
      id,
      actorId: user.user_id,
      requestId: c.get('requestId') ?? null,
    });
    return c.json({ success: true as const, data: mapCampaign(campaign!) });
  }

  async retryCampaign(c: AdminCtx, id: string) {
    const campaign = await this.deps.retryCampaign.execute({ id });
    return c.json({ success: true as const, data: mapCampaign(campaign!) });
  }

  async estimateAudience(c: AdminCtx, body: EstimateAudienceBody) {
    const result = await this.deps.estimateAudience.execute({
      audienceType: body.audience_type,
      userIds: body.user_ids,
    });
    return c.json({ success: true as const, data: result });
  }

  private requireUser(c: AdminCtx): AuthUser {
    const user = c.get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }
}
