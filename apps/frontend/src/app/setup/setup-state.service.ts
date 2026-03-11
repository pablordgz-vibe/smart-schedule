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

  async load(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    try {
      const stateResponse = await fetch('/api/setup/state');
      const state = (await stateResponse.json()) as SetupStateSnapshot;
      this.state.set(state);

      if (state.isComplete) {
        this.providers.set([]);
        return;
      }

      const integrationsResponse = await fetch('/api/setup/integrations');
      const integrations =
        (await integrationsResponse.json()) as SetupIntegrationOptionsResponse;
      this.providers.set(integrations.providers);
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
