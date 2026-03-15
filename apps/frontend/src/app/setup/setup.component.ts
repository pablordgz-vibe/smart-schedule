import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SetupStateService } from './setup-state.service';
import type {
  SetupBootstrapPayload,
  SetupIntegrationCredentialMode,
  SetupStateSnapshot,
} from './setup.types';

type SmtpConfigStyle = 'connection-uri' | 'smtp-details';
type SmtpPresetId = 'custom' | 'gmail' | 'amazon-ses' | 'sendgrid';

type IntegrationSelection = {
  credentials: Record<string, string>;
  enabled: boolean;
  mode: SetupIntegrationCredentialMode;
  smtpConfig: SmtpConfigState | null;
};

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

const EMPTY_SMTP_CONFIG: Readonly<SmtpConfigState> = Object.freeze({
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
});

@Component({
  standalone: true,
  selector: 'app-setup',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="setup-shell" data-testid="setup-wizard">
      <header class="hero">
        <p class="eyebrow">First-run setup</p>
        <h1>Initialize this SmartSchedule deployment</h1>
        <p class="lede">
          Regular application routes stay locked until integrations are reviewed and the first
          system administrator is created.
        </p>
      </header>

      <section class="alert alert-error mx-auto mb-6 max-w-5xl" *ngIf="loadError()">
        <h2>Setup service unavailable</h2>
        <p>{{ loadError() }}</p>
        <div class="flex flex-wrap gap-3">
          <button class="btn btn-outline" type="button" (click)="retryLoad()">
            Retry bootstrap status
          </button>
        </div>
      </section>

      <div class="wizard-grid">
        <aside class="steps-card">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
            Progress
          </p>
          <ol class="setup-steps">
            <li [class.active]="step() === 0">1. Integrations</li>
            <li [class.active]="step() === 1">2. First admin</li>
            <li [class.active]="step() === 2">3. Review</li>
            <li [class.active]="step() === 3">4. Complete</li>
          </ol>
          <div class="setup-meta">
            <p class="edition-copy" data-testid="setup-edition">
              Edition: <strong>{{ editionLabel() }}</strong>
            </p>
            <p class="support-copy">
              Community allows provider-login setup where supported. Commercial is restricted to
              API-key setup.
            </p>
          </div>
        </aside>

        <form class="wizard-card space-y-6" (ngSubmit)="submitCurrentStep()">
          <ng-container [ngSwitch]="step()">
            <section *ngSwitchCase="0" class="wizard-section">
              <div class="section-heading">
                <h2>Enable integrations</h2>
                <p>
                  Choose which providers are active at launch and how their credentials are stored.
                </p>
              </div>

              <article
                *ngFor="let provider of providers(); trackBy: trackProvider"
                class="provider-card"
                [attr.data-testid]="'provider-' + provider.code"
              >
                <label class="provider-header">
                  <input
                    type="checkbox"
                    [checked]="isEnabled(provider.code)"
                    (change)="toggleProvider(provider.code, $any($event.target).checked)"
                  />
                  <span>
                    <strong>{{ provider.displayName }}</strong>
                    <small>{{ provider.description }}</small>
                  </span>
                </label>

                <div class="provider-fields" *ngIf="isEnabled(provider.code)">
                  <label class="ui-field">
                    <span>Credential mode</span>
                    <select
                      class="select select-bordered w-full"
                      [ngModel]="modeFor(provider.code)"
                      (ngModelChange)="setMode(provider.code, $event)"
                      [ngModelOptions]="{ standalone: true }"
                    >
                      <option
                        *ngFor="let mode of provider.credentialModes; trackBy: trackMode"
                        [value]="mode"
                      >
                        {{ modeLabel(mode) }}
                      </option>
                    </select>
                  </label>

                  <label class="ui-field">
                    <ng-container
                      *ngIf="
                        provider.code === 'smtp' && smtpConfigFor(provider.code) as smtpConfig;
                        else genericSecretField
                      "
                    >
                      <span>SMTP setup style</span>
                      <select
                        class="select select-bordered w-full"
                        [ngModel]="smtpConfig.style"
                        (ngModelChange)="setSmtpStyle(provider.code, $event)"
                        [ngModelOptions]="{ standalone: true }"
                      >
                        <option value="connection-uri">Connection URI</option>
                        <option value="smtp-details">SMTP account details</option>
                      </select>
                    </ng-container>
                    <ng-template #genericSecretField>
                      <ng-container
                        *ngIf="credentialFields(provider.code).length > 0; else singleSecretField"
                      >
                        <label
                          class="ui-field"
                          *ngFor="
                            let field of credentialFields(provider.code);
                            trackBy: trackCredentialField
                          "
                        >
                          <span>{{ field.label }}</span>
                          <input
                            class="input input-bordered w-full"
                            [type]="field.secret ? 'password' : 'text'"
                            [ngModel]="credentialValue(provider.code, field.key)"
                            (ngModelChange)="setCredential(provider.code, field.key, $event)"
                            [ngModelOptions]="{ standalone: true }"
                            [placeholder]="credentialPlaceholder(provider.code, field.key)"
                          />
                        </label>
                      </ng-container>
                      <ng-template #singleSecretField>
                        <span>{{ secretFieldLabel(modeFor(provider.code)) }}</span>
                        <input
                          class="input input-bordered w-full"
                          [ngModel]="secretFor(provider.code)"
                          (ngModelChange)="setSecret(provider.code, $event)"
                          [ngModelOptions]="{ standalone: true }"
                          [placeholder]="secretPlaceholder(modeFor(provider.code))"
                        />
                      </ng-template>
                    </ng-template>
                  </label>

                  <ng-container
                    *ngIf="provider.code === 'smtp' && smtpConfigFor(provider.code) as smtpConfig"
                  >
                    <div class="smtp-config-panel" *ngIf="smtpConfig.style === 'connection-uri'">
                      <label class="ui-field">
                        <span>SMTP connection URI</span>
                        <input
                          class="input input-bordered w-full"
                          [ngModel]="smtpConfig.uri"
                          (ngModelChange)="setSmtpField(provider.code, 'uri', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          [placeholder]="smtpUriPlaceholder()"
                        />
                      </label>
                    </div>

                    <div class="smtp-config-panel" *ngIf="smtpConfig.style === 'smtp-details'">
                      <label class="ui-field">
                        <span>Email provider preset</span>
                        <select
                          class="select select-bordered w-full"
                          [ngModel]="smtpConfig.preset"
                          (ngModelChange)="applySmtpPreset(provider.code, $event)"
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
                          class="input input-bordered w-full"
                          [ngModel]="smtpConfig.host"
                          (ngModelChange)="setSmtpField(provider.code, 'host', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="smtp.gmail.com"
                        />
                      </label>

                      <label class="ui-field">
                        <span>Port</span>
                        <input
                          class="input input-bordered w-full"
                          [ngModel]="smtpConfig.port"
                          (ngModelChange)="setSmtpField(provider.code, 'port', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          inputmode="numeric"
                          placeholder="587"
                        />
                      </label>

                      <label class="ui-field">
                        <span>Username</span>
                        <input
                          class="input input-bordered w-full"
                          [ngModel]="smtpConfig.username"
                          (ngModelChange)="setSmtpField(provider.code, 'username', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="your-email@gmail.com"
                        />
                      </label>

                      <label class="ui-field">
                        <span>Password or app password</span>
                        <div class="smtp-password-row">
                          <input
                            class="input input-bordered w-full"
                            [ngModel]="smtpConfig.password"
                            (ngModelChange)="setSmtpField(provider.code, 'password', $event)"
                            [ngModelOptions]="{ standalone: true }"
                            [type]="smtpConfig.revealPassword ? 'text' : 'password'"
                            placeholder="Enter SMTP password"
                          />
                          <button
                            class="btn btn-outline"
                            type="button"
                            (click)="toggleSmtpPasswordVisibility(provider.code)"
                          >
                            {{ smtpConfig.revealPassword ? 'Hide' : 'Show' }}
                          </button>
                        </div>
                      </label>

                      <label class="ui-field">
                        <span>From address</span>
                        <input
                          class="input input-bordered w-full"
                          [ngModel]="smtpConfig.fromAddress"
                          (ngModelChange)="setSmtpField(provider.code, 'fromAddress', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="your-email@gmail.com"
                        />
                      </label>

                      <label class="provider-header smtp-checkbox">
                        <span>
                          <strong>Use secure SMTP</strong>
                          <small
                            >Turn this on for providers that require SSL/TLS on connect, such as
                            port 465.</small
                          >
                        </span>
                        <input
                          type="checkbox"
                          [checked]="smtpConfig.secure"
                          (change)="setSmtpSecure(provider.code, $any($event.target).checked)"
                        />
                      </label>
                    </div>
                  </ng-container>
                  <p class="field-hint" *ngIf="provider.code === 'microsoft-social-auth'">
                    Tenant ID is optional. Leave it blank to use the common Microsoft tenant.
                  </p>
                </div>
              </article>
            </section>

            <section *ngSwitchCase="1" class="wizard-section">
              <div class="section-heading">
                <h2>Create the first system admin</h2>
                <p>
                  This account becomes the initial deployment administrator and completes bootstrap.
                </p>
              </div>

              <label class="ui-field">
                <span>Full name</span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="admin.name"
                  name="name"
                  required
                  minlength="2"
                />
              </label>

              <label class="ui-field">
                <span>Email</span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="admin.email"
                  name="email"
                  type="email"
                  required
                />
              </label>

              <label class="ui-field">
                <span>Password</span>
                <div class="smtp-password-row">
                  <input
                    class="input input-bordered w-full"
                    [(ngModel)]="admin.password"
                    name="password"
                    [type]="revealAdminPassword ? 'text' : 'password'"
                    required
                    minlength="12"
                  />
                  <button
                    class="btn btn-outline"
                    type="button"
                    (click)="revealAdminPassword = !revealAdminPassword"
                  >
                    {{ revealAdminPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
                <span class="field-hint"
                  >Use at least 12 characters. A longer passphrase works best.</span
                >
              </label>
            </section>

            <section *ngSwitchCase="2" class="wizard-section">
              <div class="section-heading">
                <h2>Review and finish</h2>
                <p>
                  Confirm the integration plan and bootstrap account before locking setup
                  permanently.
                </p>
              </div>

              <div class="summary-card">
                <h3>First admin</h3>
                <p>{{ admin.name || 'Not provided' }}</p>
                <p>{{ admin.email || 'Not provided' }}</p>
              </div>

              <div class="summary-card">
                <h3>Enabled integrations</h3>
                <p *ngIf="selectedProviders().length === 0">
                  No integrations enabled at bootstrap.
                </p>
                <ul *ngIf="selectedProviders().length > 0">
                  <li *ngFor="let provider of selectedProviders()">
                    {{ provider.displayName }} via {{ modeLabel(modeFor(provider.code)) }}
                  </li>
                </ul>
              </div>
            </section>

            <section *ngSwitchCase="3" class="wizard-section">
              <div class="section-heading">
                <h2>Setup complete</h2>
                <p>
                  Bootstrap is now permanently locked. Review this completion summary before opening
                  the main workspace.
                </p>
              </div>

              <div class="summary-card">
                <h3>Deployment summary</h3>
                <p>Edition: {{ editionLabel() }}</p>
                <p>Completed at: {{ completedState()?.completedAt || 'Unavailable' }}</p>
                <p>Setup routes are now locked for this deployment.</p>
              </div>

              <div class="summary-card">
                <h3>Initial admin</h3>
                <p>{{ admin.name }}</p>
                <p>{{ admin.email }}</p>
              </div>

              <div class="summary-card">
                <h3>Enabled integrations</h3>
                <p *ngIf="selectedProviders().length === 0">
                  No integrations were enabled during bootstrap.
                </p>
                <ul *ngIf="selectedProviders().length > 0">
                  <li *ngFor="let provider of selectedProviders()">
                    {{ provider.displayName }} via {{ modeLabel(modeFor(provider.code)) }}
                  </li>
                </ul>
              </div>
            </section>
          </ng-container>

          <p class="alert alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <footer class="wizard-actions">
            <button
              *ngIf="step() > 0 && step() < 3"
              class="btn btn-outline"
              type="button"
              (click)="previousStep()"
            >
              Back
            </button>
            <button
              class="btn btn-neutral"
              type="submit"
              data-testid="setup-submit"
              [disabled]="loadError() !== null"
            >
              {{ step() === 3 ? 'Open workspace' : step() === 2 ? 'Complete setup' : 'Continue' }}
            </button>
          </footer>
        </form>
      </div>
    </section>
  `,
  styles: [
    `
      .setup-shell {
        min-height: 100vh;
        padding: clamp(1.5rem, 4vw, 3rem);
        background: var(--bg-app);
      }

      .hero {
        max-width: 72rem;
        margin: 0 auto var(--spacing-8);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
        padding-left: calc(18rem + var(--spacing-6));
      }

      .eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: var(--font-size-xs);
        font-weight: 800;
        color: var(--color-accent-600);
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(1.9rem, 3vw, 2.6rem);
        line-height: 1.25;
        letter-spacing: -0.03em;
        max-width: 22ch;
      }

      .lede {
        margin: 0;
        max-width: 38rem;
        color: var(--text-secondary);
        font-size: 1rem;
        line-height: 1.6;
      }

      .wizard-grid {
        max-width: 72rem;
        margin: 0 auto;
        display: grid;
        grid-template-columns: 18rem minmax(0, 1fr);
        gap: var(--spacing-6);
      }

      .steps-card,
      .wizard-card {
        padding: var(--spacing-6);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        background: var(--bg-surface);
        box-shadow: var(--shadow-sm);
      }

      .steps-card {
        display: grid;
        gap: var(--spacing-4);
        align-content: start;
      }

      .setup-steps {
        display: grid;
        gap: var(--spacing-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .setup-meta {
        display: grid;
        gap: var(--spacing-3);
        margin-top: var(--spacing-3);
      }

      .setup-steps li {
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        color: var(--text-secondary);
      }

      .setup-steps li.active {
        background: var(--color-neutral-100);
        color: var(--text-primary);
        font-weight: 700;
      }

      .edition-copy,
      .support-copy,
      .field-hint {
        color: var(--text-secondary);
      }

      .field-hint {
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .wizard-card {
        display: grid;
        gap: var(--spacing-5);
      }

      .wizard-section {
        display: grid;
        gap: var(--spacing-5);
      }

      .section-heading {
        display: grid;
        gap: var(--spacing-2);
      }

      .section-heading h2,
      .section-heading p,
      .summary-card h3,
      .summary-card p {
        margin: 0;
      }

      .section-heading p,
      .summary-card p {
        max-width: 56ch;
        line-height: 1.65;
        color: var(--text-secondary);
      }

      .provider-card,
      .summary-card {
        padding: var(--spacing-4);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--color-neutral-50);
      }

      .provider-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: var(--spacing-3);
      }

      .provider-header strong,
      .provider-header small {
        display: block;
      }

      .provider-header small {
        margin-top: 0.25rem;
        line-height: 1.5;
        color: var(--text-secondary);
      }

      .provider-fields {
        display: grid;
        gap: var(--spacing-3);
        margin-top: var(--spacing-4);
      }

      .smtp-config-panel {
        display: grid;
        gap: var(--spacing-3);
        padding: var(--spacing-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-surface);
      }

      .smtp-checkbox {
        justify-content: space-between;
        align-items: center;
      }

      .smtp-password-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--spacing-2);
        align-items: center;
      }

      .wizard-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--spacing-3);
        margin-top: var(--spacing-2);
        padding-top: var(--spacing-4);
        border-top: 1px solid var(--border-default);
      }

      @media (max-width: 900px) {
        .hero {
          padding-left: 0;
        }

        .wizard-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class SetupComponent {
  private readonly router = inject(Router);
  private readonly setupState = inject(SetupStateService);

  protected readonly providers = this.setupState.integrationProviders;
  protected readonly completedState = signal<SetupStateSnapshot | null>(null);
  protected readonly step = signal(0);
  protected readonly errorMessage = signal('');
  protected readonly loadError = this.setupState.loadError;
  protected readonly editionLabel = computed(() =>
    this.setupState.edition() === 'community' ? 'Community' : 'Commercial',
  );
  protected readonly selectedProviders = computed(() =>
    this.providers().filter((provider) => this.isEnabled(provider.code)),
  );

  protected readonly admin = {
    email: '',
    name: '',
    password: '',
  };
  protected revealAdminPassword = false;

  private readonly selections = signal<Record<string, IntegrationSelection>>({});

  protected trackProvider(_index: number, provider: { code: string }) {
    return provider.code;
  }

  protected trackMode(_index: number, mode: string) {
    return mode;
  }

  protected trackCredentialField(_index: number, field: { key: string }) {
    return field.key;
  }

  protected isEnabled(code: string): boolean {
    return this.selections()[code]?.enabled ?? false;
  }

  protected modeFor(code: string): SetupIntegrationCredentialMode {
    return this.selections()[code]?.mode ?? this.defaultMode(code);
  }

  protected secretFor(code: string): string {
    return this.selections()[code]?.credentials['secret'] ?? '';
  }

  protected credentialValue(code: string, key: string): string {
    return this.selections()[code]?.credentials[key] ?? '';
  }

  protected toggleProvider(code: string, enabled: boolean) {
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled,
      mode: this.modeFor(code),
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected setMode(code: string, mode: SetupIntegrationCredentialMode) {
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode,
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected setSecret(code: string, secret: string) {
    this.updateSelection(code, {
      credentials: {
        ...this.credentialsFor(code),
        secret,
      },
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected setCredential(code: string, key: string, value: string) {
    this.updateSelection(code, {
      credentials: {
        ...this.credentialsFor(code),
        [key]: value,
      },
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected smtpConfigFor(code: string): SmtpConfigState | null {
    return this.selections()[code]?.smtpConfig ?? (code === 'smtp' ? EMPTY_SMTP_CONFIG : null);
  }

  protected setSmtpStyle(code: string, style: SmtpConfigStyle) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: { ...smtpConfig, style },
    });
  }

  protected setSmtpField(
    code: string,
    field: 'fromAddress' | 'host' | 'password' | 'port' | 'uri' | 'username',
    value: string,
  ) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: { ...smtpConfig, [field]: value },
    });
  }

  protected setSmtpSecure(code: string, secure: boolean) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: { ...smtpConfig, secure },
    });
  }

  protected applySmtpPreset(code: string, preset: SmtpPresetId) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: {
        ...smtpConfig,
        preset,
        ...(preset === 'custom' ? {} : smtpPresetConfig(preset)),
      },
    });
  }

  protected toggleSmtpPasswordVisibility(code: string) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      credentials: this.credentialsFor(code),
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      smtpConfig: { ...smtpConfig, revealPassword: !smtpConfig.revealPassword },
    });
  }

  protected credentialFields(code: string) {
    return PROVIDER_CREDENTIAL_FIELDS[code] ?? EMPTY_CREDENTIAL_FIELDS;
  }

  protected credentialPlaceholder(code: string, key: string) {
    if (key === 'tenantId') {
      return 'common';
    }
    return code === 'github-social-auth'
      ? 'Paste the GitHub OAuth value'
      : 'Paste the provider value';
  }

  protected secretFieldLabel(mode: SetupIntegrationCredentialMode): string {
    return mode === 'provider-login' ? 'Provider login reference' : 'API key or secret';
  }

  protected secretPlaceholder(mode: SetupIntegrationCredentialMode): string {
    return mode === 'provider-login'
      ? 'Stored provider-login reference'
      : 'Paste the integration secret';
  }

  protected smtpUriPlaceholder(): string {
    return 'smtp://user:pass@mail.example.com:587';
  }

  protected modeLabel(mode: SetupIntegrationCredentialMode): string {
    return mode === 'provider-login' ? 'Provider login' : 'API key';
  }

  protected previousStep() {
    this.errorMessage.set('');
    this.step.update((current) => Math.max(0, current - 1));
  }

  protected async submitCurrentStep() {
    if (this.loadError()) {
      return;
    }

    this.errorMessage.set('');

    if (this.step() === 3) {
      await this.router.navigateByUrl('/auth/sign-in');
      return;
    }

    if (this.step() === 0) {
      const invalidSelection = this.selectedProviders().some(
        (provider) => !this.hasRequiredCredentials(provider.code),
      );
      if (invalidSelection) {
        this.errorMessage.set(
          'Each enabled integration must include a credential value before continuing.',
        );
        return;
      }

      this.step.set(1);
      return;
    }

    if (this.step() === 1) {
      if (this.admin.name.trim().length < 2) {
        this.errorMessage.set('Enter an admin name with at least 2 characters.');
        return;
      }

      if (!this.admin.email.includes('@')) {
        this.errorMessage.set('Enter a valid admin email address before continuing.');
        return;
      }

      if (this.admin.password.trim().length < 12) {
        this.errorMessage.set('Use an admin password with at least 12 characters.');
        return;
      }

      this.step.set(2);
      return;
    }

    const payload: SetupBootstrapPayload = {
      admin: {
        email: this.admin.email.trim(),
        name: this.admin.name.trim(),
        password: this.admin.password,
      },
      integrations: this.providers().map((provider) => ({
        code: provider.code,
        credentials: this.isEnabled(provider.code)
          ? this.serializedCredentialsFor(provider.code)
          : ({} as Record<string, string>),
        enabled: this.isEnabled(provider.code),
        mode: this.modeFor(provider.code),
      })),
    };

    try {
      const completedState = await this.setupState.completeSetup(payload);
      this.completedState.set(completedState);
      this.step.set(3);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Setup completion failed.');
    }
  }

  protected async retryLoad() {
    await this.setupState.load();
  }

  private defaultMode(code: string): SetupIntegrationCredentialMode {
    return (
      this.providers().find((provider) => provider.code === code)?.credentialModes[0] ?? 'api-key'
    );
  }

  private updateSelection(code: string, nextValue: IntegrationSelection) {
    this.selections.update((current) => ({
      ...current,
      [code]: nextValue,
    }));
  }

  private credentialsFor(code: string) {
    return this.selections()[code]?.credentials ?? {};
  }

  private hasRequiredCredentials(code: string) {
    const serialized = this.serializedCredentialsFor(code);
    const fields = this.credentialFields(code);
    if (fields.length === 0) {
      return Object.keys(serialized).length > 0;
    }

    return fields
      .filter((field) => field.key !== 'tenantId')
      .every((field) => (serialized[field.key] ?? '').trim().length > 0);
  }

  private serializedCredentialsFor(code: string): Record<string, string> {
    const selection = this.selections()[code];
    if (!selection) {
      return {};
    }

    if (code !== 'smtp' || !selection.smtpConfig) {
      const entries = Object.entries(selection.credentials)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value.length > 0);
      return Object.fromEntries(entries);
    }

    if (selection.smtpConfig.style === 'connection-uri') {
      return selection.smtpConfig.uri.trim() ? { secret: selection.smtpConfig.uri.trim() } : {};
    }

    const host = selection.smtpConfig.host.trim();
    const port = selection.smtpConfig.port.trim();
    const username = selection.smtpConfig.username.trim();
    const password = selection.smtpConfig.password.trim();
    const fromAddress = selection.smtpConfig.fromAddress.trim();

    if (!host && !port && !username && !password && !fromAddress && !selection.smtpConfig.secure) {
      return {};
    }

    return {
      secret: JSON.stringify({
        auth: username || password ? { pass: password, user: username } : undefined,
        fromAddress: fromAddress || undefined,
        host,
        port: port ? Number(port) : undefined,
        secure: selection.smtpConfig.secure,
      }),
    };
  }
}

function smtpPresetConfig(preset: SmtpPresetId): Pick<SmtpConfigState, 'host' | 'port' | 'secure'> {
  switch (preset) {
    case 'gmail':
      return { host: 'smtp.gmail.com', port: '587', secure: false };
    case 'amazon-ses':
      return { host: 'email-smtp.us-east-1.amazonaws.com', port: '587', secure: false };
    case 'sendgrid':
      return { host: 'smtp.sendgrid.net', port: '587', secure: false };
    case 'custom':
    default:
      return { host: '', port: '', secure: false };
  }
}
