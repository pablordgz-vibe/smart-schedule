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

type BootstrapStatusResponse = {
  edition: SetupStateSnapshot['edition'];
  isComplete: boolean;
};

@Injectable({ providedIn: 'root' })
export class SetupStateService {
  private readonly state = signal<SetupStateSnapshot | null>(null);
  private readonly providers = signal<SetupIntegrationProvider[]>([]);
  private readonly loading = signal(false);
  private readonly loadErrorState = signal<string | null>(null);

  readonly snapshot = this.state.asReadonly();
  readonly integrationProviders = this.providers.asReadonly();
  readonly isLoaded = computed(() => this.state() !== null || this.loadErrorState() !== null);
  readonly isComplete = computed(() => this.state()?.isComplete ?? false);
  readonly edition = computed(() => this.state()?.edition ?? 'community');
  readonly loadError = this.loadErrorState.asReadonly();

  setSnapshot(snapshot: SetupStateSnapshot | null): void {
    this.loadErrorState.set(null);
    this.state.set(snapshot);
  }

  async load(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.loadErrorState.set(null);
    try {
      const bootstrapStatusResponse = await fetch('/api/platform/bootstrap-status');
      if (!bootstrapStatusResponse.ok) {
        throw new Error('Bootstrap status is unavailable.');
      }

      const bootstrapStatus = (await bootstrapStatusResponse.json()) as BootstrapStatusResponse;
      if (typeof bootstrapStatus.isComplete !== 'boolean') {
        throw new Error('Bootstrap status payload is invalid.');
      }

      if (bootstrapStatus.isComplete) {
        this.state.set({
          admin: null,
          completedAt: null,
          configuredIntegrations: [],
          edition: bootstrapStatus.edition,
          isComplete: true,
          step: 'complete',
        });
        this.providers.set([]);
        return;
      }

      const stateResponse = await fetch('/api/setup/state');
      if (!stateResponse.ok) {
        throw new Error('Setup state is unavailable.');
      }

      const state = (await stateResponse.json()) as SetupStateSnapshot;
      if (typeof state.isComplete !== 'boolean') {
        throw new Error('Setup state payload is invalid.');
      }
      this.state.set(state);

      const integrationsResponse = await fetch('/api/setup/integrations');
      if (!integrationsResponse.ok) {
        throw new Error('Integration catalog is unavailable.');
      }

      const integrations = (await integrationsResponse.json()) as SetupIntegrationOptionsResponse;
      if (!Array.isArray(integrations.providers)) {
        throw new Error('Integration catalog payload is invalid.');
      }
      this.providers.set(integrations.providers);
      this.loadErrorState.set(null);
    } catch (error: unknown) {
      this.state.set(null);
      this.providers.set([]);
      this.loadErrorState.set(
        error instanceof Error ? error.message : 'Setup state is unavailable.',
      );
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
