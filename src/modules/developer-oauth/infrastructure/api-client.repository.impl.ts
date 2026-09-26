import { eq } from 'drizzle-orm';
import { apiClients } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  ApiClient,
  ApiClientChannel,
  ApiClientStatus,
} from '../domain/entities/api-client.entity';
import type { ApiClientRepository } from '../domain/repositories/api-client.repository';

type Row = typeof apiClients.$inferSelect;

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function toEntity(row: Row): ApiClient {
  return {
    id: row.id,
    clientId: row.clientId,
    clientSecretHash: row.clientSecretHash,
    name: row.name,
    description: row.description,
    ownerUserId: row.ownerUserId,
    status: row.status as ApiClientStatus,
    isFirstParty: row.isFirstParty,
    homepageUrl: row.homepageUrl,
    privacyUrl: row.privacyUrl,
    redirectUris: parseJsonArray(row.redirectUris),
    allowedScopes: parseJsonArray(row.allowedScopes),
    allowedChannels: parseJsonArray(row.allowedChannels) as ApiClientChannel[],
    rateLimitTier: row.rateLimitTier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ApiClientRepositoryImpl implements ApiClientRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByClientId(clientId: string): Promise<ApiClient | null> {
    const [row] = await this.db
      .select()
      .from(apiClients)
      .where(eq(apiClients.clientId, clientId))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findById(id: string): Promise<ApiClient | null> {
    const [row] = await this.db.select().from(apiClients).where(eq(apiClients.id, id)).limit(1);
    return row ? toEntity(row) : null;
  }
}
