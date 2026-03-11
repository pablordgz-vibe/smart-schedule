import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import type { SocialProviderCode } from './auth.types';

type AuthMode =
  | 'deactivated'
  | 'recover-account'
  | 'reset-password'
  | 'sign-in'
  | 'sign-up'
  | 'verify-email';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="auth-page" data-testid="auth-page">
      <div class="auth-panel">
        <p class="ui-kicker">Identity</p>
        <h1>{{ title() }}</h1>
        <p class="auth-copy">{{ description() }}</p>

        <p class="auth-message" *ngIf="message()">{{ message() }}</p>
        <p class="auth-error" *ngIf="error()">{{ error() }}</p>

        <form class="auth-form" *ngIf="mode() === 'sign-in'" (ngSubmit)="signIn()">
          <label class="ui-field">
            <span>Email</span>
            <input [(ngModel)]="email" name="email" type="email" required />
          </label>
          <label class="ui-field">
            <span>Password</span>
            <input [(ngModel)]="password" name="password" type="password" required minlength="12" />
          </label>
          <button class="ui-button ui-button-primary" type="submit">Sign In</button>
        </form>

        <form class="auth-form" *ngIf="mode() === 'sign-up'" (ngSubmit)="signUp()">
          <label class="ui-field">
            <span>Name</span>
            <input [(ngModel)]="name" name="name" type="text" required minlength="2" />
          </label>
          <label class="ui-field">
            <span>Email</span>
            <input [(ngModel)]="email" name="signup-email" type="email" required />
          </label>
          <label class="ui-field">
            <span>Password</span>
            <input
              [(ngModel)]="password"
              name="signup-password"
              type="password"
              required
              minlength="12"
            />
          </label>
          <button class="ui-button ui-button-primary" type="submit">Create Account</button>
        </form>

        <div class="auth-form" *ngIf="mode() === 'verify-email'">
          <label class="ui-field">
            <span>Email</span>
            <input [(ngModel)]="email" name="verify-email" type="email" />
          </label>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            (click)="requestVerification()"
          >
            Send Verification Email
          </button>
          <label class="ui-field">
            <span>Verification token</span>
            <input [(ngModel)]="token" name="verify-token" type="text" />
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="confirmVerification()">
            Confirm Email
          </button>
        </div>

        <div class="auth-form" *ngIf="mode() === 'reset-password'">
          <label class="ui-field">
            <span>Email</span>
            <input [(ngModel)]="email" name="reset-email" type="email" />
          </label>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            (click)="requestPasswordReset()"
          >
            Send Reset Email
          </button>
          <label class="ui-field">
            <span>Reset token</span>
            <input [(ngModel)]="token" name="reset-token" type="text" />
          </label>
          <label class="ui-field">
            <span>New password</span>
            <input [(ngModel)]="password" name="reset-password" type="password" minlength="12" />
          </label>
          <button
            class="ui-button ui-button-primary"
            type="button"
            (click)="confirmPasswordReset()"
          >
            Reset Password
          </button>
        </div>

        <div class="auth-form" *ngIf="mode() === 'recover-account'">
          <label class="ui-field">
            <span>Email</span>
            <input [(ngModel)]="email" name="recover-email" type="email" />
          </label>
          <button class="ui-button ui-button-secondary" type="button" (click)="requestRecovery()">
            Request Recovery
          </button>
          <label class="ui-field">
            <span>Recovery token</span>
            <input [(ngModel)]="token" name="recover-token" type="text" />
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="recoverAccount()">
            Recover Account
          </button>
        </div>

        <div class="auth-form" *ngIf="mode() === 'deactivated'">
          <p class="auth-copy">
            This account has been deactivated by an administrator and cannot sign in right now.
          </p>
          <p class="auth-copy">
            Contact a system administrator to reactivate the account, then return to sign in.
          </p>
          <a class="ui-button ui-button-secondary" routerLink="/auth/sign-in">Back to sign in</a>
        </div>

        <div class="provider-grid" *ngIf="mode() !== 'deactivated' && socialProviders().length > 0">
          <button
            *ngFor="let provider of socialProviders()"
            class="ui-button ui-button-secondary"
            type="button"
            (click)="socialSignIn(provider.code)"
          >
            Continue with {{ provider.displayName }}
          </button>
        </div>

        <nav class="auth-links">
          <a routerLink="/auth/sign-in">Sign in</a>
          <a routerLink="/auth/sign-up">Create account</a>
          <a routerLink="/auth/verify-email">Verify email</a>
          <a routerLink="/auth/reset-password">Reset password</a>
          <a routerLink="/auth/recover-account">Recover account</a>
          <a routerLink="/auth/deactivated">Deactivated</a>
        </nav>
      </div>
    </section>
  `,
  styles: [
    `
      .auth-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: var(--spacing-6);
        background:
          radial-gradient(circle at top left, rgb(14 165 233 / 0.18), transparent 24rem),
          linear-gradient(180deg, #fffdfa 0%, #eef4fb 100%);
      }

      .auth-panel {
        width: min(34rem, 100%);
        display: grid;
        gap: var(--spacing-4);
        padding: var(--spacing-6);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-2xl);
        background: rgb(255 255 255 / 0.9);
        box-shadow: var(--shadow-lg);
      }

      .auth-copy,
      .auth-message {
        color: var(--text-secondary);
      }

      .auth-error {
        color: #b91c1c;
      }

      .auth-form,
      .provider-grid,
      .auth-links {
        display: grid;
        gap: var(--spacing-3);
      }

      .auth-links {
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      }
    `,
  ],
})
export class AuthPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authState = inject(AuthStateService);

  readonly mode = computed(() => this.route.snapshot.data['mode'] as AuthMode);
  readonly title = computed(() => {
    switch (this.mode()) {
      case 'sign-up':
        return 'Create your account';
      case 'verify-email':
        return 'Verify your email';
      case 'reset-password':
        return 'Reset your password';
      case 'recover-account':
        return 'Recover your account';
      case 'deactivated':
        return 'Account deactivated';
      default:
        return 'Sign in';
    }
  });
  readonly description = computed(() => {
    switch (this.mode()) {
      case 'sign-up':
        return 'Create an email/password account, then verify it if your deployment requires verification.';
      case 'verify-email':
        return 'Request a verification token and confirm it to unlock email/password sign-in.';
      case 'reset-password':
        return 'Start a password reset flow and complete it with the delivered token.';
      case 'recover-account':
        return 'Deleted accounts remain recoverable for 30 days before permanent removal.';
      case 'deactivated':
        return 'Deactivated accounts stay unavailable until a system administrator restores access.';
      default:
        return 'Use email/password or a configured social provider.';
    }
  });
  readonly socialProviders = computed(() => this.authState.providers());
  readonly message = signal('');
  readonly error = signal('');

  email = '';
  name = '';
  password = '';
  token = '';

  async signIn() {
    this.error.set('');
    try {
      await this.authState.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      await this.router.navigateByUrl('/home');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      if (message.toLowerCase().includes('deactivated')) {
        await this.router.navigateByUrl('/auth/deactivated');
        return;
      }

      this.error.set(message);
    }
  }

  async signUp() {
    await this.run(async () => {
      const result = await this.authState.signUp({
        email: this.email,
        name: this.name,
        password: this.password,
      });
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Account created. Verification token: ${result.tokenDelivery.previewToken}`
          : 'Account created. Check your email for a verification link.',
      );
      this.password = '';
    });
  }

  async requestVerification() {
    await this.run(async () => {
      const result = await this.authState.requestEmailVerification(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Verification token: ${result.tokenDelivery.previewToken}`
          : 'If the account is eligible, a verification email has been queued.',
      );
    });
  }

  async confirmVerification() {
    await this.run(async () => {
      await this.authState.confirmEmailVerification(this.token);
      this.message.set('Email verification confirmed.');
    });
  }

  async requestPasswordReset() {
    await this.run(async () => {
      const result = await this.authState.requestPasswordReset(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Reset token: ${result.tokenDelivery.previewToken}`
          : 'If the account is eligible, a reset email has been queued.',
      );
    });
  }

  async confirmPasswordReset() {
    await this.run(async () => {
      await this.authState.confirmPasswordReset(this.token, this.password);
      this.message.set('Password reset complete. You can sign in now.');
      this.password = '';
    });
  }

  async requestRecovery() {
    await this.run(async () => {
      const result = await this.authState.requestRecovery(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Recovery token: ${result.tokenDelivery.previewToken}`
          : 'If the account is recoverable, a recovery email has been queued.',
      );
    });
  }

  async recoverAccount() {
    await this.run(async () => {
      await this.authState.recoverAccount(this.token);
      await this.router.navigateByUrl('/home');
    });
  }

  async socialSignIn(provider: SocialProviderCode) {
    await this.run(async () => {
      const email = this.email || `${provider}.user@example.com`;
      const name = this.name || `${provider[0].toUpperCase()}${provider.slice(1)} User`;
      await this.authState.signInWithSocial({
        email,
        name,
        provider,
        providerSubject: `${provider}:${email.toLowerCase()}`,
      });
      await this.router.navigateByUrl('/home');
    });
  }

  private async run(task: () => Promise<void>) {
    this.error.set('');
    try {
      await task();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Request failed.');
    }
  }
}
