import type { ApiClient } from '../entities/api-client.entity';

export interface ApiClientRepository {
  findByClientId(clientId: string): Promise<ApiClient | null>;
  findById(id: string): Promise<ApiClient | null>;
}
