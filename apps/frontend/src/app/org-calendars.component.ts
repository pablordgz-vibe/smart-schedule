import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipSummary, OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-calendars',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" data-testid="page-org-calendars">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
          Organization Administration
        </p>
        <h1>Organization Calendars</h1>
        <p class="text-sm leading-6 text-base-content/65">
          Create organization calendars and manage user visibility grants and revocations.
        </p>

        <div class="flex flex-wrap items-end gap-3" *ngIf="organizationId()">
          <label class="form-control grow gap-2">
            <span>Calendar name</span>
            <input
              class="input input-bordered w-full"
              [(ngModel)]="calendarName"
              [ngModelOptions]="{ standalone: true }"
            />
          </label>
          <label class="form-control gap-2">
            <span>Owner</span>
            <select
              class="select select-bordered w-full"
              [(ngModel)]="ownerUserId"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="">Organization-owned</option>
              <option *ngFor="let member of memberships()" [value]="member.userId">
                {{ member.name }}
              </option>
            </select>
          </label>
          <button class="btn btn-neutral" type="button" (click)="createCalendar()">
            Create calendar
          </button>
        </div>

        <p *ngIf="errorMessage()" class="alert alert-error">{{ errorMessage() }}</p>

        <div class="grid gap-4 xl:grid-cols-2" *ngIf="organizationId(); else noContext">
          <article class="rounded-box border border-base-300 bg-base-100 p-4 space-y-4">
            <div class="space-y-1">
              <h2>Calendars in this organization</h2>
              <p class="text-sm leading-6 text-base-content/65">
                Organization-owned calendars are visible to all members. User-owned calendars stay
                limited to the owner unless explicit grants are added.
              </p>
            </div>

            <ul class="grid gap-3">
              <li
                *ngFor="let calendar of calendars()"
                class="rounded-box border border-base-300 bg-base-100 p-4 space-y-3"
                data-testid="org-calendar-row"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-1">
                    <strong class="text-base">{{ calendar.name }}</strong>
                    <p class="text-sm text-base-content/60">
                      Owner: {{ ownerLabel(calendar.ownerUserId) }}
                    </p>
                  </div>
                  <span class="badge badge-outline">
                    {{ visibilityModeLabel(calendar) }}
                  </span>
                </div>

                <div *ngIf="calendar.defaultVisibility === 'owner-and-grants'" class="space-y-2">
                  <p class="text-sm font-medium">Explicit visibility grants</p>
                  <div
                    class="flex flex-wrap gap-2"
                    *ngIf="calendar.visibilityGrants.length > 0; else noGrants"
                  >
                    <button
                      *ngFor="let grant of calendar.visibilityGrants"
                      class="btn btn-outline btn-sm"
                      type="button"
                      (click)="revokeVisibilityFor(calendar.id, grant.userId)"
                    >
                      {{ grant.name }} ×
                    </button>
                  </div>
                  <ng-template #noGrants>
                    <p class="text-sm text-base-content/60">
                      Only the owner can currently see this calendar.
                    </p>
                  </ng-template>
                </div>
              </li>
              <li *ngIf="calendars().length === 0" class="text-sm text-base-content/60">
                No calendars in this context.
              </li>
            </ul>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4 space-y-4">
            <h2>Manage visibility</h2>
            <p class="text-sm leading-6 text-base-content/65">
              Select a user-owned calendar, then grant access to additional members. Revoke
              individual grants directly from the calendar cards.
            </p>
            <div class="grid gap-4">
              <label class="form-control gap-2">
                <span>Calendar</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="grantCalendarId"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">Select calendar</option>
                  <option *ngFor="let calendar of grantableCalendars()" [value]="calendar.id">
                    {{ calendar.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>User</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="grantUserId"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">Select user</option>
                  <option *ngFor="let member of availableGrantTargets()" [value]="member.userId">
                    {{ member.name }} · {{ member.email }}
                  </option>
                </select>
              </label>
            </div>
            <div class="flex flex-wrap items-end gap-3">
              <button class="btn btn-outline" type="button" (click)="grantVisibility()">
                Grant calendar visibility
              </button>
            </div>
          </article>
        </div>

        <ng-template #noContext>
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>Organization context required</h2>
            <p class="text-sm leading-6 text-base-content/65">
              Switch into an organization context to manage organization calendars.
            </p>
          </article>
        </ng-template>
      </div>
    </section>
  `,
})
export class OrgCalendarsComponent {
  private readonly orgApi = inject(OrgApiService);

  calendarName = '';
  ownerUserId = '';
  grantCalendarId = '';
  grantUserId = '';

  private readonly calendarsState = signal<
    Array<{
      defaultVisibility: 'all-members' | 'owner-and-grants';
      id: string;
      name: string;
      ownerUserId: string | null;
      visibilityGrants: Array<{ userId: string; name: string; email: string }>;
    }>
  >([]);
  private readonly membershipsState = signal<MembershipSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly organizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly calendars = this.calendarsState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();
  readonly selectedGrantCalendar = computed(
    () => this.calendarsState().find((calendar) => calendar.id === this.grantCalendarId) ?? null,
  );
  readonly grantableCalendars = computed(() =>
    this.calendarsState().filter((calendar) => calendar.defaultVisibility === 'owner-and-grants'),
  );
  readonly availableGrantTargets = computed(() => {
    const selectedCalendar = this.selectedGrantCalendar();
    if (!selectedCalendar) {
      return [];
    }

    const grantedUserIds = new Set(selectedCalendar.visibilityGrants.map((grant) => grant.userId));

    return this.membershipsState().filter(
      (member) =>
        member.userId !== selectedCalendar.ownerUserId && !grantedUserIds.has(member.userId),
    );
  });

  constructor() {
    effect(() => {
      const organizationId = this.organizationId();
      void organizationId;
      void this.reload();
    });
  }

  async createCalendar() {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.createCalendar({
        organizationId: this.organizationId()!,
        name: this.calendarName,
        ownerUserId: this.ownerUserId.trim() || undefined,
      });
      this.calendarName = '';
      this.ownerUserId = '';
      await this.reload();
      this.syncGrantSelection();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to create calendar.');
    }
  }

  async grantVisibility() {
    if (!this.organizationId()) {
      return;
    }

    if (!this.grantCalendarId || !this.grantUserId) {
      this.errorMessage.set('Select both a calendar and a user.');
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.grantCalendarVisibility(
        this.organizationId()!,
        this.grantCalendarId,
        this.grantUserId,
      );
      this.grantUserId = '';
      await this.reload();
      this.syncGrantSelection();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to grant visibility.');
    }
  }

  async revokeVisibilityFor(calendarId: string, userId: string) {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.revokeCalendarVisibility(this.organizationId()!, calendarId, userId);
      await this.reload();
      this.syncGrantSelection();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to revoke visibility.',
      );
    }
  }

  private async reload() {
    if (!this.organizationId()) {
      this.calendarsState.set([]);
      this.membershipsState.set([]);
      return;
    }

    try {
      this.errorMessage.set(null);
      const [calendars, memberships] = await Promise.all([
        this.orgApi.listCalendars(this.organizationId()!),
        this.orgApi.listMemberships(this.organizationId()!),
      ]);
      this.calendarsState.set(calendars);
      this.membershipsState.set(memberships);
      this.syncGrantSelection();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load calendars.');
    }
  }

  ownerLabel(userId: string | null) {
    if (!userId) {
      return 'Organization';
    }

    return this.membershipsState().find((member) => member.userId === userId)?.name ?? userId;
  }

  visibilityModeLabel(calendar: {
    defaultVisibility: 'all-members' | 'owner-and-grants';
    visibilityGrants: Array<{ userId: string }>;
  }) {
    if (calendar.defaultVisibility === 'all-members') {
      return 'Visible to all members';
    }

    return calendar.visibilityGrants.length > 0
      ? `${calendar.visibilityGrants.length} explicit grant${
          calendar.visibilityGrants.length === 1 ? '' : 's'
        }`
      : 'Owner only';
  }

  private syncGrantSelection() {
    const grantableCalendars = this.grantableCalendars();

    if (!grantableCalendars.some((calendar) => calendar.id === this.grantCalendarId)) {
      this.grantCalendarId = grantableCalendars[0]?.id ?? '';
    }

    if (!this.availableGrantTargets().some((member) => member.userId === this.grantUserId)) {
      this.grantUserId = this.availableGrantTargets()[0]?.userId ?? '';
    }
  }
}
