import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MembershipSummary, OrgApiService } from './org-api.service';

@Component({
  selector: 'app-org-calendars',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-org-calendars">
      <div class="ui-card stack">
        <p class="ui-kicker">Organization Administration</p>
        <h1>Organization Calendars</h1>
        <p class="ui-copy">
          Create organization calendars and manage user visibility grants and revocations.
        </p>

        <div class="ui-toolbar" *ngIf="organizationId()">
          <label class="ui-field grow">
            <span>Calendar name</span>
            <input [(ngModel)]="calendarName" [ngModelOptions]="{ standalone: true }" />
          </label>
          <label class="ui-field">
            <span>Owner</span>
            <select [(ngModel)]="ownerUserId" [ngModelOptions]="{ standalone: true }">
              <option value="">Organization-owned</option>
              <option *ngFor="let member of memberships()" [value]="member.userId">
                {{ member.name }}
              </option>
            </select>
          </label>
          <button class="ui-button ui-button-primary" type="button" (click)="createCalendar()">
            Create calendar
          </button>
        </div>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>

        <div class="grid two" *ngIf="organizationId(); else noContext">
          <article class="ui-panel">
            <h2>Visible calendars in active organization</h2>
            <ul class="simple-list">
              <li *ngFor="let calendar of calendars()" data-testid="org-calendar-row">
                <strong>{{ calendar.name }}</strong>
                <span class="ui-copy">owner: {{ ownerLabel(calendar.ownerUserId) }}</span>
              </li>
              <li *ngIf="calendars().length === 0" class="ui-copy">
                No calendars in this context.
              </li>
            </ul>
          </article>

          <article class="ui-panel stack-tight">
            <h2>Manage visibility</h2>
            <label class="ui-field">
              <span>Calendar</span>
              <select [(ngModel)]="grantCalendarId" [ngModelOptions]="{ standalone: true }">
                <option value="">Select calendar</option>
                <option *ngFor="let calendar of calendars()" [value]="calendar.id">
                  {{ calendar.name }}
                </option>
              </select>
            </label>
            <label class="ui-field">
              <span>User</span>
              <select [(ngModel)]="grantUserId" [ngModelOptions]="{ standalone: true }">
                <option value="">Select user</option>
                <option *ngFor="let member of memberships()" [value]="member.userId">
                  {{ member.name }} · {{ member.email }}
                </option>
              </select>
            </label>
            <div class="ui-toolbar">
              <button class="ui-button ui-button-secondary" type="button" (click)="grantVisibility()">
                Grant calendar visibility
              </button>
              <button class="ui-button" type="button" (click)="revokeVisibility()">
                Revoke calendar visibility
              </button>
            </div>
          </article>
        </div>

        <ng-template #noContext>
          <article class="ui-panel">
            <h2>Organization context required</h2>
            <p class="ui-copy">
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
