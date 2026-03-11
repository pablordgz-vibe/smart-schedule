import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AppEdition,
  SetupBootstrapPayload,
  SetupIntegrationProvider,
  SetupStateSnapshot,
} from '@smart-schedule/contracts';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  private readonly stateFilePath = path.resolve(
    process.cwd(),
    process.env.SETUP_STATE_FILE ?? '.smart-schedule/setup-state.json',
  );

  async getSetupState(): Promise<SetupStateSnapshot> {
    const persisted = await this.readPersistedState();
    const isComplete = Boolean(persisted.completedAt);

    return {
      admin: isComplete ? null : persisted.admin,
      completedAt: persisted.completedAt,
      configuredIntegrations: isComplete ? [] : persisted.configuredIntegrations,
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
      this.getAvailableIntegrations().map((provider) => [provider.code, provider]),
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
    const nextState: PersistedSetupState = {
      admin: {
        createdAt: completedAt,
        email: payload.admin.email.trim().toLowerCase(),
        id: randomUUID(),
        name: payload.admin.name.trim(),
        role: 'system-admin',
      },
      completedAt,
      configuredIntegrations: normalizedIntegrations,
    };

    await this.writePersistedState(nextState);

    return {
      auditAction: 'setup.completed',
      state: await this.getSetupState(),
    };
  }

  private isModeAllowed(mode: SetupIntegrationProvider['credentialModes'][number]) {
    return this.edition === 'community' || mode === 'api-key';
  }

  private resolveCurrentStep(state: PersistedSetupState): SetupStateSnapshot['step'] {
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
    try {
      const content = await readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(content) as PersistedSetupState;

      return {
        admin: parsed.admin ?? null,
        completedAt: parsed.completedAt ?? null,
        configuredIntegrations: parsed.configuredIntegrations ?? [],
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          admin: null,
          completedAt: null,
          configuredIntegrations: [],
        };
      }

      throw error;
    }
  }

  private async writePersistedState(state: PersistedSetupState) {
    await mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
