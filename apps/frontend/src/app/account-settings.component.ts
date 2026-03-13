import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
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
                Recoverable until {{ currentUser.recoverUntil }}
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

          <div class="grid gap-4 xl:grid-cols-[minmax(0,20rem)_auto] xl:items-end">
            <label class="form-control">
              <span class="label"><span class="label-text">Provider to link</span></span>
              <select class="select select-bordered w-full" [(ngModel)]="selectedProvider" name="selected-provider">
                <option *ngFor="let provider of providers()" [value]="provider.code">
                  {{ provider.displayName }}
                </option>
              </select>
            </label>
            <button class="btn btn-outline xl:self-end" type="button" (click)="linkProvider()">
              Link provider
            </button>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="btn btn-outline" type="button" (click)="unlinkProvider()">
              Unlink selected provider
            </button>
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

          <app-personal-time-policies />
        </div>
      </div>
    </section>
  `,
})
export class AccountSettingsComponent {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  readonly user = computed(() => this.authState.user());
  readonly providers = computed(() => this.authState.providers());
  readonly requireEmailVerification = computed(() => this.authState.requireEmailVerification());
  readonly message = signal('');
  readonly error = signal('');
  readonly confirmDelete = signal(false);
  readonly deleteConfirmationText = signal('');

  selectedProvider: SocialProviderCode = 'google';

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

  async linkProvider() {
    await this.run(async () => {
      const currentUser = this.user();
      if (!currentUser) {
        return;
      }
      await this.authState.linkProvider(
        this.selectedProvider,
        `${this.selectedProvider}:${currentUser.email}`,
      );
      this.message.set('Provider linked.');
    });
  }

  async unlinkProvider() {
    await this.run(async () => {
      await this.authState.unlinkProvider(this.selectedProvider);
      this.message.set('Provider unlinked.');
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
}
