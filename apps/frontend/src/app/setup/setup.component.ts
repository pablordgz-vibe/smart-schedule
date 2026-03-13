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
  enabled: boolean;
  mode: SetupIntegrationCredentialMode;
  secret: string;
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

      <section class="ui-banner ui-banner-denied mx-auto mb-6 max-w-5xl" *ngIf="loadError()">
        <h2>Setup service unavailable</h2>
        <p>{{ loadError() }}</p>
        <div class="flex flex-wrap gap-3">
          <button class="ui-button ui-button-secondary" type="button" (click)="retryLoad()">
            Retry bootstrap status
          </button>
        </div>
      </section>

      <div class="wizard-grid">
        <aside class="steps-card">
          <p class="ui-kicker">Progress</p>
          <ol class="steps">
            <li [class.active]="step() === 0">1. Integrations</li>
            <li [class.active]="step() === 1">2. First admin</li>
            <li [class.active]="step() === 2">3. Review</li>
            <li [class.active]="step() === 3">4. Complete</li>
          </ol>
          <p class="edition-copy" data-testid="setup-edition">
            Edition: <strong>{{ editionLabel() }}</strong>
          </p>
          <p class="support-copy">
            Community allows provider-login setup where supported. Commercial is restricted to
            API-key setup.
          </p>
        </aside>

        <form class="wizard-card" (ngSubmit)="submitCurrentStep()">
          <ng-container [ngSwitch]="step()">
            <section *ngSwitchCase="0">
              <div class="section-heading">
                <h2>Enable integrations</h2>
                <p>
                  Choose which providers are active at launch and how their credentials are stored.
                </p>
              </div>

              <article
                *ngFor="let provider of providers()"
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
                      class="ui-select"
                      [ngModel]="modeFor(provider.code)"
                      (ngModelChange)="setMode(provider.code, $event)"
                      [ngModelOptions]="{ standalone: true }"
                    >
                      <option *ngFor="let mode of provider.credentialModes" [value]="mode">
                        {{ modeLabel(mode) }}
                      </option>
                    </select>
                  </label>

                  <label class="ui-field">
                    <ng-container *ngIf="provider.code === 'smtp' && smtpConfigFor(provider.code) as smtpConfig; else genericSecretField">
                      <span>SMTP setup style</span>
                      <select
                        class="ui-select"
                        [ngModel]="smtpConfig.style"
                        (ngModelChange)="setSmtpStyle(provider.code, $event)"
                        [ngModelOptions]="{ standalone: true }"
                      >
                        <option value="connection-uri">Connection URI</option>
                        <option value="smtp-details">SMTP account details</option>
                      </select>
                    </ng-container>
                    <ng-template #genericSecretField>
                      <span>{{ secretFieldLabel(modeFor(provider.code)) }}</span>
                      <input
                        class="ui-input"
                        [ngModel]="secretFor(provider.code)"
                        (ngModelChange)="setSecret(provider.code, $event)"
                        [ngModelOptions]="{ standalone: true }"
                        [placeholder]="secretPlaceholder(modeFor(provider.code))"
                      />
                    </ng-template>
                  </label>

                  <ng-container *ngIf="provider.code === 'smtp' && smtpConfigFor(provider.code) as smtpConfig">
                    <div class="smtp-config-panel" *ngIf="smtpConfig.style === 'connection-uri'">
                      <label class="ui-field">
                        <span>SMTP connection URI</span>
                        <input
                          class="ui-input"
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
                          class="ui-select"
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
                          class="ui-input"
                          [ngModel]="smtpConfig.host"
                          (ngModelChange)="setSmtpField(provider.code, 'host', $event)"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="smtp.gmail.com"
                        />
                      </label>

                      <label class="ui-field">
                        <span>Port</span>
                        <input
                          class="ui-input"
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
                          class="ui-input"
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
                            class="ui-input"
                            [ngModel]="smtpConfig.password"
                            (ngModelChange)="setSmtpField(provider.code, 'password', $event)"
                            [ngModelOptions]="{ standalone: true }"
                            [type]="smtpConfig.revealPassword ? 'text' : 'password'"
                            placeholder="Enter SMTP password"
                          />
                          <button
                            class="ui-button ui-button-secondary"
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
                          class="ui-input"
                          [ngModel]="smtpConfig.fromAddress"
                          (ngModelChange)="setSmtpField(provider.code, 'fromAddress', $event)"
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
                          (change)="setSmtpSecure(provider.code, $any($event.target).checked)"
                        />
                      </label>
                    </div>
                  </ng-container>
                </div>
              </article>
            </section>

            <section *ngSwitchCase="1">
              <div class="section-heading">
                <h2>Create the first system admin</h2>
                <p>
                  This account becomes the initial deployment administrator and completes bootstrap.
                </p>
              </div>

              <label class="ui-field">
                <span>Full name</span>
                <input
                  class="ui-input"
                  [(ngModel)]="admin.name"
                  name="name"
                  required
                  minlength="2"
                />
              </label>

              <label class="ui-field">
                <span>Email</span>
                <input
                  class="ui-input"
                  [(ngModel)]="admin.email"
                  name="email"
                  type="email"
                  required
                />
              </label>

              <label class="ui-field">
                <span>Password</span>
                <input
                  class="ui-input"
                  [(ngModel)]="admin.password"
                  name="password"
                  type="password"
                  required
                  minlength="12"
                />
              </label>
            </section>

            <section *ngSwitchCase="2">
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

              <p class="error-copy" *ngIf="errorMessage()">{{ errorMessage() }}</p>
            </section>

            <section *ngSwitchCase="3">
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

          <footer class="wizard-actions">
            <button
              *ngIf="step() > 0 && step() < 3"
              class="ui-button"
              type="button"
              (click)="previousStep()"
            >
              Back
            </button>
            <button
              class="ui-button ui-button-primary"
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
        background:
          radial-gradient(circle at top left, rgb(249 115 22 / 0.16), transparent 24rem),
          radial-gradient(circle at bottom right, rgb(14 165 233 / 0.18), transparent 28rem),
          linear-gradient(180deg, #fffaf5 0%, #eef6ff 100%);
      }

      .hero {
        max-width: 48rem;
        margin: 0 auto var(--spacing-8);
      }

      .eyebrow {
        margin: 0 0 var(--spacing-2);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: var(--font-size-xs);
        font-weight: 800;
        color: var(--color-accent-600);
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(2.5rem, 5vw, 4.25rem);
        line-height: 0.96;
      }

      .lede {
        max-width: 40rem;
        color: var(--text-secondary);
        font-size: var(--font-size-lg);
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
        border: 1px solid rgb(15 23 42 / 0.08);
        border-radius: calc(var(--radius-xl) * 1.2);
        background: rgb(255 255 255 / 0.88);
        backdrop-filter: blur(20px);
        box-shadow: 0 1.25rem 3rem rgb(15 23 42 / 0.08);
      }

      .steps {
        display: grid;
        gap: var(--spacing-3);
        margin: var(--spacing-4) 0;
        padding-left: 1.25rem;
      }

      .steps li.active {
        color: var(--text-primary);
        font-weight: 700;
      }

      .edition-copy,
      .support-copy {
        color: var(--text-secondary);
      }

      .wizard-card {
        display: grid;
        gap: var(--spacing-5);
      }

      .section-heading h2,
      .summary-card h3 {
        margin-bottom: var(--spacing-2);
      }

      .section-heading p,
      .summary-card p {
        color: var(--text-secondary);
      }

      .provider-card,
      .summary-card {
        padding: var(--spacing-4);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: rgb(248 250 252 / 0.75);
      }

      .provider-header {
        display: flex;
        align-items: start;
        gap: var(--spacing-3);
      }

      .provider-header small {
        display: block;
        margin-top: 0.25rem;
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
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--surface-2) 70%, transparent);
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
      }

      .error-copy {
        color: #b91c1c;
      }

      @media (max-width: 900px) {
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

  private readonly selections = signal<
    Record<string, IntegrationSelection>
  >({});

  protected isEnabled(code: string): boolean {
    return this.selections()[code]?.enabled ?? false;
  }

  protected modeFor(code: string): SetupIntegrationCredentialMode {
    return this.selections()[code]?.mode ?? this.defaultMode(code);
  }

  protected secretFor(code: string): string {
    return this.selections()[code]?.secret ?? '';
  }

  protected toggleProvider(code: string, enabled: boolean) {
    this.updateSelection(code, {
      enabled,
      mode: this.modeFor(code),
      secret: this.secretFor(code),
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected setMode(code: string, mode: SetupIntegrationCredentialMode) {
    this.updateSelection(code, {
      enabled: this.isEnabled(code),
      mode,
      secret: this.secretFor(code),
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected setSecret(code: string, secret: string) {
    this.updateSelection(code, {
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret,
      smtpConfig: this.smtpConfigFor(code),
    });
  }

  protected smtpConfigFor(code: string): SmtpConfigState | null {
    return this.selections()[code]?.smtpConfig ?? (code === 'smtp' ? createEmptySmtpConfig() : null);
  }

  protected setSmtpStyle(code: string, style: SmtpConfigStyle) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret: this.secretFor(code),
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
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret: this.secretFor(code),
      smtpConfig: { ...smtpConfig, [field]: value },
    });
  }

  protected setSmtpSecure(code: string, secure: boolean) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret: this.secretFor(code),
      smtpConfig: { ...smtpConfig, secure },
    });
  }

  protected applySmtpPreset(code: string, preset: SmtpPresetId) {
    const smtpConfig = this.smtpConfigFor(code);
    if (!smtpConfig) {
      return;
    }
    this.updateSelection(code, {
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret: this.secretFor(code),
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
      enabled: this.isEnabled(code),
      mode: this.modeFor(code),
      secret: this.secretFor(code),
      smtpConfig: { ...smtpConfig, revealPassword: !smtpConfig.revealPassword },
    });
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
      await this.router.navigateByUrl('/home');
      return;
    }

    if (this.step() === 0) {
      const invalidSelection = this.selectedProviders().some(
        (provider) => this.serializedSecretFor(provider.code).trim().length === 0,
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
      if (
        this.admin.name.trim().length < 2 ||
        this.admin.password.trim().length < 12 ||
        !this.admin.email.includes('@')
      ) {
        this.errorMessage.set('Enter a valid admin name, email, and password before continuing.');
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
          ? { secret: this.serializedSecretFor(provider.code).trim() }
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

  private updateSelection(
    code: string,
    nextValue: IntegrationSelection,
  ) {
    this.selections.update((current) => ({
      ...current,
      [code]: nextValue,
    }));
  }

  private serializedSecretFor(code: string): string {
    const selection = this.selections()[code];
    if (!selection) {
      return '';
    }

    if (code !== 'smtp' || !selection.smtpConfig) {
      return selection.secret;
    }

    if (selection.smtpConfig.style === 'connection-uri') {
      return selection.smtpConfig.uri.trim();
    }

    const host = selection.smtpConfig.host.trim();
    const port = selection.smtpConfig.port.trim();
    const username = selection.smtpConfig.username.trim();
    const password = selection.smtpConfig.password.trim();
    const fromAddress = selection.smtpConfig.fromAddress.trim();

    if (!host && !port && !username && !password && !fromAddress && !selection.smtpConfig.secure) {
      return '';
    }

    return JSON.stringify({
      auth: username || password ? { pass: password, user: username } : undefined,
      fromAddress: fromAddress || undefined,
      host,
      port: port ? Number(port) : undefined,
      secure: selection.smtpConfig.secure,
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
