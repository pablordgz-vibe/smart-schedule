import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';

type IntegrationConfigRecord = {
  code: string;
  credentials: Record<string, string>;
  enabled: boolean;
  mode: 'api-key' | 'provider-login';
};

@Injectable()
export class IntegrationConfigService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getIntegration(code: string): Promise<IntegrationConfigRecord | null> {
    const result = await this.databaseService.query<IntegrationConfigRecord>(
      `select code, credentials, enabled, mode
       from setup_integrations
       where code = $1`,
      [code],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      code: row.code,
      credentials: row.credentials ?? {},
      enabled: row.enabled,
      mode: row.mode,
    };
  }

  async getRequiredEnabledIntegration(code: string) {
    const integration = await this.getIntegration(code);
    if (!integration || !integration.enabled) {
      return null;
    }

    return integration;
  }
}
