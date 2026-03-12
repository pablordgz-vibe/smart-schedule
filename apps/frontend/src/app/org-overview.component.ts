import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStateService } from './auth-state.service';
import { ContextService } from './context.service';
import { OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-org-overview">
      <div class="ui-card stack">
        <p class="ui-kicker">Organization Administration</p>
        <h1>Organization Overview</h1>
        <p class="ui-copy">
          Manage organizations, memberships, and invitations for the active account.
        </p>

        <div class="ui-toolbar">
          <label class="ui-field grow">
            <span>New organization name</span>
            <input [(ngModel)]="organizationName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="createOrganization()">
            Create organization
          </button>
        </div>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>

        <div class="grid two">
          <article class="ui-panel">
            <h2>My organizations</h2>
            <ul class="simple-list">
              <li *ngFor="let org of organizations()" data-testid="org-row">
                <strong>{{ org.name }}</strong>
                <span class="ui-chip">{{ org.membershipRole }}</span>
              </li>
            </ul>
          </article>

          <article class="ui-panel">
            <h2>My pending invitations</h2>
            <ul class="simple-list">
              <li *ngFor="let invitation of myInvitations()" data-testid="org-invite-row">
                <div>
                  <strong>{{ invitation.organizationName }}</strong>
                  <p class="ui-copy">{{ invitation.role }} · expires {{ invitation.expiresAt }}</p>
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

        <article class="ui-panel" *ngIf="activeOrganizationId()">
          <h2>Active organization memberships</h2>
          <ul class="simple-list">
            <li *ngFor="let member of memberships()" data-testid="org-member-row">
              <strong>{{ member.name }}</strong>
              <span>{{ member.email }}</span>
              <span class="ui-chip">{{ member.role }}</span>
            </li>
          </ul>

          <h3>Invite member</h3>
          <div class="ui-toolbar">
            <label class="ui-field grow">
              <span>Email</span>
              <input [(ngModel)]="inviteEmail" [ngModelOptions]="{ standalone: true }" />
            </label>
            <label class="ui-field">
              <span>Role</span>
              <select [(ngModel)]="inviteRole" [ngModelOptions]="{ standalone: true }">
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button class="ui-button ui-button-primary" type="button" (click)="sendInvitation()">
              Send invite
            </button>
          </div>

          <ul class="simple-list">
            <li *ngFor="let invitation of orgInvitations()" data-testid="org-admin-invite-row">
              <strong>{{ invitation.invitedEmail }}</strong>
              <span>{{ invitation.role }}</span>
              <small class="ui-copy" *ngIf="invitation.previewInviteCode">
                preview code: {{ invitation.previewInviteCode }}
              </small>
            </li>
          </ul>
        </article>
      </div>
    </section>
  `,
})
export class OrgOverviewComponent {
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
  readonly organizations = this.organizationsState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();
  readonly orgInvitations = this.orgInvitationsState.asReadonly();
  readonly myInvitations = this.myInvitationsState.asReadonly();

  constructor() {
    void this.reload();
  }

  async createOrganization() {
    const trimmedName = this.organizationName.trim();
    if (!trimmedName) {
      this.errorMessage.set('Organization name is required.');
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.createOrganization(trimmedName);
      this.organizationName = '';
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
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to accept invitation.',
      );
    }
  }

  private async reload() {
    try {
      this.errorMessage.set(null);
      const [organizations, myInvitations] = await Promise.all([
        this.orgApi.listOrganizations(),
        this.orgApi.listMyInvitations(),
      ]);
      this.organizationsState.set(organizations);
      this.myInvitationsState.set(myInvitations);

      if (this.activeOrganizationId()) {
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
}
