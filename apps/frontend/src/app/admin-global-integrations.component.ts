import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
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
  displayName: string;
  enabled: boolean;
  hasCredentials: boolean;
  mode: SetupIntegrationCredentialMode;
  secret: string;
};

@Component({
  selector: 'app-admin-global-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-admin-global-integrations">
      <div class="ui-card stack">
        <p class="ui-kicker">System Administration</p>
        <h1>Global Integrations</h1>
        <p class="ui-copy">
          Manage platform-wide providers and email delivery credentials after setup.
        </p>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>
        <p *ngIf="message()" class="ui-banner ui-banner-info">{{ message() }}</p>

        <div class="grid two">
          <article class="ui-panel stack-tight">
            <h2>Configured providers</h2>
            <p class="ui-copy">Edition: {{ editionLabel() }}</p>

            <article *ngFor="let integration of integrations()" class="ui-panel stack-tight">
              <label class="provider-header">
                <input
                  type="checkbox"
                  [checked]="integration.enabled"
                  (change)="toggleEnabled(integration.code, $any($event.target).checked)"
                />
                <span>
                  <strong>{{ integration.displayName }}</strong>
                  <small>
                    {{ integration.hasCredentials ? 'Credentials configured' : 'No credentials stored' }}
                  </small>
                </span>
              </label>

              <label class="ui-field">
                <span>Credential mode</span>
                <select
                  [ngModel]="integration.mode"
                  (ngModelChange)="setMode(integration.code, $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="api-key">API key</option>
                  <option value="provider-login">Provider login</option>
                </select>
              </label>

              <label class="ui-field">
                <span>{{ integration.mode === 'provider-login' ? 'Provider login reference' : 'API key or secret' }}</span>
                <input
                  [ngModel]="integration.secret"
                  (ngModelChange)="setSecret(integration.code, $event)"
                  [ngModelOptions]="{ standalone: true }"
                  [placeholder]="secretPlaceholder(integration)"
                />
              </label>
              <p class="ui-copy" *ngIf="integration.code === 'smtp'">
                Use an SMTP connection URI such as
                <code>smtp://user:pass@mail.example.com:587</code> or a JSON object with
                <code>host</code>, <code>port</code>, <code>auth</code>, and optional
                <code>fromAddress</code>.
              </p>
            </article>

            <button class="ui-button ui-button-primary" type="button" (click)="save()">
              Save integration settings
            </button>
          </article>

          <article class="ui-panel stack-tight">
            <h2>Email delivery queue</h2>
            <p class="ui-copy">
              Verification, reset, and invite emails are queued here until delivery workers process them.
            </p>
            <ul class="simple-list">
              <li *ngFor="let message of mailOutbox()" class="mail-row">
                <div class="stack-tight">
                  <strong>{{ message.subject }}</strong>
                  <span class="ui-copy">{{ message.recipientEmail }} · {{ message.kind }}</span>
                  <span class="ui-copy">queued {{ message.createdAt }} · expires {{ message.expiresAt }}</span>
                  <span class="ui-copy" *ngIf="message.lastAttemptAt">
                    last attempt {{ message.lastAttemptAt }} · attempts {{ message.attempts }}
                  </span>
                  <span class="ui-copy" *ngIf="message.failedAt && message.failureReason">
                    failed {{ message.failedAt }} · {{ message.failureReason }}
                  </span>
                  <span class="ui-copy" *ngIf="message.deliveredAt">
                    delivered {{ message.deliveredAt }}
                  </span>
                </div>
                <div class="stack-tight">
                  <span class="ui-chip">{{ message.status }}</span>
                  <span class="ui-chip">{{ message.transport }}</span>
                </div>
              </li>
              <li *ngIf="mailOutbox().length === 0" class="ui-copy">No queued mail messages.</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .stack,
      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
      }

      .grid.two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-4);
      }

      .provider-header,
      .mail-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: var(--spacing-3);
      }

      .ui-copy,
      .provider-header small {
        color: var(--text-secondary);
      }

      @media (max-width: 900px) {
        .grid.two {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminGlobalIntegrationsComponent {
  private readonly setupState = inject(SetupStateService);

  readonly integrations = signal<IntegrationFormState[]>([]);
  readonly mailOutbox = signal<MailOutboxSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly editionLabel = signal<'commercial' | 'community'>('community');

  constructor() {
    effect(() => {
      void this.load();
    });
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
      current.map((integration) => (integration.code === code ? { ...integration, enabled } : integration)),
    );
  }

  setMode(code: string, mode: SetupIntegrationCredentialMode) {
    this.integrations.update((current) =>
      current.map((integration) => (integration.code === code ? { ...integration, mode } : integration)),
    );
  }

  setSecret(code: string, secret: string) {
    this.integrations.update((current) =>
      current.map((integration) => (integration.code === code ? { ...integration, secret } : integration)),
    );
  }

  async save() {
    try {
      this.errorMessage.set(null);
      this.message.set(null);
      const payload: SetupBootstrapPayload['integrations'] = this.integrations().map((integration) => {
        const credentials: Record<string, string> = integration.secret.trim()
          ? { secret: integration.secret.trim() }
          : {};
        return {
          code: integration.code,
          credentials,
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
    const configuredMap = new Map(snapshot.configuredIntegrations.map((integration) => [integration.code, integration]));
    this.integrations.set(
      snapshot.providers.map((provider) => ({
        code: provider.code,
        displayName: provider.displayName,
        enabled: configuredMap.get(provider.code)?.enabled ?? false,
        hasCredentials: configuredMap.get(provider.code)?.hasCredentials ?? false,
        mode: configuredMap.get(provider.code)?.mode ?? provider.credentialModes[0] ?? 'api-key',
        secret: '',
      })),
    );
  }

  secretPlaceholder(integration: IntegrationFormState) {
    if (integration.code === 'smtp') {
      return integration.hasCredentials
        ? 'Leave blank to keep current SMTP connection URI'
        : 'smtp://user:pass@mail.example.com:587';
    }

    return integration.hasCredentials ? 'Leave blank to keep current secret' : 'Enter secret';
  }
}
