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
  smtpConfig: SmtpConfigState | null;
};

type SmtpConfigStyle = 'connection-uri' | 'smtp-details';

type SmtpPresetId = 'custom' | 'gmail' | 'amazon-ses' | 'sendgrid';

type SmtpConfigState = {
  fromAddress: string;
  host: string;
  password: string;
  port: string;
  preset: SmtpPresetId;
  revealPassword: boolean;
  secure: boolean;
  style: SmtpConfigStyle;
  uri: string;
  username: string;
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
                <ng-container *ngIf="integration.code === 'smtp' && integration.smtpConfig as smtpConfig; else genericSecretField">
                  <span>SMTP setup style</span>
                  <select
                    [ngModel]="smtpConfig.style"
                    (ngModelChange)="setSmtpStyle(integration.code, $event)"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    <option value="connection-uri">Connection URI</option>
                    <option value="smtp-details">SMTP account details</option>
                  </select>
                </ng-container>
                <ng-template #genericSecretField>
                  <span>{{ integration.mode === 'provider-login' ? 'Provider login reference' : 'API key or secret' }}</span>
                  <input
                    [ngModel]="integration.secret"
                    (ngModelChange)="setSecret(integration.code, $event)"
                    [ngModelOptions]="{ standalone: true }"
                    [placeholder]="secretPlaceholder(integration)"
                  />
                </ng-template>
              </label>

              <ng-container *ngIf="integration.code === 'smtp' && integration.smtpConfig as smtpConfig">
                <div class="stack-tight smtp-config-panel" *ngIf="smtpConfig.style === 'connection-uri'">
                  <label class="ui-field">
                    <span>SMTP connection URI</span>
                    <input
                      [ngModel]="smtpConfig.uri"
                      (ngModelChange)="setSmtpField(integration.code, 'uri', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      [placeholder]="smtpUriPlaceholder(integration)"
                    />
                  </label>
                  <p class="ui-copy">
                    Paste a full SMTP URI such as
                    <code>smtp://user:pass@mail.example.com:587</code>.
                  </p>
                </div>

                <div class="stack-tight smtp-config-panel" *ngIf="smtpConfig.style === 'smtp-details'">
                  <label class="ui-field">
                    <span>Email provider preset</span>
                    <select
                      [ngModel]="smtpConfig.preset"
                      (ngModelChange)="applySmtpPreset(integration.code, $event)"
                      [ngModelOptions]="{ standalone: true }"
                    >
                      <option value="custom">Custom SMTP</option>
                      <option value="gmail">Gmail</option>
                      <option value="amazon-ses">Amazon SES</option>
                      <option value="sendgrid">SendGrid SMTP</option>
                    </select>
                  </label>

                  <label class="ui-field">
                    <span>SMTP host</span>
                    <input
                      [ngModel]="smtpConfig.host"
                      (ngModelChange)="setSmtpField(integration.code, 'host', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      placeholder="smtp.gmail.com"
                    />
                  </label>

                  <label class="ui-field">
                    <span>Port</span>
                    <input
                      [ngModel]="smtpConfig.port"
                      (ngModelChange)="setSmtpField(integration.code, 'port', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      inputmode="numeric"
                      placeholder="587"
                    />
                  </label>

                  <label class="ui-field">
                    <span>Username</span>
                    <input
                      [ngModel]="smtpConfig.username"
                      (ngModelChange)="setSmtpField(integration.code, 'username', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      placeholder="your-email@gmail.com"
                    />
                  </label>

                  <label class="ui-field">
                    <span>Password or app password</span>
                    <div class="smtp-password-row">
                      <input
                        [ngModel]="smtpConfig.password"
                        (ngModelChange)="setSmtpField(integration.code, 'password', $event)"
                        [ngModelOptions]="{ standalone: true }"
                        [type]="smtpConfig.revealPassword ? 'text' : 'password'"
                        placeholder="Enter SMTP password"
                      />
                      <button
                        class="ui-button ui-button-secondary"
                        type="button"
                        (click)="toggleSmtpPasswordVisibility(integration.code)"
                      >
                        {{ smtpConfig.revealPassword ? 'Hide' : 'Show' }}
                      </button>
                    </div>
                  </label>

                  <label class="ui-field">
                    <span>From address</span>
                    <input
                      [ngModel]="smtpConfig.fromAddress"
                      (ngModelChange)="setSmtpField(integration.code, 'fromAddress', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      placeholder="your-email@gmail.com"
                    />
                  </label>

                  <label class="provider-header smtp-checkbox">
                    <span>
                      <strong>Use secure SMTP</strong>
                      <small>Turn this on for providers that require SSL/TLS on connect, such as port 465.</small>
                    </span>
                    <input
                      type="checkbox"
                      [checked]="smtpConfig.secure"
                      (change)="setSmtpSecure(integration.code, $any($event.target).checked)"
                    />
                  </label>
                </div>
              </ng-container>
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

      .smtp-config-panel {
        padding: var(--spacing-3);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface-2) 70%, transparent);
      }

      .smtp-checkbox {
        align-items: center;
      }

      .smtp-password-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--spacing-2);
        align-items: center;
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

  setSmtpStyle(code: string, style: SmtpConfigStyle) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code && integration.smtpConfig
          ? {
              ...integration,
              smtpConfig: {
                ...integration.smtpConfig,
                style,
              },
            }
          : integration,
      ),
    );
  }

  setSmtpField(
    code: string,
    field: 'fromAddress' | 'host' | 'password' | 'port' | 'uri' | 'username',
    value: string,
  ) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code && integration.smtpConfig
          ? {
              ...integration,
              smtpConfig: {
                ...integration.smtpConfig,
                [field]: value,
              },
            }
          : integration,
      ),
    );
  }

  setSmtpSecure(code: string, secure: boolean) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code && integration.smtpConfig
          ? {
              ...integration,
              smtpConfig: {
                ...integration.smtpConfig,
                secure,
              },
            }
          : integration,
      ),
    );
  }

  applySmtpPreset(code: string, preset: SmtpPresetId) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code && integration.smtpConfig
          ? {
              ...integration,
              smtpConfig: {
                ...integration.smtpConfig,
                preset,
                ...(preset === 'custom' ? {} : smtpPresetConfig(preset)),
              },
            }
          : integration,
      ),
    );
  }

  toggleSmtpPasswordVisibility(code: string) {
    this.integrations.update((current) =>
      current.map((integration) =>
        integration.code === code && integration.smtpConfig
          ? {
              ...integration,
              smtpConfig: {
                ...integration.smtpConfig,
                revealPassword: !integration.smtpConfig.revealPassword,
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
        const secret = this.serializeSecret(integration);
        const credentials: Record<string, string> = secret ? { secret } : {};
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
        smtpConfig: provider.code === 'smtp' ? createEmptySmtpConfig() : null,
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

  smtpUriPlaceholder(integration: IntegrationFormState) {
    return integration.hasCredentials
      ? 'Leave blank to keep the current SMTP connection URI'
      : 'smtp://user:pass@mail.example.com:587';
  }

  private serializeSecret(integration: IntegrationFormState) {
    if (integration.code !== 'smtp' || !integration.smtpConfig) {
      return integration.secret.trim();
    }

    if (integration.smtpConfig.style === 'connection-uri') {
      return integration.smtpConfig.uri.trim();
    }

    const host = integration.smtpConfig.host.trim();
    const port = integration.smtpConfig.port.trim();
    const username = integration.smtpConfig.username.trim();
    const password = integration.smtpConfig.password.trim();
    const fromAddress = integration.smtpConfig.fromAddress.trim();

    if (!host && !port && !username && !password && !fromAddress && !integration.smtpConfig.secure) {
      return '';
    }

    return JSON.stringify({
      auth: username || password ? { pass: password, user: username } : undefined,
      fromAddress: fromAddress || undefined,
      host,
      port: port ? Number(port) : undefined,
      secure: integration.smtpConfig.secure,
    });
  }
}

function createEmptySmtpConfig(): SmtpConfigState {
  return {
    fromAddress: '',
    host: '',
    password: '',
    port: '',
    preset: 'custom',
    revealPassword: false,
    secure: false,
    style: 'connection-uri',
    uri: '',
    username: '',
  };
}

function smtpPresetConfig(
  preset: SmtpPresetId,
): Pick<SmtpConfigState, 'host' | 'port' | 'secure'> {
  switch (preset) {
    case 'gmail':
      return {
        host: 'smtp.gmail.com',
        port: '587',
        secure: false,
      };
    case 'amazon-ses':
      return {
        host: 'email-smtp.us-east-1.amazonaws.com',
        port: '587',
        secure: false,
      };
    case 'sendgrid':
      return {
        host: 'smtp.sendgrid.net',
        port: '587',
        secure: false,
      };
    case 'custom':
    default:
      return {
        host: '',
        port: '',
        secure: false,
      };
  }
}
