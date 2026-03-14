import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SetupStateService } from './setup/setup-state.service';
import type {
  AdminIntegrationSnapshot,
  MailOutboxSummary,
  SetupBootstrapPayload,
  SetupIntegrationCredentialMode,
} from './setup/setup.types';

type IntegrationFormState = {
  code: string;
  credentials: Record<string, string>;
  displayName: string;
  enabled: boolean;
  hasCredentials: boolean;
  mode: SetupIntegrationCredentialMode;
};

const EMPTY_CREDENTIAL_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  secret: boolean;
}> = [];

const PROVIDER_CREDENTIAL_FIELDS: Readonly<
  Record<
    string,
    ReadonlyArray<{
      key: string;
      label: string;
      secret: boolean;
    }>
  >
> = {
  'github-social-auth': [
    { key: 'clientId', label: 'Client ID', secret: false },
    { key: 'clientSecret', label: 'Client secret', secret: true },
  ],
  'google-social-auth': [
    { key: 'clientId', label: 'Client ID', secret: false },
    { key: 'clientSecret', label: 'Client secret', secret: true },
  ],
  'microsoft-social-auth': [
    { key: 'clientId', label: 'Client ID', secret: false },
    { key: 'clientSecret', label: 'Client secret', secret: true },
    { key: 'tenantId', label: 'Tenant ID', secret: false },
  ],
};

