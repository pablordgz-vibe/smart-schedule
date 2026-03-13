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
    <section class="grid gap-6" data-testid="page-admin-users">
      <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
            System administration
          </p>
          <div class="space-y-2">
            <h1 class="text-3xl font-semibold tracking-tight">User lifecycle controls</h1>
            <p class="max-w-2xl text-sm leading-6 text-base-content/65">
              Manage account state and authentication policy without leaving the system context.
            </p>
          </div>
        </div>

        <form class="grid w-full gap-3 sm:grid-cols-[minmax(0,24rem)_auto] lg:w-auto" (ngSubmit)="reloadUsers()">
          <label class="form-control">
            <span class="label"><span class="label-text">Search by email, name, or id</span></span>
            <input
              class="input input-bordered w-full"
              [(ngModel)]="query"
              name="query"
              type="search"
              placeholder="user@example.com"
            />
          </label>
          <button class="btn btn-neutral self-end" type="submit">Refresh</button>
        </form>
      </header>

      <div class="alert alert-error" *ngIf="error()">{{ error() }}</div>
      <div class="alert alert-success" *ngIf="message()">{{ message() }}</div>

      <section class="card border border-base-300 bg-base-100 p-6 shadow-sm" *ngIf="authPolicy() as policy">
        <div class="grid gap-5">
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
              Authentication policy
            </p>
            <h2 class="text-xl font-semibold">Deployment-wide controls</h2>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm font-medium">
              <span>Require email verification</span>
              <input
                class="toggle toggle-sm"
                type="checkbox"
                [ngModel]="policy.requireEmailVerification"
                (ngModelChange)="policyRequireEmailVerification.set($event)"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>

            <label class="form-control">
              <span class="label"><span class="label-text">Minimum tier for deactivation/reactivation</span></span>
              <input
                class="input input-bordered w-full"
                type="number"
                min="0"
                max="9"
                [ngModel]="policy.minAdminTierForAccountDeactivation"
                (ngModelChange)="policyMinimumTier.set($event)"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>
          </div>

          <div>
            <button class="btn btn-outline" type="button" (click)="savePolicy()">
              Save policy
            </button>
          </div>
        </div>
      </section>

      <section class="card border border-base-300 bg-base-100 p-6 shadow-sm">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">Accounts</p>
            <h2 class="text-xl font-semibold">Known users</h2>
          </div>
          <p class="text-sm text-base-content/65">{{ users().length }} users in the current result set.</p>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-zebra">
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
                  <div class="grid gap-1">
                    <strong class="font-medium">{{ user.name }}</strong>
                    <span class="text-xs text-base-content/55">{{ user.id }}</span>
                  </div>
                </td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="badge" [class.badge-outline]="user.state === 'active'" [class.badge-error]="user.state !== 'active'">
                    {{ user.state }}
                  </span>
                </td>
                <td>{{ user.roles.join(', ') }}</td>
                <td>{{ authMethodLabel(user) }}</td>
                <td>
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="btn btn-outline btn-sm"
                      type="button"
                      (click)="deactivate(user)"
                      [disabled]="user.state === 'deactivated' || user.id === currentUserId()"
                    >
                      Deactivate
                    </button>
                    <button
                      class="btn btn-outline btn-sm"
                      type="button"
                      (click)="reactivate(user)"
                      [disabled]="user.state === 'active'"
                    >
                      Reactivate
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `,
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
      .map((method) => (method.kind === 'password' ? 'Password' : method.provider))
      .join(', ');
  }

  private async initialize() {
    await this.run(async () => {
      const [users, policy] = await Promise.all([
        this.authState.listUsers(''),
        this.authState.loadAdminConfiguration(),
      ]);
      this.users.set(users);
      this.authPolicy.set(policy);
      this.policyRequireEmailVerification.set(policy.requireEmailVerification);
      this.policyMinimumTier.set(policy.minAdminTierForAccountDeactivation);
    });
  }

  private async run(task: () => Promise<void>) {
    this.error.set('');
    this.message.set('');
    try {
      await task();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Request failed.');
    }
  }
}
