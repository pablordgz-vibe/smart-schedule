import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipSummary, OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-org-groups">
      <div class="ui-card stack">
        <p class="ui-kicker">Organization Administration</p>
        <h1>Groups</h1>
        <p class="ui-copy">Create organization groups and manage member add/remove actions.</p>

        <div class="ui-toolbar" *ngIf="organizationId()">
          <label class="ui-field grow">
            <span>New group name</span>
            <input [(ngModel)]="groupName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="createGroup()">
            Create group
          </button>
        </div>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>

        <article class="ui-panel" *ngIf="organizationId(); else noContext">
          <h2>Groups</h2>
          <ul class="simple-list">
            <li *ngFor="let group of groups()" data-testid="org-group-row">
              <div class="stack-tight">
                <strong>{{ group.name }}</strong>
                <span class="ui-copy">id: {{ group.id }}</span>
                <span class="ui-copy">members: {{ group.members.length }}</span>
              </div>

              <div class="stack-tight">
                <label class="ui-field grow">
                  <span>Search members by name or email</span>
                  <input
                    [(ngModel)]="groupMemberQueries[group.id]"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </label>
                <ul class="simple-list nested">
                  <li
                    *ngFor="let member of availableMembersForGroup(group)"
                    class="group-member-search-row"
                  >
                    <div class="stack-tight">
                      <strong>{{ member.name }}</strong>
                      <span class="ui-copy">{{ member.email }}</span>
                    </div>
                    <button
                      class="ui-button ui-button-secondary"
                      type="button"
                      (click)="addMember(group.id, member.userId)"
                    >
                      Add to group
                    </button>
                  </li>
                  <li *ngIf="availableMembersForGroup(group).length === 0" class="ui-copy">
                    No matching organization members available to add.
                  </li>
                </ul>
              </div>

              <ul class="simple-list nested">
                <li *ngFor="let member of group.members" class="group-member-search-row">
                  <div class="stack-tight">
                    <strong>{{ member.name }}</strong>
                    <span class="ui-copy">{{ member.email }}</span>
                  </div>
                  <button class="ui-button" type="button" (click)="removeMember(group.id, member.userId)">
                    Remove
                  </button>
                </li>
                <li *ngIf="group.members.length === 0" class="ui-copy">No members in this group.</li>
              </ul>
            </li>
          </ul>
        </article>

        <ng-template #noContext>
          <article class="ui-panel">
            <h2>Organization context required</h2>
            <p class="ui-copy">Switch into an organization context to manage groups.</p>
          </article>
        </ng-template>
      </div>
    </section>
  `,
})
export class OrgGroupsComponent {
  private readonly orgApi = inject(OrgApiService);

  groupName = '';
  readonly groupMemberQueries: Record<string, string> = {};

  readonly errorMessage = signal<string | null>(null);
  private readonly groupsState = signal<
    Array<{
      id: string;
      members: Array<{ userId: string; name: string; email: string }>;
      name: string;
    }>
  >([]);
  private readonly membershipsState = signal<MembershipSummary[]>([]);

  readonly organizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly groups = this.groupsState.asReadonly();

  constructor() {
    effect(() => {
      const organizationId = this.organizationId();
      void organizationId;
      void this.reload();
    });
  }

  async createGroup() {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.createGroup(this.organizationId()!, this.groupName);
      this.groupName = '';
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to create group.');
    }
  }

  async addMember(groupId: string, userId: string) {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.addGroupMember(this.organizationId()!, groupId, userId);
      this.groupMemberQueries[groupId] = '';
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to add member.');
    }
  }

  async removeMember(groupId: string, userId: string) {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.removeGroupMember(this.organizationId()!, groupId, userId);
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to remove member.');
    }
  }

  private async reload() {
    if (!this.organizationId()) {
      this.groupsState.set([]);
      this.membershipsState.set([]);
      return;
    }

    try {
      this.errorMessage.set(null);
      const [groups, memberships] = await Promise.all([
        this.orgApi.listGroups(this.organizationId()!),
        this.orgApi.listMemberships(this.organizationId()!),
      ]);
      this.groupsState.set(groups);
      this.membershipsState.set(memberships);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load groups.');
    }
  }

  availableMembersForGroup(group: {
    members: Array<{ email: string; name: string; userId: string }>;
    id: string;
  }) {
    const query = (this.groupMemberQueries[group.id] ?? '').trim().toLowerCase();
    const existingIds = new Set(group.members.map((member) => member.userId));

    return this.membershipsState()
      .filter((member) => !existingIds.has(member.userId))
      .filter(
        (member) =>
          query.length === 0 ||
          member.name.toLowerCase().includes(query) ||
          member.email.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }
}
