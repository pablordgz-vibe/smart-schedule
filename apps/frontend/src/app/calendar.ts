import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CalApiService, type CalendarSummary } from './cal-api.service';
import { ContextService } from './context.service';
import { TimeApiService, type AdvisoryResult } from './time-api.service';

type CalendarEntry = {
  id: string;
  itemType: 'event' | 'task';
  title: string;
  calendarEntryType: 'event' | 'linked_work_event' | 'task_due';
  calendarIds: string[];
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  linkedTaskId?: string | null;
  timezone?: string;
};

type TaskSummary = {
  id: string;
  title: string;
  allocation?: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
};

type PendingCreate = {
  kind: 'event' | 'task';
  payload: Record<string, unknown>;
};

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="ui-page" data-testid="page-calendar">
      <article class="ui-card">
        <p class="ui-kicker">End-User Workspace</p>
        <h1>Calendar</h1>
        <p class="ui-copy">
          Aggregate calendar for {{ contextLabel() }}. Tasks without deadlines are excluded from
          this grid.
        </p>

        <div class="ui-toolbar">
          <label class="ui-field compact-field">
            <span>From</span>
            <input class="ui-input" type="datetime-local" [(ngModel)]="from" />
          </label>
          <label class="ui-field compact-field">
            <span>To</span>
            <input class="ui-input" type="datetime-local" [(ngModel)]="to" />
          </label>
          <button class="ui-button ui-button-secondary" type="button" (click)="loadView()">
            Refresh view
          </button>
          <a class="ui-button ui-button-secondary" routerLink="/schedules/builder">
            New Schedule
          </a>
        </div>

        <div class="ui-meta-grid">
          <div class="ui-panel">
            <h2>Calendar selector</h2>
            <div class="calendar-list">
              <label *ngFor="let calendar of calendars()" class="calendar-option">
                <input
                  type="checkbox"
                  [checked]="selectedCalendarIds().includes(calendar.id)"
                  (change)="toggleCalendar(calendar.id, $any($event.target).checked)"
                />
                <span>{{ calendar.name }}</span>
                <small>{{ calendar.type }}</small>
              </label>
            </div>
          </div>

          <div class="ui-panel">
            <h2>Legend</h2>
            <ul>
              <li><span class="dot event"></span> Event</li>
              <li><span class="dot linked"></span> Linked work event</li>
              <li><span class="dot due"></span> Task due item</li>
            </ul>
          </div>
        </div>

        <p class="ui-banner ui-banner-warning" *ngIf="error()">{{ error() }}</p>
      </article>

      <article class="ui-card split-card">
        <section>
          <h2>Quick create</h2>

          <form class="ui-toolbar stack" (ngSubmit)="createEvent()">
            <h3>New Event</h3>
            <input
              class="ui-input"
              placeholder="Title"
              [(ngModel)]="eventDraft.title"
              name="event-title"
            />
            <label class="ui-field compact-field">
              <span>All day</span>
              <input type="checkbox" [(ngModel)]="eventDraft.allDay" name="event-all-day" />
            </label>
            <input
              *ngIf="!eventDraft.allDay"
              class="ui-input"
              type="datetime-local"
              [(ngModel)]="eventDraft.startAt"
              name="event-start"
            />
            <input
              *ngIf="!eventDraft.allDay"
              class="ui-input"
              type="datetime-local"
              [(ngModel)]="eventDraft.endAt"
              name="event-end"
            />
            <input
              *ngIf="eventDraft.allDay"
              class="ui-input"
              type="date"
              [(ngModel)]="eventDraft.allDayStartDate"
              name="event-all-day-start"
            />
            <input
              *ngIf="eventDraft.allDay"
              class="ui-input"
              type="date"
              [(ngModel)]="eventDraft.allDayEndDate"
              name="event-all-day-end"
            />
            <select
              class="ui-select"
              [(ngModel)]="eventDraft.linkedTaskId"
              name="event-linked-task"
              (ngModelChange)="refreshLinkedTaskAllocation()"
            >
              <option value="">No linked task</option>
              <option *ngFor="let task of taskSummaries()" [value]="task.id">
                {{ task.title }}
              </option>
            </select>
            <p class="ui-banner ui-banner-warning" *ngIf="linkedTaskAllocationWarning()">
              {{ linkedTaskAllocationWarning() }}
            </p>
            <button class="ui-button ui-button-primary" type="submit">Create event</button>
          </form>

          <form class="ui-toolbar stack" (ngSubmit)="createDeadlineTask()">
            <h3>New deadline task</h3>
            <input
              class="ui-input"
              placeholder="Title"
              [(ngModel)]="deadlineTaskDraft.title"
              name="deadline-task-title"
            />
            <input
              class="ui-input"
              type="datetime-local"
              [(ngModel)]="deadlineTaskDraft.dueAt"
              name="deadline-task-due"
            />
            <button class="ui-button ui-button-primary" type="submit">Create task</button>
          </form>

          <section class="ui-panel stack" *ngIf="advisory()">
            <h3>Conflict and advisory panel</h3>
            <p class="ui-copy">
              Advisory concerns are warnings only. They do not hard-block scheduling by themselves.
            </p>

            <ul class="entry-list">
              <li *ngFor="let concern of advisory()!.concerns" class="entry-item">
                <strong>{{ concern.category }}</strong>
                <p class="ui-copy">{{ concern.message }}</p>
              </li>
            </ul>

            <div class="ui-toolbar">
              <button
                class="ui-button ui-button-primary"
                type="button"
                (click)="proceedWithPending()"
              >
                Proceed anyway
              </button>
              <button
                class="ui-button ui-button-secondary"
                type="button"
                (click)="toggleAlternatives()"
              >
                View alternative slot suggestions
              </button>
              <button class="ui-button ui-button-secondary" type="button" (click)="askAi()">
                Ask AI
              </button>
              <button class="ui-button" type="button" (click)="cancelPending()">Cancel</button>
            </div>

            <p class="ui-copy" *ngIf="aiMessage()">{{ aiMessage() }}</p>

            <ul class="entry-list" *ngIf="showAlternatives()">
              <li *ngFor="let slot of advisory()!.alternativeSlots" class="entry-item">
                <p class="ui-copy">{{ slot.startAt }} to {{ slot.endAt }} · {{ slot.reason }}</p>
                <button
                  class="ui-button ui-button-secondary"
                  type="button"
                  (click)="applyAlternative(slot.startAt, slot.endAt)"
                >
                  Use this slot
                </button>
              </li>
              <li *ngIf="advisory()!.alternativeSlots.length === 0" class="ui-copy">
                No alternative slots available.
              </li>
            </ul>
          </section>
        </section>

        <section>
          <h2>Entries</h2>
          <ul class="entry-list">
            <li
              *ngFor="let entry of entries()"
              class="entry-item"
              [attr.data-kind]="entry.calendarEntryType"
            >
              <div>
                <strong>{{ entry.title }}</strong>
                <p class="ui-copy">
                  {{ entry.calendarEntryType }} ·
                  {{ entry.startAt || entry.dueAt || 'No date' }}
                </p>
              </div>
            </li>
            <li *ngIf="entries().length === 0" class="ui-copy">
              No calendar-placeable items in range.
            </li>
          </ul>
        </section>
      </article>
    </section>
  `,
  styles: [
    `
      .ui-copy {
        color: var(--text-secondary);
      }

      .compact-field {
        min-width: 11rem;
      }

      .split-card {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-6);
      }

      .stack {
        display: grid;
        gap: var(--spacing-3);
        align-items: stretch;
        margin-bottom: var(--spacing-6);
      }

      .entry-list,
      .calendar-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--spacing-2);
      }

      .calendar-option {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
      }

      .entry-item {
        border: 1px solid rgb(148 163 184 / 0.2);
        border-left-width: 5px;
        border-radius: var(--radius-lg);
        padding: var(--spacing-3);
      }

      .entry-item[data-kind='event'] {
        border-left-color: rgb(2 132 199 / 0.75);
      }

      .entry-item[data-kind='linked_work_event'] {
        border-left-color: rgb(217 119 6 / 0.75);
      }

      .entry-item[data-kind='task_due'] {
        border-left-color: rgb(219 39 119 / 0.7);
      }

      .dot {
        display: inline-block;
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 999px;
        margin-right: var(--spacing-2);
      }

      .dot.event {
        background: rgb(2 132 199 / 0.75);
      }

      .dot.linked {
        background: rgb(217 119 6 / 0.75);
      }

      .dot.due {
        background: rgb(219 39 119 / 0.75);
      }

      @media (max-width: 900px) {
        .split-card {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CalendarComponent {
  private readonly calApi = inject(CalApiService);
  private readonly contextService = inject(ContextService);
  private readonly timeApi = inject(TimeApiService);

  readonly contextLabel = computed(() => this.contextService.getContextLabel());

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly selectedCalendarIds = signal<string[]>([]);
  readonly entries = signal<CalendarEntry[]>([]);
  readonly error = signal<string | null>(null);
  readonly taskSummaries = signal<TaskSummary[]>([]);
  readonly linkedTaskAllocationWarning = signal<string | null>(null);
  readonly advisory = signal<AdvisoryResult | null>(null);
  readonly pendingCreate = signal<PendingCreate | null>(null);
  readonly showAlternatives = signal(false);
  readonly aiMessage = signal<string | null>(null);

  from = this.isoLocalValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
  to = this.isoLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  eventDraft = {
    allDay: false,
    allDayEndDate: '',
    allDayStartDate: '',
    endAt: this.isoLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    linkedTaskId: '',
    startAt: this.isoLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
    title: '',
  };

  deadlineTaskDraft = {
    dueAt: this.isoLocalValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
    title: '',
  };

  constructor() {
    void this.bootstrap();
  }

  async bootstrap() {
    this.error.set(null);
    try {
      const [calendars, tasks] = await Promise.all([
        this.calApi.listCalendars(),
        this.calApi.listTasks({ deadlinePeriod: 'all', priority: 'all', status: 'all' }),
      ]);
      this.calendars.set(calendars);
      this.selectedCalendarIds.set(calendars.map((calendar) => calendar.id));
      this.taskSummaries.set(
        (tasks as TaskSummary[]).map((task) => ({
          allocation: task.allocation,
          id: task.id,
          title: task.title,
        })),
      );
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load calendar view.');
    }
  }

  async loadView() {
    this.error.set(null);
    try {
      const from = new Date(this.from).toISOString();
      const to = new Date(this.to).toISOString();
      const view = await this.calApi.listCalendarView({
        calendarIds: this.selectedCalendarIds(),
        from,
        to,
      });
      this.entries.set(view.entries as CalendarEntry[]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load calendar entries.');
    }
  }

  toggleCalendar(calendarId: string, checked: boolean) {
    const next = checked
      ? [...this.selectedCalendarIds(), calendarId]
      : this.selectedCalendarIds().filter((id) => id !== calendarId);
    this.selectedCalendarIds.set(Array.from(new Set(next)));
  }

  async refreshLinkedTaskAllocation() {
    this.linkedTaskAllocationWarning.set(null);
    if (!this.eventDraft.linkedTaskId) {
      return;
    }

    try {
      const task = (await this.calApi.getTask(this.eventDraft.linkedTaskId)) as {
        allocation: {
          allocatedMinutes: number;
          estimateMinutes: number | null;
          overAllocated: boolean;
          remainingMinutes: number | null;
        };
      };

      if (task.allocation.estimateMinutes != null) {
        const warning = `${task.allocation.allocatedMinutes}m allocated of ${task.allocation.estimateMinutes}m estimate.`;
        this.linkedTaskAllocationWarning.set(
          task.allocation.overAllocated
            ? `${warning} This task is already over-allocated.`
            : warning,
        );
      }
    } catch {
      this.linkedTaskAllocationWarning.set('Could not load linked-task allocation details.');
    }
  }

  async createEvent() {
    this.error.set(null);
    try {
      if (!this.eventDraft.title.trim()) {
        throw new Error('Event title is required.');
      }

      const payload: Record<string, unknown> = {
        allDay: this.eventDraft.allDay,
        calendarIds: this.selectedCalendarIds(),
        title: this.eventDraft.title,
      };

      if (this.eventDraft.allDay) {
        payload['allDayStartDate'] = this.eventDraft.allDayStartDate;
        payload['allDayEndDate'] = this.eventDraft.allDayEndDate;
      } else {
        payload['startAt'] = new Date(this.eventDraft.startAt).toISOString();
        payload['endAt'] = new Date(this.eventDraft.endAt).toISOString();
      }

      if (this.eventDraft.linkedTaskId) {
        payload['linkedTaskId'] = this.eventDraft.linkedTaskId;
      }

      const advisory = await this.timeApi.evaluateAdvisory({
        allDay: this.eventDraft.allDay,
        endAt: this.eventDraft.allDay
          ? new Date(`${this.eventDraft.allDayEndDate}T23:59:00.000Z`).toISOString()
          : (payload['endAt'] as string),
        itemType: 'event',
        startAt: this.eventDraft.allDay
          ? new Date(`${this.eventDraft.allDayStartDate}T00:00:00.000Z`).toISOString()
          : (payload['startAt'] as string),
        title: this.eventDraft.title,
        workRelated: false,
      });

      if (advisory.concerns.length > 0) {
        this.advisory.set(advisory);
        this.pendingCreate.set({ kind: 'event', payload });
        this.showAlternatives.set(false);
        return;
      }

      await this.calApi.createEvent(payload);

      this.eventDraft.title = '';
      this.eventDraft.linkedTaskId = '';
      this.linkedTaskAllocationWarning.set(null);
      this.clearAdvisoryState();
      await this.bootstrap();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create event.');
    }
  }

  async createDeadlineTask() {
    this.error.set(null);
    try {
      if (!this.deadlineTaskDraft.title.trim()) {
        throw new Error('Task title is required.');
      }

      if (!this.deadlineTaskDraft.dueAt) {
        throw new Error('Calendar quick-create requires a task deadline.');
      }

      const payload: Record<string, unknown> = {
        calendarIds: this.selectedCalendarIds(),
        title: this.deadlineTaskDraft.title,
      };
      payload['dueAt'] = new Date(this.deadlineTaskDraft.dueAt).toISOString();

      const advisory = await this.timeApi.evaluateAdvisory({
        dueAt: payload['dueAt'],
        itemType: 'task',
        title: this.deadlineTaskDraft.title,
        workRelated: false,
      });

      if (advisory.concerns.length > 0) {
        this.advisory.set(advisory);
        this.pendingCreate.set({ kind: 'task', payload });
        this.showAlternatives.set(false);
        return;
      }

      await this.calApi.createTask(payload);

      this.deadlineTaskDraft.title = '';
      this.clearAdvisoryState();
      await this.bootstrap();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create task.');
    }
  }

  async proceedWithPending() {
    const pending = this.pendingCreate();
    if (!pending) {
      return;
    }

    this.error.set(null);
    try {
      if (pending.kind === 'event') {
        await this.calApi.createEvent(pending.payload);
        this.eventDraft.title = '';
        this.eventDraft.linkedTaskId = '';
      } else {
        await this.calApi.createTask(pending.payload);
        this.deadlineTaskDraft.title = '';
      }

      this.clearAdvisoryState();
      await this.bootstrap();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create item.');
    }
  }

  cancelPending() {
    this.clearAdvisoryState();
  }

  toggleAlternatives() {
    this.showAlternatives.set(!this.showAlternatives());
  }

  askAi() {
    this.aiMessage.set(
      'AI consultation is available when an AI integration is enabled. Use suggested slots or proceed manually.',
    );
  }

  applyAlternative(startAt: string, endAt: string) {
    const pending = this.pendingCreate();
    if (!pending) {
      return;
    }

    if (pending.kind === 'event') {
      this.eventDraft.startAt = this.isoLocalValue(new Date(startAt));
      this.eventDraft.endAt = this.isoLocalValue(new Date(endAt));
    } else {
      this.deadlineTaskDraft.dueAt = this.isoLocalValue(new Date(startAt));
    }

    this.clearAdvisoryState();
  }

  private clearAdvisoryState() {
    this.advisory.set(null);
    this.pendingCreate.set(null);
    this.showAlternatives.set(false);
    this.aiMessage.set(null);
  }

  private isoLocalValue(date: Date) {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return offsetDate.toISOString().slice(0, 16);
  }
}
