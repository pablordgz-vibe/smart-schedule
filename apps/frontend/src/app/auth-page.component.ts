import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import type { SocialProviderCode } from './auth.types';
import { ContextService } from './context.service';

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
    <section class="min-h-screen bg-base-200 px-4 py-8" data-testid="auth-page">
      <div
        class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_minmax(0,28rem)]"
      >
        <div class="hidden rounded-[2rem] border border-base-300 bg-base-100 p-10 lg:block">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-base-content/45">
            SmartSchedule
          </p>
          <h1 class="mt-4 text-4xl font-semibold tracking-tight text-balance">
            A quieter workspace for schedules, tasks, and approvals.
          </h1>
          <p class="mt-4 max-w-xl text-base leading-7 text-base-content/65">
            Sign in, recover access, or verify your email with the same calm structure used across
            the rest of the product.
          </p>
          <div class="mt-8 grid gap-3 text-sm text-base-content/60">
            <div class="rounded-box border border-base-300 bg-base-200 px-4 py-3">
              Clear states for sign-in, reset, recovery, and verification.
            </div>
            <div class="rounded-box border border-base-300 bg-base-200 px-4 py-3">
              Consistent controls with the main app shell and settings flows.
            </div>
            <div class="rounded-box border border-base-300 bg-base-200 px-4 py-3">
              Focused copy that explains the account state without product jargon.
            </div>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-5 p-6 md:p-8">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-base-content/45">
                Identity
              </p>
              <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ title() }}</h2>
              <p class="mt-2 text-sm leading-6 text-base-content/65">{{ description() }}</p>
            </div>

            <div
              class="alert alert-info rounded-box border border-base-300 bg-base-200 text-sm"
              *ngIf="message()"
            >
              <span>{{ message() }}</span>
            </div>
            <div class="alert alert-error rounded-box text-sm" *ngIf="error()">
              <span>{{ error() }}</span>
            </div>

            <form class="grid gap-4" *ngIf="mode() === 'sign-in'" (ngSubmit)="signIn()">
              <label class="form-control">
                <span class="label"><span class="label-text">Email</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="email"
                  name="email"
                  type="email"
                  required
                />
              </label>
              <label class="form-control">
                <span class="label"><span class="label-text">Password</span></span>
                <div class="join w-full">
                  <input
                    class="input input-bordered join-item w-full"
                    [(ngModel)]="password"
                    name="password"
                    [type]="showPassword ? 'text' : 'password'"
                    required
                    minlength="12"
                  />
                  <button
                    class="btn btn-outline join-item"
                    type="button"
                    (click)="showPassword = !showPassword"
                  >
                    {{ showPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </label>
              <button class="btn btn-neutral w-full" type="submit">Sign In</button>
            </form>

            <form class="grid gap-4" *ngIf="mode() === 'sign-up'" (ngSubmit)="signUp()">
              <label class="form-control">
                <span class="label"><span class="label-text">Name</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="name"
                  name="name"
                  type="text"
                  required
                  minlength="2"
                />
              </label>
              <label class="form-control">
                <span class="label"><span class="label-text">Email</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="email"
                  name="signup-email"
                  type="email"
                  required
                />
              </label>
              <label class="form-control">
                <span class="label"><span class="label-text">Password</span></span>
                <div class="join w-full">
                  <input
                    class="input input-bordered join-item w-full"
                    [(ngModel)]="password"
                    name="signup-password"
                    [type]="showPassword ? 'text' : 'password'"
                    required
                    minlength="12"
                  />
                  <button
                    class="btn btn-outline join-item"
                    type="button"
                    (click)="showPassword = !showPassword"
                  >
                    {{ showPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </label>
              <button class="btn btn-neutral w-full" type="submit">Create Account</button>
            </form>

            <div class="grid gap-4" *ngIf="mode() === 'verify-email'">
              <label class="form-control">
                <span class="label"><span class="label-text">Email</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="email"
                  name="verify-email"
                  type="email"
                />
              </label>
              <button class="btn btn-outline" type="button" (click)="requestVerification()">
                Send Verification Email
              </button>
              <label class="form-control">
                <span class="label"><span class="label-text">Verification token</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="token"
                  name="verify-token"
                  type="text"
                />
              </label>
              <button class="btn btn-neutral" type="button" (click)="confirmVerification()">
                Confirm Email
              </button>
            </div>

            <div class="grid gap-4" *ngIf="mode() === 'reset-password'">
              <label class="form-control">
                <span class="label"><span class="label-text">Email</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="email"
                  name="reset-email"
                  type="email"
                />
              </label>
              <button class="btn btn-outline" type="button" (click)="requestPasswordReset()">
                Send Reset Email
              </button>
              <label class="form-control">
                <span class="label"><span class="label-text">Reset token</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="token"
                  name="reset-token"
                  type="text"
                />
              </label>
              <label class="form-control">
                <span class="label"><span class="label-text">New password</span></span>
                <div class="join w-full">
                  <input
                    class="input input-bordered join-item w-full"
                    [(ngModel)]="password"
                    name="reset-password"
                    [type]="showPassword ? 'text' : 'password'"
                    minlength="12"
                  />
                  <button
                    class="btn btn-outline join-item"
                    type="button"
                    (click)="showPassword = !showPassword"
                  >
                    {{ showPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </label>
              <button class="btn btn-neutral" type="button" (click)="confirmPasswordReset()">
                Reset Password
              </button>
            </div>

            <div class="grid gap-4" *ngIf="mode() === 'recover-account'">
              <label class="form-control">
                <span class="label"><span class="label-text">Email</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="email"
                  name="recover-email"
                  type="email"
                />
              </label>
              <button class="btn btn-outline" type="button" (click)="requestRecovery()">
                Request Recovery
              </button>
              <label class="form-control">
                <span class="label"><span class="label-text">Recovery token</span></span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="token"
                  name="recover-token"
                  type="text"
                />
              </label>
              <button class="btn btn-neutral" type="button" (click)="recoverAccount()">
                Recover Account
              </button>
            </div>

            <div class="grid gap-4" *ngIf="mode() === 'deactivated'">
              <div
                class="rounded-box border border-base-300 bg-base-200 p-4 text-sm leading-6 text-base-content/70"
              >
                This account has been deactivated by an administrator and cannot sign in right now.
                Contact a system administrator to reactivate it, then return to sign in.
              </div>
              <a class="btn btn-outline" routerLink="/auth/sign-in">Back to sign in</a>
            </div>

            <div
              class="grid gap-3"
              *ngIf="mode() !== 'deactivated' && socialProviders().length > 0"
            >
              <button
                *ngFor="let provider of socialProviders()"
                class="btn btn-outline w-full px-4 py-2.5"
                type="button"
                (click)="socialSignIn(provider.code)"
              >
                Continue with {{ provider.displayName }}
              </button>
            </div>

            <nav class="grid grid-cols-2 gap-2 pt-2 text-sm sm:grid-cols-3">
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/sign-in"
                >Sign in</a
              >
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/sign-up"
                >Create account</a
              >
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/verify-email"
                >Verify email</a
              >
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/reset-password"
                >Reset password</a
              >
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/recover-account"
                >Recover account</a
              >
              <a
                class="btn btn-outline w-full justify-center px-4 py-2.5"
                routerLink="/auth/deactivated"
                >Deactivated</a
              >
            </nav>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class AuthPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authState = inject(AuthStateService);
  private readonly contextService = inject(ContextService);

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
  showPassword = false;

  constructor() {
    const oauthStatus = this.route.snapshot.queryParamMap.get('oauthStatus');
    const oauthError = this.route.snapshot.queryParamMap.get('oauthError');
    if (oauthStatus) {
      this.message.set(
        oauthStatus.endsWith('-signed-in')
          ? `${oauthStatus.replace('-signed-in', '')} sign-in completed.`
          : oauthStatus.replace(/-/g, ' '),
      );
    }
    if (oauthError) {
      this.error.set(oauthError);
    }
  }

  async signIn() {
    this.error.set('');
    try {
      await this.authState.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      await this.authState.loadSession();
      await this.router.navigateByUrl(this.contextService.fallbackRoute());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      if (message.toLowerCase().includes('deactivated')) {
        await this.router.navigateByUrl('/auth/deactivated');
        return;
      }

      this.error.set(message);
    }
  }

  async signUp() {
    this.error.set('');
    try {
      const result = await this.authState.signUp({
        email: this.email,
        name: this.name,
        password: this.password,
      });
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Account created. Verification token: ${result.tokenDelivery.previewToken}`
          : 'Account created. Verify your email if verification is required.',
      );
      await this.router.navigateByUrl('/auth/verify-email');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create account.');
    }
  }

  async requestVerification() {
    this.error.set('');
    try {
      const result = await this.authState.requestEmailVerification(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Verification token: ${result.tokenDelivery.previewToken}`
          : 'Verification email requested.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to request verification.');
    }
  }

  async confirmVerification() {
    this.error.set('');
    try {
      await this.authState.confirmEmailVerification(this.token);
      this.message.set('Email verified. You can sign in now.');
      await this.router.navigateByUrl('/auth/sign-in');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to confirm verification.');
    }
  }

  async requestPasswordReset() {
    this.error.set('');
    try {
      const result = await this.authState.requestPasswordReset(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Reset token: ${result.tokenDelivery.previewToken}`
          : 'Password reset email requested.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to request password reset.');
    }
  }

  async confirmPasswordReset() {
    this.error.set('');
    try {
      await this.authState.confirmPasswordReset(this.token, this.password);
      this.message.set('Password reset complete. You can sign in now.');
      await this.router.navigateByUrl('/auth/sign-in');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to reset password.');
    }
  }

  async requestRecovery() {
    this.error.set('');
    try {
      const result = await this.authState.requestRecovery(this.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Recovery token: ${result.tokenDelivery.previewToken}`
          : 'Recovery email requested.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to request recovery.');
    }
  }

  async recoverAccount() {
    this.error.set('');
    try {
      await this.authState.recoverAccount(this.token);
      await this.authState.loadSession();
      await this.router.navigateByUrl(this.contextService.fallbackRoute());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to recover account.');
    }
  }

  socialSignIn(provider: SocialProviderCode) {
    this.error.set('');
    this.message.set('');
    this.authState.startOAuth(provider, 'sign-in', '/home');
  }
}
