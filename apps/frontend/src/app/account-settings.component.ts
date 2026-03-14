import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';
import type { SocialProviderCode } from './auth.types';
import { PersonalTimePoliciesComponent } from './personal-time-policies.component';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, PersonalTimePoliciesComponent],
  template: `
    <section class="grid gap-6" data-testid="page-settings">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm" *ngIf="user() as currentUser">
        <div class="grid gap-6">
          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">Identity</p>
            <div class="space-y-2">
              <h1 class="text-3xl font-semibold tracking-tight">{{ currentUser.name }}</h1>
              <p class="text-sm leading-6 text-base-content/65">
                {{ currentUser.email }} · {{ currentUser.state }} ·
                {{ currentUser.emailVerified ? 'Email verified' : 'Email pending verification' }}
              </p>
              <p class="text-sm leading-6 text-base-content/65" *ngIf="currentUser.recoverUntil">
                Recoverable until {{ formatDateTime(currentUser.recoverUntil) }}
              </p>
            </div>
          </div>

          <div class="alert alert-info" *ngIf="message()">{{ message() }}</div>
          <div class="alert alert-error" *ngIf="error()">{{ error() }}</div>

          <div class="grid gap-4 xl:grid-cols-2">
            <div class="rounded-box border border-base-300 bg-base-100 p-4">
              <h2 class="text-lg font-semibold">Login methods</h2>
              <ul class="mt-3 grid gap-2 text-sm text-base-content/70">
                <li *ngFor="let method of currentUser.authMethods">
                  {{ method.kind === 'password' ? 'Password' : method.provider }}
                </li>
              </ul>
            </div>

            <div class="rounded-box border border-base-300 bg-base-100 p-4">
              <h2 class="text-lg font-semibold">Verification</h2>
              <p class="mt-3 text-sm leading-6 text-base-content/65">
                Mandatory verification: {{ requireEmailVerification() ? 'enabled' : 'disabled' }}
              </p>
              <button
                class="btn btn-outline mt-4"
                type="button"
                (click)="requestVerification()"
                *ngIf="!currentUser.emailVerified"
              >
                Send verification email
              </button>
            </div>
          </div>

          <div class="rounded-box border border-base-300 bg-base-100 p-4">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">Social sign-in providers</h2>
              <p class="text-sm leading-6 text-base-content/65">
                Link and unlink the same OAuth providers used on the sign-in page.
              </p>
            </div>

            <ul class="mt-4 grid gap-3">
              <li
                *ngFor="let provider of providers()"
                class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <strong>{{ provider.displayName }}</strong>
                    <span class="badge badge-outline" *ngIf="isLinked(provider.code)">Linked</span>
                    <span class="badge badge-ghost" *ngIf="!isLinked(provider.code)">Not linked</span>
                  </div>
                  <p class="text-sm leading-6 text-base-content/60">
                    {{ isLinked(provider.code) ? 'Available for account sign-in.' : 'Not yet linked to this account.' }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="btn btn-outline"
                    type="button"
                    (click)="linkProvider(provider.code)"
                    *ngIf="!isLinked(provider.code)"
                  >
                    Link {{ provider.displayName }}
                  </button>
                  <button
                    class="btn btn-outline"
                    type="button"
                    (click)="unlinkProvider(provider.code)"
                    *ngIf="isLinked(provider.code)"
                  >
                    Unlink {{ provider.displayName }}
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="btn btn-outline" type="button" (click)="logout()">
              Sign out
            </button>
            <button class="btn btn-outline btn-error" type="button" (click)="showDeleteConfirmation()">
              Delete account
            </button>
          </div>

          <section class="rounded-box border border-error/30 bg-error/5 p-4" *ngIf="confirmDelete()">
            <div class="space-y-2">
              <h2 class="text-lg font-semibold">Confirm account deletion</h2>
              <p class="text-sm leading-6 text-base-content/70">
                Type <strong>DELETE</strong> to confirm. The account remains recoverable for 30 days.
              </p>
            </div>
            <label class="form-control mt-4">
              <span class="label"><span class="label-text">Confirmation text</span></span>
              <input
                class="input input-bordered w-full"
                [ngModel]="deleteConfirmationText()"
                (ngModelChange)="deleteConfirmationText.set($event)"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>
            <div class="mt-4 flex flex-wrap gap-3">
              <button class="btn btn-outline" type="button" (click)="cancelDelete()">
                Cancel
              </button>
              <button class="btn btn-error" type="button" (click)="confirmDeleteAccount()">
                Confirm deletion
              </button>
            </div>
          </section>

          <app-personal-time-policies *ngIf="activeContextType() === 'personal'" />

          <section
            class="rounded-box border border-base-300 bg-base-100 p-4"
            *ngIf="activeContextType() !== 'personal'"
          >
            <h2 class="text-lg font-semibold">Time policy workspace</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/65" *ngIf="activeContextType() === 'organization'">
              Personal rules are managed in personal context. Organization rules live in the
              organization time-policies workspace so scope and preview stay explicit.
            </p>
            <p class="mt-2 text-sm leading-6 text-base-content/65" *ngIf="activeContextType() !== 'organization'">
              Switch into personal context to manage personal time policies.
            </p>
          </section>
        </div>
      </div>
    </section>
  `,
})
export class AccountSettingsComponent {
  private readonly authState = inject(AuthStateService);
  private readonly contextService = inject(ContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly user = computed(() => this.authState.user());
  readonly activeContextType = computed(() => this.contextService.activeContext().contextType);
  readonly providers = computed(() => this.authState.providers());
  readonly requireEmailVerification = computed(() => this.authState.requireEmailVerification());
  readonly message = signal('');
  readonly error = signal('');
  readonly confirmDelete = signal(false);
  readonly deleteConfirmationText = signal('');

  constructor() {
    const oauthStatus = this.route.snapshot.queryParamMap.get('oauthStatus');
    const oauthError = this.route.snapshot.queryParamMap.get('oauthError');
    if (oauthStatus?.endsWith('-linked')) {
      this.message.set(`${oauthStatus.replace('-linked', '')} linked.`);
    }
    if (oauthError) {
      this.error.set(oauthError);
    }
  }

  async requestVerification() {
    await this.run(async () => {
      const currentUser = this.user();
      if (!currentUser) {
        return;
      }
      const result = await this.authState.requestEmailVerification(currentUser.email);
      this.message.set(
        result.tokenDelivery?.previewToken
          ? `Verification token: ${result.tokenDelivery.previewToken}`
          : 'Verification email requested.',
      );
    });
  }

  isLinked(provider: SocialProviderCode) {
    return (
      this.user()?.authMethods.some(
        (method) => method.kind === 'social' && method.provider === provider,
      ) ?? false
    );
  }

  linkProvider(provider: SocialProviderCode) {
    this.error.set('');
    this.message.set('');
    this.authState.startOAuth(provider, 'link', '/settings');
  }

  async unlinkProvider(provider: SocialProviderCode) {
    await this.run(async () => {
      await this.authState.unlinkProvider(provider);
      this.message.set(`${provider} unlinked.`);
    });
  }

  async logout() {
    await this.run(async () => {
      await this.authState.logout();
      await this.router.navigateByUrl('/auth/sign-in');
    });
  }

  async deleteAccount() {
    await this.run(async () => {
      await this.authState.deleteAccount();
      await this.router.navigateByUrl('/auth/recover-account');
    });
  }

  showDeleteConfirmation() {
    this.error.set('');
    this.message.set('');
    this.deleteConfirmationText.set('');
    this.confirmDelete.set(true);
  }

  cancelDelete() {
    this.deleteConfirmationText.set('');
    this.confirmDelete.set(false);
  }

  async confirmDeleteAccount() {
    if (this.deleteConfirmationText().trim().toUpperCase() !== 'DELETE') {
      this.error.set('Type DELETE to confirm account removal.');
      return;
    }

    await this.deleteAccount();
    this.confirmDelete.set(false);
    this.deleteConfirmationText.set('');
  }

  private async run(task: () => Promise<void>) {
    this.error.set('');
    try {
      await task();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Request failed.');
    }
  }

  formatDateTime(value: string | null) {
    if (!value) {
      return 'n/a';
    }

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