@Component({
  selector: 'app-admin-global-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" data-testid="page-admin-global-integrations">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm">
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
            System Administration
          </p>
          <h1 class="text-3xl font-semibold tracking-tight">Global Integrations</h1>
          <p class="max-w-2xl text-sm leading-6 text-base-content/65">
            Manage platform-wide providers and email delivery credentials after setup.
          </p>
        </div>

        <div *ngIf="errorMessage()" class="alert alert-error mt-4">{{ errorMessage() }}</div>
        <div *ngIf="message()" class="alert alert-info mt-4">{{ message() }}</div>

        <div class="mt-6 grid gap-4 xl:grid-cols-2">
          <article class="rounded-box border border-base-300 bg-base-100 p-5">
            <div class="mb-4 space-y-1">
              <h2 class="text-xl font-semibold">Configured providers</h2>
              <p class="text-sm text-base-content/65">Edition: {{ editionLabel() }}</p>
            </div>

            <div class="grid gap-4">
              <article *ngFor="let integration of integrations(); trackBy: trackIntegration" class="rounded-box border border-base-300 bg-base-100 p-4">
                <div class="grid gap-4">
                  <label class="flex items-start justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                    <span class="min-w-0 space-y-1">
                      <strong class="block">{{ integration.displayName }}</strong>
                      <small class="block text-base-content/60">
                        {{ integration.hasCredentials ? 'Credentials configured' : 'No credentials stored' }}
                      </small>
                    </span>
                    <input
                      class="toggle toggle-sm"
                      type="checkbox"
                      [checked]="integration.enabled"
                      (change)="toggleEnabled(integration.code, $any($event.target).checked)"
                    />
                  </label>

                  <label class="form-control">
                    <span class="label"><span class="label-text">Credential mode</span></span>
                    <select
                      class="select select-bordered w-full"
                      [ngModel]="integration.mode"
                      (ngModelChange)="setMode(integration.code, $event)"
                      [ngModelOptions]="{ standalone: true }"
                    >
                      <option value="api-key">API key</option>
                      <option value="provider-login">Provider login</option>
                    </select>
                  </label>

                  <ng-container *ngIf="credentialFields(integration.code).length > 0; else genericSecretField">
                    <label class="form-control" *ngFor="let field of credentialFields(integration.code); trackBy: trackCredentialField">
                      <span class="label"><span class="label-text">{{ field.label }}</span></span>
                      <input
                        class="input input-bordered w-full"
                        [type]="field.secret ? 'password' : 'text'"
                        [ngModel]="credentialValue(integration.code, field.key)"
                        (ngModelChange)="setCredential(integration.code, field.key, $event)"
                        [ngModelOptions]="{ standalone: true }"
                        [placeholder]="credentialPlaceholder(integration, field.key)"
                      />
                    </label>
                  </ng-container>
                  <ng-template #genericSecretField>
                    <label class="form-control">
                      <span class="label"><span class="label-text">{{ integration.mode === 'provider-login' ? 'Provider login reference' : 'API key or secret' }}</span></span>
                      <input
                        class="input input-bordered w-full"
                        [ngModel]="credentialValue(integration.code, 'secret')"
                        (ngModelChange)="setCredential(integration.code, 'secret', $event)"
                        [ngModelOptions]="{ standalone: true }"
                        [placeholder]="credentialPlaceholder(integration, 'secret')"
                      />
                    </label>
                  </ng-template>

                  <p class="text-sm leading-6 text-base-content/60" *ngIf="integration.code === 'smtp'">
                    Use an SMTP connection URI such as
                    <code>smtp://user:pass@mail.example.com:587</code> or a JSON object with
                    <code>host</code>, <code>port</code>, <code>auth</code>, and optional
                    <code>fromAddress</code>.
                  </p>
                  <p class="text-sm leading-6 text-base-content/60" *ngIf="integration.code === 'microsoft-social-auth'">
                    Optional: set a Microsoft tenant ID. Leave blank to use the common tenant.
                  </p>
                </div>
              </article>
            </div>

            <button class="btn btn-neutral mt-4" type="button" (click)="save()">
              Save integration settings
            </button>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-5">
            <div class="mb-4 space-y-1">
              <h2 class="text-xl font-semibold">Email delivery queue</h2>
              <p class="text-sm leading-6 text-base-content/65">
                Verification, reset, and invite emails are queued here until delivery workers process them.
              </p>
            </div>

            <ul class="grid gap-3">
              <li *ngFor="let message of mailOutbox()" class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="grid gap-1">
                  <strong>{{ message.subject }}</strong>
                  <span class="text-sm text-base-content/60">{{ message.recipientEmail }} · {{ message.kind }}</span>
                  <span class="text-sm text-base-content/60">queued {{ message.createdAt }} · expires {{ message.expiresAt }}</span>
                  <span class="text-sm text-base-content/60" *ngIf="message.lastAttemptAt">
                    last attempt {{ message.lastAttemptAt }} · attempts {{ message.attempts }}
                  </span>
                  <span class="text-sm text-base-content/60" *ngIf="message.failedAt && message.failureReason">
                    failed {{ message.failedAt }} · {{ message.failureReason }}
                  </span>
                  <span class="text-sm text-base-content/60" *ngIf="message.deliveredAt">
                    delivered {{ message.deliveredAt }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span class="badge badge-outline">{{ message.status }}</span>
                  <span class="badge badge-outline">{{ message.transport }}</span>
                </div>
              </li>
              <li *ngIf="mailOutbox().length === 0" class="rounded-box border border-dashed border-base-300 px-4 py-6 text-sm text-base-content/55">
                No queued mail messages.
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  `,
})
export class AdminGlobalIntegrationsComponent {
  private readonly setupState = inject(SetupStateService);

  readonly integrations = signal<IntegrationFormState[]>([]);
  readonly mailOutbox = signal<MailOutboxSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly editionLabel = signal<'commercial' | 'community'>('community');

  constructor() {
    void this.load();
  }

  trackIntegration(_index: number, integration: IntegrationFormState) {
    return integration.code;
  }

  trackCredentialField(_index: number, field: { key: string }) {
    return field.key;
  }

  async load() {
    try {
      this.errorMessage.set(null);
      const [snapshot, mailOutbox] = await Promise.all([
        this.setupState.loadAdminIntegrations(),
        this.setupState.loadMailOutbox(),
      ]);
      this.applySnapshot(snapshot);
      this.mailOutbox.set(mailOutbox);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load integration settings.',
      );
    }
  }

  toggleEnabled(code: string, enabled: boolean) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code ? { ...integration, enabled } : integration,
      ),
    );
  }

  setMode(code: string, mode: SetupIntegrationCredentialMode) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code ? { ...integration, mode } : integration,
      ),
    );
  }

  setCredential(code: string, key: string, value: string) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code
          ? {
              ...integration,
              credentials: {
                ...integration.credentials,
                [key]: value,
              },
            }
          : integration,
      ),
    );
  }

  async save() {
    try {
      this.errorMessage.set(null);
      this.message.set(null);
      const payload: SetupBootstrapPayload['integrations'] = this.integrations().map((integration) => {
        return {
          code: integration.code,
          credentials: this.normalizedCredentials(integration),
          enabled: integration.enabled,
          mode: integration.mode,
        };
      });
      const snapshot = await this.setupState.saveAdminIntegrations(payload);
      this.applySnapshot(snapshot);
      this.mailOutbox.set(await this.setupState.loadMailOutbox());
      this.message.set('Integration settings saved.');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to save integration settings.',
      );
    }
  }

  private applySnapshot(snapshot: AdminIntegrationSnapshot) {
    this.editionLabel.set(snapshot.edition);
    const configuredMap = new Map(
      snapshot.configuredIntegrations.map((integration) => [integration.code, integration]),
    );
    this.integrations.set(
      snapshot.providers.map((provider) => ({
        code: provider.code,
        displayName: provider.displayName,
        enabled: configuredMap.get(provider.code)?.enabled ?? false,
        hasCredentials: configuredMap.get(provider.code)?.hasCredentials ?? false,
        mode: configuredMap.get(provider.code)?.mode ?? provider.credentialModes[0] ?? 'api-key',
        credentials: {},
      })),
    );
  }

  credentialFields(code: string) {
    return PROVIDER_CREDENTIAL_FIELDS[code] ?? EMPTY_CREDENTIAL_FIELDS;
  }

  credentialValue(code: string, key: string) {
    return this.integrations().find((integration) => integration.code === code)?.credentials[key] ?? '';
  }

  credentialPlaceholder(integration: IntegrationFormState, key: string) {
    if (integration.code === 'smtp') {
      return integration.hasCredentials
        ? 'Leave blank to keep current SMTP connection URI'
        : 'smtp://user:pass@mail.example.com:587';
    }

    if (integration.hasCredentials) {
      return key === 'tenantId' ? 'Leave blank to keep current value or use common' : 'Leave blank to keep current value';
    }

    return key === 'tenantId' ? 'common' : 'Enter value';
  }

  private normalizedCredentials(integration: IntegrationFormState) {
    return Object.fromEntries(
      Object.entries(integration.credentials)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
  }
}
