import { Injectable, computed, signal } from '@angular/core';
import type {
  SetupBootstrapPayload,
  SetupIntegrationProvider,
  SetupStateSnapshot,
} from './setup.types';

type SetupIntegrationOptionsResponse = {
  edition: SetupStateSnapshot['edition'];
  providers: SetupIntegrationProvider[];
};

const standaloneSetupFallback: SetupStateSnapshot = {
  admin: null,
  completedAt: '2026-03-11T00:00:00.000Z',
  configuredIntegrations: [],
  edition: 'community',
  isComplete: true,
  step: 'complete',
};

@Injectable({ providedIn: 'root' })
export class SetupStateService {
  private readonly state = signal<SetupStateSnapshot | null>(null);
  private readonly providers = signal<SetupIntegrationProvider[]>([]);
  private readonly loading = signal(false);

  readonly snapshot = this.state.asReadonly();
  readonly integrationProviders = this.providers.asReadonly();
  readonly isLoaded = computed(() => this.state() !== null);
  readonly isComplete = computed(() => this.state()?.isComplete ?? false);
  readonly edition = computed(() => this.state()?.edition ?? 'community');

  setSnapshot(snapshot: SetupStateSnapshot | null): void {
    this.state.set(snapshot);
  }

  async load(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    try {
      const stateResponse = await fetch('/api/setup/state');
      if (!stateResponse.ok) {
        throw new Error('Setup state is unavailable.');
      }

      const state = (await stateResponse.json()) as SetupStateSnapshot;
      if (typeof state.isComplete !== 'boolean') {
        throw new Error('Setup state payload is invalid.');
      }
      this.state.set(state);

      if (state.isComplete) {
        this.providers.set([]);
        return;
      }

      const integrationsResponse = await fetch('/api/setup/integrations');
      if (!integrationsResponse.ok) {
        throw new Error('Integration catalog is unavailable.');
      }

      const integrations = (await integrationsResponse.json()) as SetupIntegrationOptionsResponse;
      if (!Array.isArray(integrations.providers)) {
        throw new Error('Integration catalog payload is invalid.');
      }
      this.providers.set(integrations.providers);
    } catch {
      this.state.set(standaloneSetupFallback);
      this.providers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async completeSetup(payload: SetupBootstrapPayload): Promise<SetupStateSnapshot> {
    const response = await fetch('/api/setup/complete', {
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const body = (await response.json()) as {
      error?: { message: string };
      state?: SetupStateSnapshot;
    };

    if (!response.ok || !body.state) {
      throw new Error(body.error?.message ?? 'Setup completion failed.');
    }

    this.state.set(body.state);
    return body.state;
  }
}
