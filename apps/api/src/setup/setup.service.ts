import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AppEdition,
  SetupBootstrapPayload,
  SetupIntegrationProvider,
  SetupStateSnapshot,
} from '@smart-schedule/contracts';
import { IdentityService } from '../identity/identity.service';
import { DatabaseService } from '../persistence/database.service';
import { AuditService } from '../security/audit.service';

type PersistedSetupState = {
  admin: SetupStateSnapshot['admin'];
  completedAt: string | null;
  configuredIntegrations: SetupStateSnapshot['configuredIntegrations'];
};

const integrationCatalog: SetupIntegrationProvider[] = [
  {
    category: 'calendar',
    code: 'google-calendar',
    credentialModes: ['api-key', 'provider-login'],
    description: 'Calendar sync and free-busy import from Google Workspace.',
    displayName: 'Google Calendar',
  },
  {
    category: 'holiday-data',
    code: 'calendarific',
    credentialModes: ['api-key'],
    description: 'Public holiday import keyed by region and jurisdiction.',
    displayName: 'Calendarific',
  },
  {
    category: 'ai',
    code: 'openai',
    credentialModes: ['api-key'],
    description: 'Optional AI assistance for planning and drafting workflows.',
    displayName: 'OpenAI',
  },
];

@Injectable()
export class SetupService {
  private readonly edition: AppEdition =
    (process.env.APP_EDITION as AppEdition | undefined) ?? 'community';

  constructor(
    private readonly auditService: AuditService,
    private readonly identityService: IdentityService,
    private readonly databaseService: DatabaseService,
  ) {}

  async getSetupState(): Promise<SetupStateSnapshot> {
    const persisted = await this.readPersistedState();
    const isComplete = Boolean(persisted.completedAt);

    return {
      admin: isComplete ? null : persisted.admin,
      completedAt: persisted.completedAt,
      configuredIntegrations: isComplete
        ? []
        : persisted.configuredIntegrations,
      edition: this.edition,
      isComplete,
      step: this.resolveCurrentStep(persisted),
    };
  }

  async isSetupComplete(): Promise<boolean> {
    const state = await this.readPersistedState();
    return Boolean(state.completedAt);
  }

  getAvailableIntegrations(): SetupIntegrationProvider[] {
    return integrationCatalog.map((provider) => ({
      ...provider,
      credentialModes: provider.credentialModes.filter((mode) =>
        this.isModeAllowed(mode),
      ),
    }));
  }

  async completeSetup(payload: SetupBootstrapPayload) {
    const state = await this.readPersistedState();
    if (state.completedAt) {
      return null;
    }

    const allowedProviders = new Map(
      this.getAvailableIntegrations().map((provider) => [
        provider.code,
        provider,
      ]),
    );

    const normalizedIntegrations = payload.integrations
      .filter((integration) => integration.enabled)
      .map((integration) => {
        const provider = allowedProviders.get(integration.code);
        if (!provider) {
          throw new BadRequestException(
            `Unknown integration provider: ${integration.code}`,
          );
        }

        if (!provider.credentialModes.includes(integration.mode)) {
          throw new BadRequestException(
            `Credential mode ${integration.mode} is not allowed for ${integration.code}`,
          );
        }

        return {
          code: integration.code,
          credentials: integration.credentials,
          enabled: true,
          mode: integration.mode,
        };
      });

    const completedAt = new Date().toISOString();
    const adminUser = await this.identityService.createInitialAdmin({
      email: payload.admin.email,
      name: payload.admin.name,
      password: payload.admin.password,
    });
    const nextState: PersistedSetupState = {
      admin: {
        createdAt: completedAt,
        email: adminUser.email,
        id: adminUser.id,
        name: adminUser.name,
        role: 'system-admin',
      },
      completedAt,
      configuredIntegrations: normalizedIntegrations,
    };

    await this.writePersistedState(nextState);
    this.auditService.emit({
      action: 'setup.completed',
      details: {
        configuredIntegrationCount: normalizedIntegrations.length,
        edition: this.edition,
      },
      targetId: adminUser.id,
      targetType: 'user',
    });

    return {
      state: await this.getSetupState(),
    };
  }

  private isModeAllowed(
    mode: SetupIntegrationProvider['credentialModes'][number],
  ) {
    return this.edition === 'community' || mode === 'api-key';
  }

  private resolveCurrentStep(
    state: PersistedSetupState,
  ): SetupStateSnapshot['step'] {
    if (state.completedAt) {
      return 'complete';
    }

    if (state.admin) {
      return 'review';
    }

    if (state.configuredIntegrations.length > 0) {
      return 'admin';
    }

    return 'integrations';
  }

  private async readPersistedState(): Promise<PersistedSetupState> {
    const stateResult = await this.databaseService.query<{
      admin_user_id: string | null;
      completed_at: Date | string | null;
    }>(
      `select admin_user_id, completed_at
       from setup_state
       where id = 1`,
    );
    const integrationsResult = await this.databaseService.query<{
      code: string;
      credentials: Record<string, string>;
      enabled: boolean;
      mode: 'api-key' | 'provider-login';
    }>(
      `select code, credentials, enabled, mode
       from setup_integrations
       order by code`,
    );

    const stateRow = stateResult.rows[0];
    if (!stateRow) {
      return {
        admin: null,
        completedAt: null,
        configuredIntegrations: [],
      };
    }

    let admin: SetupStateSnapshot['admin'] = null;
    if (stateRow.admin_user_id) {
      const adminSummary = await this.identityService.getUserSummary(
        stateRow.admin_user_id,
      );
      if (adminSummary) {
        admin = {
          createdAt: adminSummary.roles.includes('system-admin')
            ? (adminSummary.authMethods[0]?.linkedAt ??
              new Date().toISOString())
            : new Date().toISOString(),
          email: adminSummary.email,
          id: adminSummary.id,
          name: adminSummary.name,
          role: 'system-admin',
        };
      }
    }

    return {
      admin,
      completedAt: toIsoString(stateRow.completed_at),
      configuredIntegrations: integrationsResult.rows.map((row) => ({
        code: row.code,
        credentials: row.credentials ?? {},
        enabled: row.enabled,
        mode: row.mode,
      })),
    };
  }

  private async writePersistedState(state: PersistedSetupState) {
    await this.databaseService.transaction(async (client) => {
      await client.query(
        `insert into setup_state (
           id,
           edition,
           admin_user_id,
           completed_at,
           updated_at
         )
         values (1, $1, $2, $3, now())
         on conflict (id) do update
         set edition = excluded.edition,
             admin_user_id = excluded.admin_user_id,
             completed_at = excluded.completed_at,
             updated_at = now()`,
        [this.edition, state.admin?.id ?? null, state.completedAt],
      );
      await client.query('delete from setup_integrations');

      for (const integration of state.configuredIntegrations) {
        const category =
          integrationCatalog.find(
            (provider) => provider.code === integration.code,
          )?.category ?? 'calendar';
        await client.query(
          `insert into setup_integrations (
             code,
             category,
             credentials,
             enabled,
             mode,
             updated_at
           )
           values ($1, $2, $3::jsonb, $4, $5, now())`,
          [
            integration.code,
            category,
            JSON.stringify(integration.credentials),
            integration.enabled,
            integration.mode,
          ],
        );
      }
    });
  }
}

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
