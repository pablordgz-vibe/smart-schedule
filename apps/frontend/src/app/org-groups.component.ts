import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipSummary, OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" data-testid="page-org-groups">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">Organization Administration</p>
        <h1>Groups</h1>
        <p class="text-sm leading-6 text-base-content/65">Create organization groups and manage member add/remove actions.</p>

        <div class="flex flex-wrap items-end gap-3" *ngIf="organizationId()">
          <label class="form-control grow gap-2">
            <span>New group name</span>
            <input class="input input-bordered w-full" [(ngModel)]="groupName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <button class="btn btn-neutral" type="button" (click)="createGroup()">
            Create group
          </button>
        </div>

        <p *ngIf="errorMessage()" class="alert alert-error">{{ errorMessage() }}</p>

        <section class="grid gap-4" *ngIf="organizationId(); else noContext">
          <article class="rounded-box border border-base-300 bg-base-100 p-4 space-y-4" *ngFor="let group of groups()" data-testid="org-group-row">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">{{ group.name }}</h2>
                <p class="text-sm text-base-content/60">{{ group.members.length }} members</p>
              </div>
              <div class="stack-tight">
                <label class="form-control grow gap-2">
                  <span>Search members by name or email</span>
                  <input
                    class="input input-bordered w-full"
                    [(ngModel)]="groupMemberQueries[group.id]"
                    [ngModelOptions]="{ standalone: true }"
                    placeholder="Search members"
                  />
                </label>
                <ul class="simple-list nested">
                  <li
                    *ngFor="let member of availableMembersForGroup(group)"
                    class="group-member-search-row"
                  >
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <strong>{{ member.name }}</strong>
                      <span class="text-sm text-base-content/60">{{ member.email }}</span>
                    </div>
                    <button
                      class="btn btn-outline"
                      type="button"
                      (click)="addMember(group.id, member.userId)"
                    >
                      Add to group
                    </button>
                  </li>
                  <li *ngIf="availableMembersForGroup(group).length === 0" class="text-sm text-base-content/60">
                    No matching organization members available to add.
                  </li>
                </ul>
              </div>

              <ul class="simple-list nested">
                <li *ngFor="let member of group.members" class="group-member-search-row">
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <strong>{{ member.name }}</strong>
                    <span class="text-sm text-base-content/60">{{ member.email }}</span>
                  </div>
                  <button class="btn btn-outline" type="button" (click)="removeMember(group.id, member.userId)">
                    Remove
                  </button>
                </li>
                <li *ngIf="group.members.length === 0" class="text-sm text-base-content/60">No members in this group.</li>
              </ul>
            </article>
          <p *ngIf="groups().length === 0" class="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/60">No groups yet.</p>
        </section>

        <ng-template #noContext>
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>Organization context required</h2>
            <p class="text-sm leading-6 text-base-content/65">Switch into an organization context to manage groups.</p>
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
