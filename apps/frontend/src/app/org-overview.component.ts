import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';
import { OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" [attr.data-testid]="pageTestId()">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">{{ sectionLabel() }}</p>
        <h1>{{ pageTitle() }}</h1>
        <p class="text-sm leading-6 text-base-content/65">
          {{ pageDescription() }}
        </p>

        <div class="flex flex-wrap items-end gap-3" *ngIf="isEndUserRoute()">
          <label class="form-control grow gap-2">
            <span>New organization name</span>
            <input class="input input-bordered w-full" [(ngModel)]="organizationName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <button class="btn btn-neutral" type="button" (click)="createOrganization()">
            Create organization
          </button>
        </div>

        <p *ngIf="errorMessage()" class="alert alert-error">{{ errorMessage() }}</p>

        <div class="grid gap-4 xl:grid-cols-2" *ngIf="isEndUserRoute()">
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>My organizations</h2>
            <ul class="simple-list">
              <li *ngFor="let org of organizations()" data-testid="org-row">
                <div class="stack-tight">
                  <strong>{{ org.name }}</strong>
                  <span class="badge badge-outline">{{ formatRole(org.membershipRole) }}</span>
                </div>
                <button
                  class="btn btn-outline"
                  type="button"
                  (click)="enterOrganization(org)"
                >
                  {{ organizationCta(org) }}
                </button>
              </li>
              <li *ngIf="organizations().length === 0" class="ui-copy">
                No organizations yet. Create one here to start an organization workspace.
              </li>
            </ul>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>My pending invitations</h2>
            <ul class="simple-list">
              <li *ngFor="let invitation of myInvitations()" data-testid="org-invite-row">
                <div>
                  <strong>{{ invitation.organizationName }}</strong>
                  <p class="text-sm leading-6 text-base-content/65">
                    {{ formatRole(invitation.role) }} · expires {{ formatDateTime(invitation.expiresAt) }}
                  </p>
                </div>
                <button
                  class="btn btn-outline"
                  type="button"
                  (click)="acceptInvitation(invitation.inviteCode)"
                >
                  Accept
                </button>
              </li>
              <li *ngIf="myInvitations().length === 0" class="text-sm text-base-content/60">No pending invitations.</li>
            </ul>
          </article>
        </div>

        <article class="rounded-box border border-base-300 bg-base-100 p-4" *ngIf="!isEndUserRoute() && canAdministerActiveOrganization()">
          <h2>Organization members</h2>
          <p class="text-sm leading-6 text-base-content/65">
            Members for {{ activeOrganizationLabel() }}. Invite new people below and manage
            existing members from this organization context.
          </p>
            <ul class="simple-list">
              <li *ngFor="let member of memberships()" data-testid="org-member-row">
                <div class="flex flex-wrap items-center gap-2">
                  <strong>{{ member.name }}</strong>
                  <span>{{ member.email }}</span>
                  <span class="badge badge-outline">{{ formatRole(member.role) }}</span>
                </div>
              </li>
            <li *ngIf="memberships().length === 0" class="text-sm text-base-content/60">No members found.</li>
          </ul>

          <h3>Invite member</h3>
          <p class="text-sm leading-6 text-base-content/65">
            Invitations are issued to the recipient email address. Delivery is queued for email
            processing; the preview code remains visible in development.
          </p>
          <div class="flex flex-wrap items-end gap-3">
            <label class="form-control grow gap-2">
              <span>Email</span>
              <input class="input input-bordered w-full" [(ngModel)]="inviteEmail" [ngModelOptions]="{ standalone: true }" />
            </label>
            <label class="form-control gap-2">
              <span>Role</span>
              <select class="select select-bordered w-full" [(ngModel)]="inviteRole" [ngModelOptions]="{ standalone: true }">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button class="btn btn-neutral" type="button" (click)="sendInvitation()">
              Send invite
            </button>
          </div>

          <h3>Pending invitations</h3>
          <ul class="simple-list">
            <li *ngFor="let invitation of orgInvitations()" data-testid="org-admin-invite-row">
              <div class="flex flex-wrap items-center gap-2">
                <strong>{{ invitation.invitedEmail }}</strong>
                <span>{{ formatRole(invitation.role) }}</span>
                <small class="text-sm text-base-content/60" *ngIf="invitation.previewInviteCode">
                  Dev preview code: {{ invitation.previewInviteCode }}
                </small>
              </div>
            </li>
            <li *ngIf="orgInvitations().length === 0" class="text-sm text-base-content/60">No pending invitations.</li>
          </ul>
        </article>
      </div>
    </section>
  `,
})
export class OrgOverviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authState = inject(AuthStateService);
  private readonly contextService = inject(ContextService);
  private readonly orgApi = inject(OrgApiService);

  organizationName = '';
  inviteEmail = '';
  inviteRole: 'admin' | 'member' = 'member';

  private readonly organizationsState = signal<
    Array<{ id: string; membershipRole: 'admin' | 'member'; name: string }>
  >([]);
  private readonly membershipsState = signal<
    Array<{ email: string; name: string; role: 'admin' | 'member'; userId: string }>
  >([]);
  private readonly orgInvitationsState = signal<
    Array<{
      id: string;
      invitedEmail: string;
      role: 'admin' | 'member';
      previewInviteCode?: string;
    }>
  >([]);
  private readonly myInvitationsState = signal<
    Array<{
      inviteCode: string;
      organizationName: string;
      role: 'admin' | 'member';
      expiresAt?: string;
    }>
  >([]);
  readonly errorMessage = signal<string | null>(null);

  readonly activeOrganizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly activeOrganizationLabel = computed(() => this.contextService.getContextLabel());
  readonly canAdministerActiveOrganization = computed(
    () => Boolean(this.activeOrganizationId()) && this.contextService.isAreaAllowed('org-admin'),
  );
  readonly organizations = this.organizationsState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();
  readonly orgInvitations = this.orgInvitationsState.asReadonly();
  readonly myInvitations = this.myInvitationsState.asReadonly();
  readonly pageTitle = computed(() =>
    this.isEndUserRoute() ? 'Organizations' : 'Organization Overview',
  );
  readonly pageTestId = computed(
    () => (this.route.snapshot.data['testId'] as string) ?? 'page-org-overview',
  );
  readonly sectionLabel = computed(() =>
    this.isEndUserRoute() ? 'End-User Workspace' : 'Organization Administration',
  );
  readonly pageDescription = computed(() =>
    this.isEndUserRoute()
      ? 'Create organizations, review invitations, and enter organization workspaces from your account.'
      : 'Manage memberships, invitations, and organization access for the active organization.',
  );

  constructor() {
    effect(() => {
      const organizationId = this.activeOrganizationId();
      void organizationId;
      void this.reload();
    });
  }

  async createOrganization() {
    const trimmedName = this.organizationName.trim();
    if (!trimmedName) {
      this.errorMessage.set('Organization name is required.');
      return;
    }

    try {
      this.errorMessage.set(null);
      const created = await this.orgApi.createOrganization(trimmedName);
      this.organizationName = '';
      if (!this.activeOrganizationId()) {
        await this.enterOrganization({
          id: created.organization.id,
          membershipRole: 'admin',
        });
        return;
      }

      await this.refreshSession();
      await this.reload();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to create organization.',
      );
    }
  }

  async sendInvitation() {
    if (!this.activeOrganizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      const invitation = await this.orgApi.createInvitation({
        organizationId: this.activeOrganizationId()!,
        email: this.inviteEmail,
        role: this.inviteRole,
      });
      this.orgInvitationsState.set([invitation, ...this.orgInvitationsState()]);
      this.inviteEmail = '';
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to invite member.');
    }
  }

  async acceptInvitation(inviteCode: string) {
    try {
      this.errorMessage.set(null);
      await this.orgApi.acceptInvitation(inviteCode);
      await this.refreshSession();
      await this.reload();
      this.errorMessage.set(null);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to accept invitation.',
      );
    }
  }

  async enterOrganization(org: { id: string; membershipRole: 'admin' | 'member' }) {
    try {
      this.errorMessage.set(null);
      const session = await this.authState.switchContext({
        contextType: 'organization',
        organizationId: org.id,
      });
      this.contextService.applySessionSnapshot(session);
      await this.router.navigateByUrl(
        org.membershipRole === 'admin' ? '/org/overview' : '/home',
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to enter organization workspace.',
      );
    }
  }

  private async reload() {
    try {
      this.errorMessage.set(null);

      if (this.isEndUserRoute()) {
        const [organizations, myInvitations] = await Promise.all([
          this.orgApi.listOrganizations(),
          this.orgApi.listMyInvitations(),
        ]);
        this.organizationsState.set(organizations);
        this.myInvitationsState.set(myInvitations);
        this.membershipsState.set([]);
        this.orgInvitationsState.set([]);
        return;
      }

      this.organizationsState.set([]);
      this.myInvitationsState.set([]);

      if (this.canAdministerActiveOrganization() && this.activeOrganizationId()) {
        const [memberships, invitations] = await Promise.all([
          this.orgApi.listMemberships(this.activeOrganizationId()!),
          this.orgApi.listOrganizationInvitations(this.activeOrganizationId()!),
        ]);
        this.membershipsState.set(memberships);
        this.orgInvitationsState.set(invitations);
      } else {
        this.membershipsState.set([]);
        this.orgInvitationsState.set([]);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load organization overview.',
      );
    }
  }

  private async refreshSession() {
    const session = await this.authState.loadSession();
    this.contextService.applySessionSnapshot(session);
  }

  isEndUserRoute() {
    return (this.route.snapshot.data['area'] as string | undefined) === 'end-user';
  }

  formatRole(role: 'admin' | 'member') {
    return role === 'admin' ? 'Admin' : 'Member';
  }

  organizationCta(org: { id: string; membershipRole: 'admin' | 'member' }) {
    if (this.activeOrganizationId() === org.id) {
      return org.membershipRole === 'admin' ? 'Open admin view' : 'Open workspace';
    }

    return org.membershipRole === 'admin' ? 'Enter admin workspace' : 'Enter workspace';
  }

  formatDateTime(value?: string) {
    if (!value) {
      return 'unknown';
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
