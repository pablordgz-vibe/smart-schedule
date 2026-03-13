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
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">Organization Administration</p>
        <h1>Organization Calendars</h1>
        <p class="text-sm leading-6 text-base-content/65">
          Create organization calendars and manage user visibility grants and revocations.
        </p>

        <div class="flex flex-wrap items-end gap-3" *ngIf="organizationId()">
          <label class="form-control grow gap-2">
            <span>Calendar name</span>
            <input class="input input-bordered w-full" [(ngModel)]="calendarName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <label class="form-control gap-2">
            <span>Owner</span>
            <select class="select select-bordered w-full" [(ngModel)]="ownerUserId" [ngModelOptions]="{ standalone: true }">
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
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>Visible calendars in active organization</h2>
            <ul class="simple-list">
              <li *ngFor="let calendar of calendars()" data-testid="org-calendar-row">
                <strong>{{ calendar.name }}</strong>
                <span class="text-sm text-base-content/60">owner: {{ ownerLabel(calendar.ownerUserId) }}</span>
              </li>
              <li *ngIf="calendars().length === 0" class="text-sm text-base-content/60">
                No calendars in this context.
              </li>
            </ul>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4 space-y-4">
            <h2>Manage visibility</h2>
            <div class="grid gap-4">
              <label class="form-control gap-2">
                <span>Calendar</span>
                <select class="select select-bordered w-full" [(ngModel)]="grantCalendarId" [ngModelOptions]="{ standalone: true }">
                  <option value="">Select calendar</option>
                  <option *ngFor="let calendar of calendars()" [value]="calendar.id">
                    {{ calendar.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>User</span>
                <select class="select select-bordered w-full" [(ngModel)]="grantUserId" [ngModelOptions]="{ standalone: true }">
                  <option value="">Select user</option>
                  <option *ngFor="let member of memberships()" [value]="member.userId">
                    {{ member.name }} · {{ member.email }}
                  </option>
                </select>
              </label>
            </div>
            <div class="flex flex-wrap items-end gap-3">
              <button class="btn btn-outline" type="button" (click)="grantVisibility()">
                Grant calendar visibility
              </button>
              <button class="btn btn-outline" type="button" (click)="revokeVisibility()">
                Revoke calendar visibility
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
    Array<{ id: string; name: string; ownerUserId: string | null }>
  >([]);
  private readonly membershipsState = signal<MembershipSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly organizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly calendars = this.calendarsState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();

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
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to grant visibility.');
    }
  }

  async revokeVisibility() {
    if (!this.organizationId()) {
      return;
    }

    if (!this.grantCalendarId || !this.grantUserId) {
      this.errorMessage.set('Select both a calendar and a user.');
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.orgApi.revokeCalendarVisibility(
        this.organizationId()!,
        this.grantCalendarId,
        this.grantUserId,
      );
      await this.reload();
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
}
