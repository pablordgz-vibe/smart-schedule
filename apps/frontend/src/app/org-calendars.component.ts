import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrgApiService } from './org-api.service';

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
            <span>Owner user id (optional)</span>
            <input [(ngModel)]="ownerUserId" [ngModelOptions]="{ standalone: true }" />
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
                <span class="ui-copy">owner: {{ calendar.ownerUserId ?? 'organization' }}</span>
              </li>
              <li *ngIf="calendars().length === 0" class="ui-copy">
                No calendars in this context.
              </li>
            </ul>
          </article>

          <article class="ui-panel">
            <h2>Manage visibility</h2>
            <label class="ui-field">
              <span>Calendar id</span>
              <input [(ngModel)]="grantCalendarId" [ngModelOptions]="{ standalone: true }" />
            </label>
            <label class="ui-field">
              <span>User id</span>
              <input [(ngModel)]="grantUserId" [ngModelOptions]="{ standalone: true }" />
            </label>
            <button class="ui-button ui-button-secondary" type="button" (click)="grantVisibility()">
              Grant calendar visibility
            </button>
            <button class="ui-button" type="button" (click)="revokeVisibility()">
              Revoke calendar visibility
            </button>
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
  readonly errorMessage = signal<string | null>(null);

  readonly organizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly calendars = this.calendarsState.asReadonly();

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

    try {
      this.errorMessage.set(null);
      await this.orgApi.grantCalendarVisibility(
        this.organizationId()!,
        this.grantCalendarId.trim(),
        this.grantUserId.trim(),
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

    try {
      this.errorMessage.set(null);
      await this.orgApi.revokeCalendarVisibility(
        this.organizationId()!,
        this.grantCalendarId.trim(),
        this.grantUserId.trim(),
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
      return;
    }

    try {
      this.errorMessage.set(null);
      this.calendarsState.set(await this.orgApi.listCalendars(this.organizationId()!));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load calendars.');
    }
  }
}
