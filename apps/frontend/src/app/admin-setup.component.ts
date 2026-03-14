import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupStateService } from './setup/setup-state.service';
import type { AdminIntegrationSummary } from './setup/setup.types';

@Component({
  selector: 'app-admin-setup',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="grid gap-6" data-testid="page-admin-setup">
      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
            System Administration
          </p>
          <h1 class="text-3xl font-semibold tracking-tight">Setup / Deployment</h1>
          <p class="max-w-2xl text-sm leading-6 text-base-content/65">
            Review the current deployment state, confirm bootstrap is closed, and jump into the
            system-admin surfaces that are already implemented in sprint 0 to 2.
          </p>
        </div>

        <div *ngIf="errorMessage()" class="alert alert-error">{{ errorMessage() }}</div>

        <div class="grid gap-4 lg:grid-cols-3">
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2 class="text-lg font-semibold">Edition</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/65">
              {{ editionLabel() }}
            </p>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2 class="text-lg font-semibold">Bootstrap status</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/65">
              {{
                setupComplete()
                  ? 'Initial setup completed and locked.'
                  : 'Initial setup still open.'
              }}
            </p>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2 class="text-lg font-semibold">Configured integrations</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/65">
              {{ enabledIntegrationCount() }} enabled / {{ integrations().length }} configured
            </p>
          </article>
        </div>

        <article class="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold">Deployment summary</h2>
            <p class="text-sm leading-6 text-base-content/65">
              This instance is past first-run setup. Use the links below to manage users and global
              provider credentials without going back through bootstrap routes.
            </p>
          </div>

          <ul class="grid gap-3">
            <li
              *ngFor="let integration of integrations()"
              class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div class="space-y-1">
                <strong>{{ integration.code }}</strong>
                <p class="text-sm text-base-content/60">
                  {{ integration.enabled ? 'Enabled' : 'Disabled' }} ·
                  {{ integration.hasCredentials ? 'Credentials stored' : 'Credentials missing' }} ·
                  {{ integration.mode }}
                </p>
              </div>
              <span class="text-sm text-base-content/55">
                Updated {{ formatDateTime(integration.updatedAt) }}
              </span>
            </li>
            <li *ngIf="integrations().length === 0" class="text-sm text-base-content/60">
              No integration settings have been configured yet.
            </li>
          </ul>
        </article>

        <div class="flex flex-wrap gap-3">
          <a class="btn btn-neutral" routerLink="/admin/users">Open user controls</a>
          <a class="btn btn-outline" routerLink="/admin/global-integrations"
            >Open global integrations</a
          >
        </div>
      </article>
    </section>
  `,
})
export class AdminSetupComponent {
  private readonly setupState = inject(SetupStateService);

  readonly integrations = signal<AdminIntegrationSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly editionLabel = signal<'commercial' | 'community'>('community');
  readonly setupComplete = signal(true);
  readonly enabledIntegrationCount = signal(0);

  constructor() {
    void this.load();
  }

  async load() {
    try {
      this.errorMessage.set(null);
      this.setupComplete.set(this.setupState.isComplete());
      const snapshot = await this.setupState.loadAdminIntegrations();
      this.integrations.set(snapshot.configuredIntegrations);
      this.editionLabel.set(snapshot.edition);
      this.enabledIntegrationCount.set(
        snapshot.configuredIntegrations.filter((integration) => integration.enabled).length,
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load deployment summary.',
      );
    }
  }

  formatDateTime(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }
}
