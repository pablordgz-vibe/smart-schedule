import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrgApiService } from './org-api.service';

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
                <label class="ui-field">
                  <span>User id</span>
                  <input
                    [(ngModel)]="groupMemberInputs[group.id]"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </label>
                <div class="ui-toolbar">
                  <button
                    class="ui-button ui-button-secondary"
                    type="button"
                    (click)="addMember(group.id)"
                  >
                    Add user
                  </button>
                  <button class="ui-button" type="button" (click)="removeMember(group.id)">
                    Remove user
                  </button>
                </div>
              </div>

              <ul class="simple-list nested">
                <li *ngFor="let member of group.members">{{ member.name }} ({{ member.email }})</li>
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
  readonly groupMemberInputs: Record<string, string> = {};

  readonly errorMessage = signal<string | null>(null);
  private readonly groupsState = signal<
    Array<{
      id: string;
      members: Array<{ userId: string; name: string; email: string }>;
      name: string;
    }>
  >([]);

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

  async addMember(groupId: string) {
    if (!this.organizationId()) {
      return;
    }

    const userId = (this.groupMemberInputs[groupId] ?? '').trim();
    if (!userId) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.addGroupMember(this.organizationId()!, groupId, userId);
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to add member.');
    }
  }

  async removeMember(groupId: string) {
    if (!this.organizationId()) {
      return;
    }

    const userId = (this.groupMemberInputs[groupId] ?? '').trim();
    if (!userId) {
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
      return;
    }

    try {
      this.errorMessage.set(null);
      this.groupsState.set(await this.orgApi.listGroups(this.organizationId()!));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load groups.');
    }
  }
}
