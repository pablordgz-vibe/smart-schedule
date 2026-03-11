import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import type { SocialProviderCode } from './auth.types';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-settings">
      <div class="ui-card settings-grid" *ngIf="user() as currentUser">
        <div>
          <p class="ui-kicker">Identity</p>
          <h1>{{ currentUser.name }}</h1>
          <p class="settings-copy">
            {{ currentUser.email }} · {{ currentUser.state }} ·
            {{ currentUser.emailVerified ? 'Email verified' : 'Email pending verification' }}
          </p>
          <p class="settings-copy" *ngIf="currentUser.recoverUntil">
            Recoverable until {{ currentUser.recoverUntil }}
          </p>
        </div>

        <p class="auth-message" *ngIf="message()">{{ message() }}</p>
        <p class="auth-error" *ngIf="error()">{{ error() }}</p>

        <div class="ui-meta-grid">
          <div class="ui-panel">
            <h2>Login Methods</h2>
            <p *ngFor="let method of currentUser.authMethods">
              {{ method.kind === 'password' ? 'Password' : method.provider }}
            </p>
          </div>

          <div class="ui-panel">
            <h2>Verification</h2>
            <p>
              Mandatory verification:
              {{ requireEmailVerification() ? 'enabled' : 'disabled' }}
            </p>
            <button
              class="ui-button ui-button-secondary"
              type="button"
              (click)="requestVerification()"
              *ngIf="!currentUser.emailVerified"
            >
              Send verification email
            </button>
          </div>
        </div>

        <div class="settings-row">
          <label class="ui-field">
            <span>Provider to link</span>
            <select [(ngModel)]="selectedProvider" name="selected-provider">
              <option *ngFor="let provider of providers()" [value]="provider.code">
                {{ provider.displayName }}
              </option>
            </select>
          </label>
          <button class="ui-button ui-button-secondary" type="button" (click)="linkProvider()">
            Link provider
          </button>
        </div>

        <div class="settings-row">
          <button class="ui-button ui-button-secondary" type="button" (click)="unlinkProvider()">
            Unlink selected provider
          </button>
          <button class="ui-button ui-button-secondary" type="button" (click)="logout()">
            Sign out
          </button>
          <button class="ui-button" type="button" (click)="deleteAccount()">
            Delete account
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .settings-grid {
        display: grid;
        gap: var(--spacing-5);
      }

      .settings-copy,
      .auth-message {
        color: var(--text-secondary);
      }

      .auth-error {
        color: #b91c1c;
      }

      .settings-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-3);
        align-items: end;
      }
    `,
  ],
})
export class AccountSettingsComponent {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  readonly user = computed(() => this.authState.user());
  readonly providers = computed(() => this.authState.providers());
  readonly requireEmailVerification = computed(() =>
    this.authState.requireEmailVerification(),
  );
  readonly message = signal('');
  readonly error = signal('');

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

  private async run(task: () => Promise<void>) {
    this.error.set('');
    try {
      await task();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Request failed.');
    }
  }
}
