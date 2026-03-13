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
    <section class="ui-page" [attr.data-testid]="pageTestId()">
      <div class="ui-card stack">
        <p class="ui-kicker">{{ sectionLabel() }}</p>
        <h1>{{ pageTitle() }}</h1>
        <p class="ui-copy">
          {{ pageDescription() }}
        </p>

        <div class="ui-toolbar" *ngIf="isEndUserRoute()">
          <label class="ui-field grow">
            <span>New organization name</span>
            <input [(ngModel)]="organizationName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="createOrganization()">
            Create organization
          </button>
        </div>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>

        <div class="grid two" *ngIf="isEndUserRoute()">
          <article class="ui-panel">
            <h2>My organizations</h2>
            <ul class="simple-list">
              <li *ngFor="let org of organizations()" data-testid="org-row">
                <div class="stack-tight">
                  <strong>{{ org.name }}</strong>
                  <span class="ui-chip">{{ formatRole(org.membershipRole) }}</span>
                </div>
                <button
                  class="ui-button ui-button-secondary"
                  type="button"
                  (click)="enterOrganization(org.id)"
                >
                  {{ activeOrganizationId() === org.id ? 'Open admin view' : 'Enter workspace' }}
                </button>
              </li>
              <li *ngIf="organizations().length === 0" class="ui-copy">
                No organizations yet. Create one here to start an organization workspace.
              </li>
            </ul>
          </article>

          <article class="ui-panel">
            <h2>My pending invitations</h2>
            <ul class="simple-list">
              <li *ngFor="let invitation of myInvitations()" data-testid="org-invite-row">
                <div>
                  <strong>{{ invitation.organizationName }}</strong>
                  <p class="ui-copy">
                    {{ formatRole(invitation.role) }} · expires {{ invitation.expiresAt }}
                  </p>
                </div>
                <button
                  class="ui-button ui-button-secondary"
                  type="button"
                  (click)="acceptInvitation(invitation.inviteCode)"
                >
                  Accept
                </button>
              </li>
              <li *ngIf="myInvitations().length === 0" class="ui-copy">No pending invitations.</li>
            </ul>
          </article>
        </div>

        <article class="ui-panel" *ngIf="!isEndUserRoute() && canAdministerActiveOrganization()">
          <h2>Organization members</h2>
          <p class="ui-copy">
            Members for {{ activeOrganizationLabel() }}. Invite new people below and manage
            existing members from this organization context.
          </p>
          <ul class="simple-list">
            <li *ngFor="let member of memberships()" data-testid="org-member-row">
              <strong>{{ member.name }}</strong>
              <span>{{ member.email }}</span>
              <span class="ui-chip">{{ formatRole(member.role) }}</span>
            </li>
            <li *ngIf="memberships().length === 0" class="ui-copy">No members found.</li>
          </ul>

          <h3>Invite member</h3>
          <p class="ui-copy">
            Invitations are issued to the recipient email address. Delivery is queued for email
            processing; the preview code remains visible in development.
          </p>
          <div class="ui-toolbar">
            <label class="ui-field grow">
              <span>Email</span>
              <input [(ngModel)]="inviteEmail" [ngModelOptions]="{ standalone: true }" />
            </label>
            <label class="ui-field">
              <span>Role</span>
              <select [(ngModel)]="inviteRole" [ngModelOptions]="{ standalone: true }">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button class="ui-button ui-button-primary" type="button" (click)="sendInvitation()">
              Send invite
            </button>
          </div>

          <h3>Pending invitations</h3>
          <ul class="simple-list">
            <li *ngFor="let invitation of orgInvitations()" data-testid="org-admin-invite-row">
              <strong>{{ invitation.invitedEmail }}</strong>
              <span>{{ formatRole(invitation.role) }}</span>
              <small class="ui-copy" *ngIf="invitation.previewInviteCode">
                Dev preview code: {{ invitation.previewInviteCode }}
              </small>
            </li>
            <li *ngIf="orgInvitations().length === 0" class="ui-copy">No pending invitations.</li>
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
        await this.enterOrganization(created.organization.id);
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

  async enterOrganization(organizationId: string) {
    try {
      this.errorMessage.set(null);
      const session = await this.authState.switchContext({
        contextType: 'organization',
        organizationId,
      });
      this.contextService.applySessionSnapshot(session);
      await this.router.navigateByUrl('/org/overview');
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
}
