import { BadRequestError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { DeepLinkKind } from '../../domain/entities/campaign.entity';
import type { NotificationCampaignRepository } from '../../domain/repositories/notification-campaign.repository';

function assertDeepLink(kind: DeepLinkKind, value: string | null | undefined) {
  if (kind === 'none') return;
  if (!value?.trim()) {
    throw new BadRequestError('VALIDATION_ERROR', 'Deep link wajib diisi untuk jenis yang dipilih', [
      { field: 'deep_link_value', message: 'Isi target deep link' },
    ]);
  }
}

export class CreateNotificationTemplateUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: {
    name: string;
    title: string;
    body: string;
    deepLinkKind: DeepLinkKind;
    deepLinkValue?: string | null;
    createdBy: string;
    requestId?: string | null;
  }) {
    assertDeepLink(input.deepLinkKind, input.deepLinkValue);
    const template = await this.repo.createTemplate({
      name: input.name.trim(),
      title: input.title.trim(),
      body: input.body.trim(),
      deepLinkKind: input.deepLinkKind,
      deepLinkValue: input.deepLinkValue?.trim() || null,
      createdBy: input.createdBy,
    });
    await this.auditRepo.record({
      userId: input.createdBy,
      action: 'create',
      entityType: 'notification_template',
      entityId: template.id,
      newData: { name: template.name, title: template.title },
      requestId: input.requestId ?? null,
    });
    return template;
  }
}

export class UpdateNotificationTemplateUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: {
    id: string;
    name?: string;
    title?: string;
    body?: string;
    deepLinkKind?: DeepLinkKind;
    deepLinkValue?: string | null;
    actorId: string;
    requestId?: string | null;
  }) {
    const existing = await this.repo.findTemplateById(input.id);
    if (!existing) {
      throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan');
    }
    const kind = input.deepLinkKind ?? existing.deepLinkKind;
    const value =
      input.deepLinkValue !== undefined ? input.deepLinkValue : existing.deepLinkValue;
    assertDeepLink(kind, value);

    const updated = await this.repo.updateTemplate(input.id, {
      name: input.name?.trim(),
      title: input.title?.trim(),
      body: input.body?.trim(),
      deepLinkKind: input.deepLinkKind,
      deepLinkValue: input.deepLinkValue !== undefined ? (input.deepLinkValue?.trim() || null) : undefined,
    });
    if (!updated) {
      throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan');
    }
    await this.auditRepo.record({
      userId: input.actorId,
      action: 'update',
      entityType: 'notification_template',
      entityId: updated.id,
      oldData: { name: existing.name, title: existing.title },
      newData: { name: updated.name, title: updated.title },
      requestId: input.requestId ?? null,
    });
    return updated;
  }
}

export class DeleteNotificationTemplateUseCase {
  constructor(
    private readonly repo: NotificationCampaignRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: { id: string; actorId: string; requestId?: string | null }) {
    const existing = await this.repo.findTemplateById(input.id);
    if (!existing) {
      throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan');
    }
    await this.repo.softDeleteTemplate(input.id);
    await this.auditRepo.record({
      userId: input.actorId,
      action: 'delete',
      entityType: 'notification_template',
      entityId: input.id,
      oldData: { name: existing.name },
      requestId: input.requestId ?? null,
    });
  }
}

export class ListNotificationTemplatesUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(opts: { limit: number; cursor?: string }) {
    return this.repo.listTemplates(opts);
  }
}

export class GetNotificationTemplateUseCase {
  constructor(private readonly repo: NotificationCampaignRepository) {}

  async execute(id: string) {
    const template = await this.repo.findTemplateById(id);
    if (!template) {
      throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Template tidak ditemukan');
    }
    return template;
  }
}
