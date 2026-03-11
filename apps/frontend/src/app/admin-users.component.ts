import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStateService } from './auth-state.service';
import type { IdentityUserSummary } from './auth.types';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page admin-users-page" data-testid="page-admin-users">
      <header class="page-header">
        <div>
          <p class="ui-kicker">System administration</p>
          <h1>User lifecycle controls</h1>
          <p class="page-copy">
            Manage account state and authentication policy without leaving the system context.
          </p>
        </div>

        <form class="search-row" (ngSubmit)="reloadUsers()">
          <label class="ui-field search-field">
            <span>Search by email, name, or id</span>
            <input
              class="ui-input"
              [(ngModel)]="query"
              name="query"
              type="search"
              placeholder="user@example.com"
            />
          </label>
          <button class="ui-button ui-button-primary" type="submit">Refresh</button>
        </form>
      </header>

      <p class="ui-card error-copy" *ngIf="error()">{{ error() }}</p>
      <p class="ui-card success-copy" *ngIf="message()">{{ message() }}</p>

      <section class="ui-card policy-card" *ngIf="authPolicy() as policy">
        <div>
          <p class="ui-kicker">Authentication policy</p>
          <h2>Deployment-wide controls</h2>
        </div>

        <div class="policy-grid">
          <label class="ui-field toggle-field">
            <span>Require email verification</span>
            <input
              type="checkbox"
              [ngModel]="policy.requireEmailVerification"
              (ngModelChange)="policyRequireEmailVerification.set($event)"
              [ngModelOptions]="{ standalone: true }"
            />
          </label>

          <label class="ui-field">
            <span>Minimum tier for deactivation/reactivation</span>
            <input
              class="ui-input"
              type="number"
              min="0"
              max="9"
              [ngModel]="policy.minAdminTierForAccountDeactivation"
              (ngModelChange)="policyMinimumTier.set($event)"
              [ngModelOptions]="{ standalone: true }"
            />
          </label>
        </div>

        <div class="policy-actions">
          <button class="ui-button ui-button-secondary" type="button" (click)="savePolicy()">
            Save policy
          </button>
        </div>
      </section>

      <section class="ui-card table-card">
        <div class="table-header">
          <div>
            <p class="ui-kicker">Accounts</p>
            <h2>Known users</h2>
          </div>
          <p class="page-copy">{{ users().length }} users in the current result set.</p>
        </div>

        <div class="table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>State</th>
                <th>Roles</th>
                <th>Auth methods</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let user of users()">
                <td>
                  <strong>{{ user.name }}</strong>
                  <small>{{ user.id }}</small>
                </td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="ui-chip" [class.state-danger]="user.state !== 'active'">
                    {{ user.state }}
                  </span>
                </td>
                <td>{{ user.roles.join(', ') }}</td>
                <td>{{ authMethodLabel(user) }}</td>
                <td class="action-cell">
                  <button
                    class="ui-button ui-button-secondary"
                    type="button"
                    (click)="deactivate(user)"
                    [disabled]="user.state === 'deactivated' || user.id === currentUserId()"
                  >
                    Deactivate
                  </button>
                  <button
                    class="ui-button"
                    type="button"
                    (click)="reactivate(user)"
                    [disabled]="user.state === 'active'"
                  >
                    Reactivate
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `,
  styles: [
    `
      .admin-users-page,
      .policy-card,
      .table-card {
        display: grid;
        gap: var(--spacing-5);
      }

      .page-header,
      .table-header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: var(--spacing-4);
        flex-wrap: wrap;
      }

      .page-copy,
      .error-copy,
      .success-copy,
      td small {
        color: var(--text-secondary);
      }

      .error-copy {
        color: #b91c1c;
      }

      .success-copy {
        color: #166534;
      }

      .search-row,
      .policy-grid,
      .policy-actions {
        display: flex;
        gap: var(--spacing-3);
        flex-wrap: wrap;
        align-items: end;
      }

      .search-field {
        min-width: min(26rem, 100%);
      }

      .toggle-field {
        justify-content: space-between;
      }

      .table-wrap {
        overflow-x: auto;
      }

      .users-table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: var(--spacing-3);
        border-bottom: 1px solid var(--border-default);
        text-align: left;
        vertical-align: top;
      }

      td strong,
      td small {
        display: block;
      }

      .action-cell {
        display: flex;
        gap: var(--spacing-2);
        flex-wrap: wrap;
      }

      .state-danger {
        background: rgb(248 113 113 / 0.12);
        color: #991b1b;
      }
    `,
  ],
})
export class AdminUsersComponent {
  private readonly authState = inject(AuthStateService);

  readonly users = signal<IdentityUserSummary[]>([]);
  readonly authPolicy = signal<{
    minAdminTierForAccountDeactivation: number;
    requireEmailVerification: boolean;
  } | null>(null);
  readonly policyRequireEmailVerification = signal(false);
  readonly policyMinimumTier = signal(0);
  readonly message = signal('');
  readonly error = signal('');
  readonly currentUserId = computed(() => this.authState.user()?.id ?? null);

  query = '';

  constructor() {
    void this.initialize();
  }

  async reloadUsers() {
    await this.run(async () => {
      this.users.set(await this.authState.listUsers(this.query));
    });
  }

  async savePolicy() {
    await this.run(async () => {
      const nextPolicy = await this.authState.updateAdminAuthConfig({
        minAdminTierForAccountDeactivation: this.policyMinimumTier(),
        requireEmailVerification: this.policyRequireEmailVerification(),
      });
      this.authPolicy.set(nextPolicy);
      this.policyRequireEmailVerification.set(nextPolicy.requireEmailVerification);
      this.policyMinimumTier.set(nextPolicy.minAdminTierForAccountDeactivation);
      this.message.set('Authentication policy updated.');
    });
  }

  async deactivate(user: IdentityUserSummary) {
    await this.run(async () => {
      await this.authState.deactivateUser(user.id);
      await this.reloadUsers();
      this.message.set(`Deactivated ${user.email}.`);
    });
  }

  async reactivate(user: IdentityUserSummary) {
    await this.run(async () => {
      await this.authState.reactivateUser(user.id);
      await this.reloadUsers();
      this.message.set(`Reactivated ${user.email}.`);
    });
  }

  authMethodLabel(user: IdentityUserSummary) {
    return user.authMethods
      .map((method) => (method.kind === 'password' ? 'password' : `social:${method.provider}`))
      .join(', ');
  }

  private async initialize() {
    await this.run(async () => {
      const [policy, users] = await Promise.all([
        this.authState.loadAdminConfiguration(),
        this.authState.listUsers(),
      ]);
      this.authPolicy.set(policy);
      this.policyRequireEmailVerification.set(policy.requireEmailVerification);
      this.policyMinimumTier.set(policy.minAdminTierForAccountDeactivation);
      this.users.set(users);
    });
  }

  private async run(task: () => Promise<void>) {
    this.error.set('');
    try {
      await task();
    } catch (error: unknown) {
      this.message.set('');
      this.error.set(error instanceof Error ? error.message : 'Request failed.');
    }
  }
}
