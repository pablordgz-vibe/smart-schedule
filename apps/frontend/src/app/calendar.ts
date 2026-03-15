import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CalApiService,
  type AttachmentSummary,
  type CalendarSummary,
  type ImportedContact,
} from './cal-api.service';
import { ContextService } from './context.service';
import { TimeApiService, type AdvisoryResult } from './time-api.service';

type CalendarEntry = {
  calendarEntryType: 'event' | 'linked_work_event' | 'task_due';
  calendarIds: string[];
  dueAt?: string | null;
  endAt?: string | null;
  id: string;
  itemType: 'event' | 'task';
  linkedTaskId?: string | null;
  startAt?: string | null;
  timezone?: string;
  title: string;
};

type CalendarDayBucket = {
  entries: CalendarEntry[];
  fullLabel: string;
  isInCurrentMonth: boolean;
  isToday: boolean;
  key: string;
  label: string;
  shortLabel: string;
};

type TaskSummary = {
  allocation?: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  id: string;
  title: string;
};

type PendingCreate = {
  kind: 'event' | 'task';
  payload: Record<string, unknown>;
};

type EventDetail = {
  allDay: boolean;
  allDayEndDate: string | null;
  allDayStartDate: string | null;
  allocation: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  attachments: AttachmentSummary[];
  calendars: Array<{ calendarId: string; calendarName: string }>;
  contacts: ImportedContact[];
  durationMinutes: number | null;
  endAt: string | null;
  id: string;
  linkedTaskId: string | null;
  location: string | null;
  notes: string | null;
  provenance: {
    copiedAt: string;
    sourceContextType: 'organization' | 'personal';
    sourceItemId: string;
    sourceOrganizationId: string | null;
  } | null;
  startAt: string | null;
  title: string;
  workRelated: boolean;
};

type CalendarTaskDetail = {
  contacts: ImportedContact[];
  dueAt: string | null;
  id: string;
  location: string | null;
  notes: string | null;
  provenance: {
    copiedAt: string;
    sourceContextType: 'organization' | 'personal';
    sourceItemId: string;
  } | null;
  title: string;
  workRelated: boolean;
};

type EventDraft = {
  allDay: boolean;
  allDayEndDate: string;
  allDayStartDate: string;
  calendarIds: string[];
  contactIds: string[];
  durationMinutes: number | null;
  endAt: string;
  linkedTaskId: string;
  location: string;
  notes: string;
  startAt: string;
  timedEntryMode: 'duration' | 'end';
  title: string;
  workRelated: boolean;
};

type DeadlineTaskDraft = {
  calendarIds: string[];
  contactIds: string[];
  dueAt: string;
  location: string;
  notes: string;
  title: string;
  workRelated: boolean;
};

type AttachmentDraft = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageKey: string;
};

type ContextPanelMode = 'day' | 'create-event' | 'create-task' | 'event' | 'task';

function createAttachmentDraft(): AttachmentDraft {
  return {
    fileName: '',
    fileSizeBytes: 1024,
    mimeType: 'application/octet-stream',
    storageKey: '',
  };
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="grid gap-6" data-testid="page-calendar">
      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
        <div class="card-heading">
          <p class="ui-kicker">End-User Workspace</p>
          <h1>Calendar</h1>
          <p class="ui-copy">
            Click a day to create an item for that date, or click an event or task to inspect it in
            context for {{ contextLabel() }}.
          </p>
        </div>

        <p class="alert alert-warning" *ngIf="error()">{{ error() }}</p>
        <p class="alert alert-info" *ngIf="message()">{{ message() }}</p>
        <p class="alert alert-info" *ngIf="isLoading()">Loading calendar workspace…</p>
      </article>

      <article
        class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-4 overflow-hidden"
      >
        <div class="calendar-grid-header">
          <div>
            <h2>{{ currentMonthLabel() }}</h2>
            <p class="ui-copy">
              Showing {{ selectedCalendarIds().length }} active calendar{{
                selectedCalendarIds().length === 1 ? '' : 's'
              }} in {{ contextLabel() }}.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn btn-outline btn-sm normal-case" type="button" routerLink="/schedules/builder">
              Schedule builder
            </button>
            <button class="btn btn-outline btn-sm" type="button" (click)="openCalendarManager()">
              Switch calendars
            </button>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div class="stack-tight">
            <div class="grid gap-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
              <button class="btn btn-outline" type="button" (click)="goToPreviousMonth()">
                Previous
              </button>
              <label class="ui-field">
                <span>Month</span>
                <select
                  class="select select-bordered w-full"
                  [ngModel]="displayedMonth()"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="setDisplayedMonth($event)"
                >
                  <option *ngFor="let month of monthOptions; let index = index" [ngValue]="index">
                    {{ month }}
                  </option>
                </select>
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="ui-field">
                  <span>Year</span>
                  <input
                    class="input input-bordered w-full"
                    type="number"
                    [ngModel]="displayedYear()"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="setDisplayedYear($event)"
                  />
                </label>
                <label class="ui-field">
                  <span>Week starts on</span>
                  <select
                    class="select select-bordered w-full"
                    [ngModel]="weekStartsOn()"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="setWeekStartsOn($event)"
                  >
                    <option value="monday">Monday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </label>
              </div>
              <button class="btn btn-outline" type="button" (click)="goToNextMonth()">Next</button>
            </div>

            <ng-container *ngIf="!calendarManagerOpen(); else calendarManager">
              <div class="calendar-weekdays">
                <span *ngFor="let weekday of weekdayLabels()">{{ weekday }}</span>
              </div>
              <div class="calendar-workspace" *ngIf="calendarBuckets().length > 0; else invalidRange">
                <ng-container *ngIf="selectedDayBucket() as bucket; else fullCalendar">
                  <div class="focused-day-layout">
                    <article
                      class="card border border-base-300 bg-base-100 shadow-sm day-card day-card-focused"
                    >
                      <div class="card-body gap-4 p-4">
                        <div class="day-card-header">
                          <div>
                            <p class="ui-kicker">{{ bucket.shortLabel }}</p>
                            <h3>{{ bucket.label }}</h3>
                            <p class="ui-copy">{{ bucket.fullLabel }}</p>
                          </div>
                          <div class="badge badge-outline whitespace-nowrap">{{ bucket.entries.length }} items</div>
                        </div>

                        <ul class="day-entry-list">
                          <li
                            *ngFor="let entry of bucket.entries"
                            class="day-entry"
                            [attr.data-kind]="entry.calendarEntryType"
                            [class.selected]="selectedEntryId() === entry.id"
                            (click)="selectEntry(entry)"
                          >
                            <strong>{{ entry.title }}</strong>
                            <span>{{ formatEntryMoment(entry) }}</span>
                          </li>
                          <li *ngIf="bucket.entries.length === 0" class="text-sm text-base-content/60">
                            No items scheduled.
                          </li>
                        </ul>
                      </div>
                    </article>

                    <aside
                      id="calendar-context-panel"
                      class="card border border-base-300 bg-base-100 shadow-sm context-panel"
                    >
                      <div class="card-body gap-4 p-4">
                        <div class="context-panel-toolbar">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="closeFocusedDay()">
                            Back to calendar
                          </button>
                          <div class="context-actions" *ngIf="panelMode() === 'day'">
                            <button
                              class="btn btn-neutral btn-sm"
                              type="button"
                              (click)="openCreateEventForDay(bucket.key)"
                            >
                              New event
                            </button>
                            <button
                              class="btn btn-outline btn-sm"
                              type="button"
                              (click)="openCreateTaskForDay(bucket.key)"
                            >
                              New task
                            </button>
                          </div>
                        </div>

                        <ul class="entry-list compact-list" *ngIf="panelMode() === 'day'">
                          <li *ngIf="bucket.entries.length === 0" class="text-sm text-base-content/60">
                            Create an event or a task for this day.
                          </li>
                          <li
                            *ngFor="let entry of bucket.entries"
                            class="entry-item selectable"
                            [attr.data-kind]="entry.calendarEntryType"
                            [class.selected]="selectedEntryId() === entry.id"
                            (click)="selectEntry(entry)"
                          >
                            <div class="stack-tight">
                              <strong>{{ entry.title }}</strong>
                              <span class="ui-copy">{{ formatEntryMoment(entry) }}</span>
                            </div>
                          </li>
                        </ul>

                        <form
                          class="form-stack compact-stack"
                          *ngIf="panelMode() === 'create-event'"
                          (ngSubmit)="createEvent()"
                        >
                          <div class="join join-horizontal self-start">
                            <button class="btn btn-sm join-item btn-neutral" type="button">Event</button>
                            <button
                              class="btn btn-sm join-item btn-outline"
                              type="button"
                              (click)="openCreateTaskForDay(bucket.key)"
                            >
                              Task
                            </button>
                          </div>
                          <div class="panel-section-title">
                            <h4>Create event</h4>
                            <p class="ui-copy">{{ bucket.fullLabel }}</p>
                          </div>
                          <input
                            class="input input-bordered w-full"
                            placeholder="Title"
                            [(ngModel)]="eventDraft.title"
                            name="event-title"
                          />
                          <textarea
                            class="textarea textarea-bordered w-full"
                            rows="2"
                            placeholder="Notes"
                            [(ngModel)]="eventDraft.notes"
                            name="event-notes"
                          ></textarea>
                          <div class="inline-grid">
                            <label class="checkbox-row">
                              <span>All day</span>
                              <input
                                type="checkbox"
                                [(ngModel)]="eventDraft.allDay"
                                name="event-all-day"
                              />
                            </label>
                            <label class="checkbox-row">
                              <span>Work related</span>
                              <input
                                type="checkbox"
                                [(ngModel)]="eventDraft.workRelated"
                                name="event-work-related"
                              />
                            </label>
                          </div>
                          <div class="inline-grid" *ngIf="!eventDraft.allDay">
                            <input
                              class="input input-bordered w-full"
                              type="datetime-local"
                              [(ngModel)]="eventDraft.startAt"
                              name="event-start"
                              (ngModelChange)="refreshLinkedTaskAllocation()"
                            />
                            <select
                              class="select select-bordered w-full"
                              [(ngModel)]="eventDraft.timedEntryMode"
                              name="event-timed-entry-mode"
                              (ngModelChange)="setEventTimingMode(eventDraft, $event)"
                            >
                              <option value="end">Use end time</option>
                              <option value="duration">Use duration</option>
                            </select>
                            <input
                              *ngIf="eventDraft.timedEntryMode === 'end'"
                              class="input input-bordered w-full"
                              type="datetime-local"
                              [(ngModel)]="eventDraft.endAt"
                              name="event-end"
                              (ngModelChange)="refreshLinkedTaskAllocation()"
                            />
                            <input
                              *ngIf="eventDraft.timedEntryMode === 'duration'"
                              class="input input-bordered w-full"
                              type="number"
                              min="1"
                              max="1440"
                              [(ngModel)]="eventDraft.durationMinutes"
                              name="event-duration"
                              placeholder="Duration (minutes)"
                              (ngModelChange)="refreshLinkedTaskAllocation()"
                            />
                          </div>
                          <div class="inline-grid" *ngIf="eventDraft.allDay">
                            <input
                              class="input input-bordered w-full"
                              type="date"
                              [(ngModel)]="eventDraft.allDayStartDate"
                              name="event-all-day-start"
                            />
                            <input
                              class="input input-bordered w-full"
                              type="date"
                              [(ngModel)]="eventDraft.allDayEndDate"
                              name="event-all-day-end"
                            />
                          </div>
                          <div class="inline-grid">
                            <input
                              class="input input-bordered w-full"
                              placeholder="Location"
                              [(ngModel)]="eventDraft.location"
                              name="event-location"
                            />
                            <select
                              class="select select-bordered w-full"
                              [(ngModel)]="eventDraft.linkedTaskId"
                              name="event-linked-task"
                              (ngModelChange)="refreshLinkedTaskAllocation()"
                            >
                              <option value="">No linked task</option>
                              <option *ngFor="let task of taskSummaries()" [value]="task.id">
                                {{ task.title }}
                              </option>
                            </select>
                          </div>
                          <label class="ui-field">
                            <span>Calendar memberships</span>
                            <select
                              class="select select-bordered w-full"
                              multiple
                              [(ngModel)]="eventDraft.calendarIds"
                              name="event-calendars"
                            >
                              <option *ngFor="let calendar of calendars()" [value]="calendar.id">
                                {{ calendar.name }}
                              </option>
                            </select>
                          </label>
                          <label class="ui-field">
                            <span>Contacts</span>
                            <select
                              class="select select-bordered w-full"
                              multiple
                              [(ngModel)]="eventDraft.contactIds"
                              name="event-contacts"
                            >
                              <option *ngFor="let contact of contacts()" [value]="contact.id">
                                {{ contact.displayName }}
                              </option>
                            </select>
                          </label>
                          <p class="alert alert-warning" *ngIf="linkedTaskAllocationWarning()">
                            {{ linkedTaskAllocationWarning() }}
                          </p>
                          <div class="context-actions">
                            <button class="btn btn-neutral" type="submit">Create event</button>
                            <button class="btn btn-ghost" type="button" (click)="closeFocusedDay()">
                              Cancel
                            </button>
                          </div>
                        </form>

                        <form
                          class="form-stack compact-stack"
                          *ngIf="panelMode() === 'create-task'"
                          (ngSubmit)="createDeadlineTask()"
                        >
                          <div class="join join-horizontal self-start">
                            <button
                              class="btn btn-sm join-item btn-outline"
                              type="button"
                              (click)="openCreateEventForDay(bucket.key)"
                            >
                              Event
                            </button>
                            <button class="btn btn-sm join-item btn-neutral" type="button">Task</button>
                          </div>
                          <div class="panel-section-title">
                            <h4>Create deadline task</h4>
                            <p class="ui-copy">{{ bucket.fullLabel }}</p>
                          </div>
                          <input
                            class="input input-bordered w-full"
                            placeholder="Title"
                            [(ngModel)]="deadlineTaskDraft.title"
                            name="deadline-task-title"
                          />
                          <textarea
                            class="textarea textarea-bordered w-full"
                            rows="2"
                            placeholder="Notes"
                            [(ngModel)]="deadlineTaskDraft.notes"
                            name="deadline-task-notes"
                          ></textarea>
                          <div class="inline-grid">
                            <input
                              class="input input-bordered w-full"
                              type="datetime-local"
                              [(ngModel)]="deadlineTaskDraft.dueAt"
                              name="deadline-task-due"
                            />
                            <input
                              class="input input-bordered w-full"
                              placeholder="Location"
                              [(ngModel)]="deadlineTaskDraft.location"
                              name="deadline-task-location"
                            />
                          </div>
                          <label class="checkbox-row">
                            <span>Work related</span>
                            <input
                              type="checkbox"
                              [(ngModel)]="deadlineTaskDraft.workRelated"
                              name="deadline-task-work-related"
                            />
                          </label>
                          <label class="ui-field">
                            <span>Calendar memberships</span>
                            <select
                              class="select select-bordered w-full"
                              multiple
                              [(ngModel)]="deadlineTaskDraft.calendarIds"
                              name="deadline-task-calendars"
                            >
                              <option *ngFor="let calendar of calendars()" [value]="calendar.id">
                                {{ calendar.name }}
                              </option>
                            </select>
                          </label>
                          <label class="ui-field">
                            <span>Contacts</span>
                            <select
                              class="select select-bordered w-full"
                              multiple
                              [(ngModel)]="deadlineTaskDraft.contactIds"
                              name="deadline-task-contacts"
                            >
                              <option *ngFor="let contact of contacts()" [value]="contact.id">
                                {{ contact.displayName }}
                              </option>
                            </select>
                          </label>
                          <div class="context-actions">
                            <button class="btn btn-neutral" type="submit">Create task</button>
                            <button class="btn btn-ghost" type="button" (click)="closeFocusedDay()">
                              Cancel
                            </button>
                          </div>
                        </form>

                        <ng-container *ngIf="panelMode() === 'event'">
                          <section class="stack-tight compact-stack" *ngIf="selectedEvent() as event">
                            <div class="context-panel-header">
                              <div>
                                <p class="ui-kicker">Event</p>
                                <h4>{{ event.title }}</h4>
                                <p class="ui-copy">{{ formatEventTiming(event) }}</p>
                              </div>
                              <div class="context-actions" *ngIf="isOrganizationContext()">
                                <button
                                  class="btn btn-outline btn-sm"
                                  type="button"
                                  (click)="copySelectedEntryToPersonal()"
                                >
                                  Copy to Personal
                                </button>
                              </div>
                            </div>
                            <p class="alert alert-warning" *ngIf="event.provenance">
                              Copied from {{ event.provenance.sourceContextType }} item
                              {{ event.provenance.sourceItemId }} on
                              {{ formatDateTime(event.provenance.copiedAt) }}.
                            </p>
                            <p class="ui-copy" *ngIf="event.linkedTaskId">
                              Allocation: {{ event.allocation.allocatedMinutes }}m of
                              {{ event.allocation.estimateMinutes ?? 'n/a' }}m.
                            </p>
                            <p class="alert alert-warning" *ngIf="event.allocation.overAllocated">
                              This linked event allocation exceeds the linked task estimate.
                            </p>
                            <form class="stack-tight compact-stack" (ngSubmit)="saveEventUpdates()">
                              <input
                                class="input input-bordered w-full"
                                [(ngModel)]="eventEditDraft.title"
                                name="edit-event-title"
                              />
                              <textarea
                                class="textarea textarea-bordered w-full"
                                rows="2"
                                [(ngModel)]="eventEditDraft.notes"
                                name="edit-event-notes"
                              ></textarea>
                              <div class="inline-grid">
                                <label class="checkbox-row">
                                  <span>All day</span>
                                  <input
                                    type="checkbox"
                                    [(ngModel)]="eventEditDraft.allDay"
                                    name="edit-event-all-day"
                                  />
                                </label>
                                <label class="checkbox-row">
                                  <span>Work related</span>
                                  <input
                                    type="checkbox"
                                    [(ngModel)]="eventEditDraft.workRelated"
                                    name="edit-event-work-related"
                                  />
                                </label>
                              </div>
                              <div class="inline-grid" *ngIf="!eventEditDraft.allDay">
                                <input
                                  class="input input-bordered w-full"
                                  type="datetime-local"
                                  [(ngModel)]="eventEditDraft.startAt"
                                  name="edit-event-start"
                                  (ngModelChange)="refreshEventEditAllocation()"
                                />
                                <select
                                  class="select select-bordered w-full"
                                  [(ngModel)]="eventEditDraft.timedEntryMode"
                                  name="edit-event-timed-entry-mode"
                                  (ngModelChange)="setEventTimingMode(eventEditDraft, $event, true)"
                                >
                                  <option value="end">Use end time</option>
                                  <option value="duration">Use duration</option>
                                </select>
                                <input
                                  *ngIf="eventEditDraft.timedEntryMode === 'end'"
                                  class="input input-bordered w-full"
                                  type="datetime-local"
                                  [(ngModel)]="eventEditDraft.endAt"
                                  name="edit-event-end"
                                  (ngModelChange)="refreshEventEditAllocation()"
                                />
                                <input
                                  *ngIf="eventEditDraft.timedEntryMode === 'duration'"
                                  class="input input-bordered w-full"
                                  type="number"
                                  min="1"
                                  max="1440"
                                  [(ngModel)]="eventEditDraft.durationMinutes"
                                  name="edit-event-duration"
                                  placeholder="Duration (minutes)"
                                  (ngModelChange)="refreshEventEditAllocation()"
                                />
                              </div>
                              <div class="inline-grid" *ngIf="eventEditDraft.allDay">
                                <input
                                  class="input input-bordered w-full"
                                  type="date"
                                  [(ngModel)]="eventEditDraft.allDayStartDate"
                                  name="edit-event-all-day-start"
                                />
                                <input
                                  class="input input-bordered w-full"
                                  type="date"
                                  [(ngModel)]="eventEditDraft.allDayEndDate"
                                  name="edit-event-all-day-end"
                                />
                              </div>
                              <div class="inline-grid">
                                <input
                                  class="input input-bordered w-full"
                                  [(ngModel)]="eventEditDraft.location"
                                  name="edit-event-location"
                                  placeholder="Location"
                                />
                                <select
                                  class="select select-bordered w-full"
                                  [(ngModel)]="eventEditDraft.linkedTaskId"
                                  name="edit-event-linked-task"
                                  (ngModelChange)="refreshEventEditAllocation()"
                                >
                                  <option value="">No linked task</option>
                                  <option *ngFor="let task of taskSummaries()" [value]="task.id">
                                    {{ task.title }}
                                  </option>
                                </select>
                              </div>
                              <label class="ui-field">
                                <span>Calendar memberships</span>
                                <select
                                  class="select select-bordered w-full"
                                  multiple
                                  [(ngModel)]="eventEditDraft.calendarIds"
                                  name="edit-event-calendars"
                                >
                                  <option *ngFor="let calendar of calendars()" [value]="calendar.id">
                                    {{ calendar.name }}
                                  </option>
                                </select>
                              </label>
                              <label class="ui-field">
                                <span>Contacts</span>
                                <select
                                  class="select select-bordered w-full"
                                  multiple
                                  [(ngModel)]="eventEditDraft.contactIds"
                                  name="edit-event-contacts"
                                >
                                  <option *ngFor="let contact of contacts()" [value]="contact.id">
                                    {{ contact.displayName }}
                                  </option>
                                </select>
                              </label>
                              <p class="alert alert-warning" *ngIf="eventEditAllocationWarning()">
                                {{ eventEditAllocationWarning() }}
                              </p>
                              <div class="context-actions">
                                <button class="btn btn-neutral" type="submit">Save event updates</button>
                                <button class="btn btn-outline" type="button" (click)="deleteEvent()">
                                  Delete event
                                </button>
                                <button class="btn btn-ghost" type="button" (click)="selectDay(bucket.key)">
                                  Back to day
                                </button>
                              </div>
                            </form>
                            <article class="rounded-box border border-base-300 p-4 stack-tight">
                              <h5>Add attachment metadata</h5>
                              <div class="inline-grid">
                                <input
                                  class="input input-bordered w-full"
                                  placeholder="File name"
                                  [(ngModel)]="eventAttachmentDraft.fileName"
                                  [ngModelOptions]="{ standalone: true }"
                                />
                                <input
                                  class="input input-bordered w-full"
                                  placeholder="MIME type"
                                  [(ngModel)]="eventAttachmentDraft.mimeType"
                                  [ngModelOptions]="{ standalone: true }"
                                />
                              </div>
                              <div class="inline-grid">
                                <input
                                  class="input input-bordered w-full"
                                  type="number"
                                  min="1"
                                  [(ngModel)]="eventAttachmentDraft.fileSizeBytes"
                                  [ngModelOptions]="{ standalone: true }"
                                  placeholder="Size in bytes"
                                />
                                <input
                                  class="input input-bordered w-full"
                                  placeholder="Storage key"
                                  [(ngModel)]="eventAttachmentDraft.storageKey"
                                  [ngModelOptions]="{ standalone: true }"
                                />
                              </div>
                              <button class="btn btn-outline self-start" type="button" (click)="addEventAttachment()">
                                Add attachment metadata
                              </button>
                            </article>
                          </section>
                        </ng-container>

                        <ng-container *ngIf="panelMode() === 'task'">
                          <section class="stack-tight compact-stack" *ngIf="selectedTaskEntry() as task">
                            <div class="context-panel-header">
                              <div>
                                <p class="ui-kicker">Task</p>
                                <h4>{{ task.title }}</h4>
                                <p class="ui-copy">{{ formatDateTime(task.dueAt, 'No deadline') }}</p>
                              </div>
                              <div class="context-actions" *ngIf="isOrganizationContext()">
                                <button
                                  class="btn btn-outline btn-sm"
                                  type="button"
                                  (click)="copySelectedEntryToPersonal()"
                                >
                                  Copy to Personal
                                </button>
                              </div>
                            </div>
                            <p class="alert alert-warning" *ngIf="task.provenance">
                              Copied from {{ task.provenance.sourceContextType }} item
                              {{ task.provenance.sourceItemId }} on
                              {{ formatDateTime(task.provenance.copiedAt) }}.
                            </p>
                            <div class="rounded-box border border-base-300 p-4 stack-tight">
                              <p><strong>Notes:</strong> {{ task.notes || 'None' }}</p>
                              <p><strong>Location:</strong> {{ task.location || 'None' }}</p>
                              <p><strong>Contacts:</strong> {{ joinLabels(task.contacts, 'displayName') }}</p>
                            </div>
                            <div class="context-actions">
                              <button class="btn btn-outline" type="button" (click)="deleteTask()">
                                Delete task
                              </button>
                              <button class="btn btn-ghost" type="button" (click)="selectDay(bucket.key)">
                                Back to day
                              </button>
                            </div>
                          </section>
                        </ng-container>

                        <section
                          class="rounded-box border border-base-300 p-4 stack-tight compact-stack"
                          *ngIf="advisory()"
                        >
                          <h4>Conflict and advisory panel</h4>
                          <p class="ui-copy">
                            Advisory concerns are warnings only. They do not hard-block scheduling by
                            themselves.
                          </p>
                          <ul class="entry-list compact-list">
                            <li *ngFor="let concern of advisory()!.concerns" class="entry-item">
                              <strong>{{ concern.category }}</strong>
                              <p class="ui-copy">{{ concern.message }}</p>
                            </li>
                          </ul>
                          <div class="context-actions">
                            <button class="btn btn-neutral" type="button" (click)="proceedWithPending()">
                              Proceed anyway
                            </button>
                            <button class="btn btn-outline" type="button" (click)="toggleAlternatives()">
                              View alternative slot suggestions
                            </button>
                            <button class="btn btn-outline" type="button" (click)="askAi()">
                              Ask AI
                            </button>
                            <button class="btn btn-ghost" type="button" (click)="cancelPending()">
                              Cancel
                            </button>
                          </div>
                          <p class="ui-copy" *ngIf="aiMessage()">{{ aiMessage() }}</p>
                          <ul class="entry-list compact-list" *ngIf="showAlternatives()">
                            <li *ngFor="let slot of advisory()!.alternativeSlots" class="entry-item">
                              <p class="ui-copy">
                                {{ formatDateTime(slot.startAt) }} to {{ formatDateTime(slot.endAt) }} ·
                                {{ slot.reason }}
                              </p>
                              <button
                                class="btn btn-outline"
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
                      </div>
                    </aside>
                  </div>
                </ng-container>

                <ng-template #fullCalendar>
                  <div class="calendar-grid">
                    <button
                      *ngFor="let bucket of calendarBuckets()"
                      class="day-card"
                      type="button"
                      [class.today]="bucket.isToday"
                      [class.outside-month]="!bucket.isInCurrentMonth"
                      [class.selected]="selectedDayKey() === bucket.key"
                      (click)="selectDay(bucket.key)"
                    >
                      <div class="day-card-header">
                        <div>
                          <p class="ui-kicker">{{ bucket.shortLabel }}</p>
                          <h3>{{ bucket.label }}</h3>
                        </div>
                        <span class="badge badge-ghost badge-sm">{{ bucket.entries.length }}</span>
                      </div>
                      <ul class="day-entry-list">
                        <li
                          *ngFor="let entry of bucket.entries.slice(0, 3)"
                          class="day-entry"
                          [attr.data-kind]="entry.calendarEntryType"
                        >
                          <strong>{{ entry.title }}</strong>
                          <span>{{ formatEntryMoment(entry) }}</span>
                        </li>
                        <li *ngIf="bucket.entries.length > 3" class="muted-item">
                          +{{ bucket.entries.length - 3 }} more
                        </li>
                        <li *ngIf="bucket.entries.length === 0" class="muted-item">No items</li>
                      </ul>
                    </button>
                  </div>
                </ng-template>
              </div>
            </ng-container>

            <ng-template #calendarManager>
              <div class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3>Switch calendars</h3>
                    <p class="ui-copy">
                      Choose the calendars to show, then apply or cancel your changes.
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" type="button" (click)="cancelCalendarManager()">
                      Cancel
                    </button>
                    <button class="btn btn-neutral btn-sm" type="button" (click)="applyCalendarManager()">
                      Apply
                    </button>
                  </div>
                </div>
                <div class="calendar-list">
                  <label *ngFor="let calendar of calendars()" class="calendar-option">
                    <input
                      type="checkbox"
                      [checked]="pendingCalendarIds().includes(calendar.id)"
                      (change)="togglePendingCalendar(calendar.id, $any($event.target).checked)"
                    />
                    <span>{{ calendar.name }}</span>
                    <small>{{ calendar.type }}</small>
                  </label>
                </div>
                <div
                  class="rounded-box border border-base-300 bg-base-200 p-4 stack-tight"
                  *ngIf="isPersonalContext()"
                  data-testid="personal-calendar-panel"
                >
                  <div>
                    <h3>New personal calendar</h3>
                    <p class="ui-copy">Create it here and keep it selected immediately.</p>
                  </div>
                  <div class="flex flex-wrap items-end gap-3">
                    <label class="ui-field grow">
                      <span>Name</span>
                      <input
                        class="input input-bordered w-full"
                        [(ngModel)]="personalCalendarName"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </label>
                    <button class="btn btn-outline" type="button" (click)="createPersonalCalendar()">
                      Create calendar
                    </button>
                  </div>
                </div>
              </div>
            </ng-template>
          </div>

          <aside class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight self-start">
            <h3>Legend</h3>
            <ul class="legend-list">
              <li><span class="dot event"></span> Event</li>
              <li><span class="dot linked"></span> Linked work event</li>
              <li><span class="dot due"></span> Task due item</li>
            </ul>
          </aside>
        </div>
      </article>
    </section>

    <ng-template #invalidRange>
      <div
        class="rounded-box border border-dashed border-base-300 p-6 text-sm text-base-content/65"
      >
        Choose a valid month and year to render the calendar.
      </div>
    </ng-template>
  `,
  styles: [
    `
      .ui-copy {
        color: var(--text-secondary);
      }

      .card-heading,
      .calendar-grid-header,
      .context-panel-header,
      .panel-section-title {
        display: grid;
        gap: var(--spacing-1);
      }

      .calendar-grid-header {
        align-items: end;
        display: flex;
        justify-content: space-between;
        gap: var(--spacing-4);
      }

      .calendar-workspace {
        min-width: 0;
      }

      .calendar-weekdays {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--spacing-2);
        color: var(--text-secondary);
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .calendar-weekdays span {
        padding: 0 var(--spacing-2);
      }

      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--spacing-3);
      }

      .focused-day-layout {
        display: grid;
        grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
        gap: var(--spacing-4);
        align-items: start;
      }

      .day-card {
        min-width: 0;
        text-align: left;
        border: 1px solid rgb(148 163 184 / 0.2);
        border-radius: var(--radius-xl);
        background: var(--color-base-100);
        padding: 1rem;
        transition:
          border-color 0.18s ease,
          background 0.18s ease,
          transform 0.18s ease;
      }

      .day-card:hover {
        border-color: rgb(100 116 139 / 0.4);
        transform: translateY(-1px);
      }

      .day-card.outside-month {
        background: color-mix(in srgb, var(--color-base-200) 70%, white 30%);
        color: var(--text-secondary);
      }

      .day-card.today {
        border-color: rgb(2 132 199 / 0.55);
      }

      .day-card.selected {
        box-shadow: inset 0 0 0 1px rgb(2 132 199 / 0.4);
      }

      .day-card-focused {
        position: sticky;
        top: 1rem;
      }

      .day-card-header,
      .context-panel-toolbar {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: var(--spacing-3);
      }

      .context-panel-toolbar {
        flex-wrap: wrap;
      }

      .day-entry-list,
      .entry-list,
      .calendar-list,
      .legend-list,
      .simple-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--spacing-2);
      }

      .compact-list {
        gap: var(--spacing-2);
      }

      .day-entry,
      .entry-item {
        border: 1px solid rgb(148 163 184 / 0.2);
        border-left-width: 5px;
        border-radius: var(--radius-lg);
        padding: 0.7rem 0.85rem;
      }

      .day-entry {
        display: grid;
        gap: 0.2rem;
        background: var(--color-base-100);
      }

      .day-entry strong,
      .entry-item strong {
        font-size: 0.92rem;
      }

      .day-entry span {
        color: var(--text-secondary);
        font-size: 0.8rem;
      }

      .day-entry.selected,
      .entry-item.selected {
        box-shadow: inset 0 0 0 1px rgb(2 132 199 / 0.24);
      }

      .entry-item.selectable {
        cursor: pointer;
      }

      .day-entry[data-kind='event'],
      .entry-item[data-kind='event'] {
        border-left-color: rgb(2 132 199 / 0.75);
      }

      .day-entry[data-kind='linked_work_event'],
      .entry-item[data-kind='linked_work_event'] {
        border-left-color: rgb(217 119 6 / 0.75);
      }

      .day-entry[data-kind='task_due'],
      .entry-item[data-kind='task_due'] {
        border-left-color: rgb(219 39 119 / 0.7);
      }

      .context-panel {
        min-width: 0;
        position: sticky;
        top: 1rem;
      }

      .context-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-2);
      }

      .form-stack,
      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
      }

      .compact-stack {
        gap: var(--spacing-2);
      }

      .form-stack {
        padding: 0;
        border: 0;
        background: transparent;
      }

      .checkbox-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-4);
        min-height: 2.75rem;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-surface);
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        font-weight: 600;
      }

      .checkbox-row input {
        width: 1rem;
        height: 1rem;
        margin: 0;
      }

      .form-stack textarea,
      .form-stack select[multiple],
      .stack-tight textarea,
      .stack-tight select[multiple] {
        min-height: 6rem;
      }

      .form-stack select[multiple],
      .stack-tight select[multiple] {
        padding-block: 0.6rem;
      }

      .calendar-option {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
      }

      .inline-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-3);
      }

      .detail-list {
        display: grid;
        gap: var(--spacing-2);
        color: var(--text-secondary);
      }

      .muted-item {
        color: var(--text-secondary);
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

      @media (max-width: 1200px) {
        .focused-day-layout {
          grid-template-columns: 1fr;
        }

        .day-card-focused,
        .context-panel {
          position: static;
        }
      }

      @media (max-width: 900px) {
        .inline-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .calendar-grid-header {
          display: grid;
          justify-content: start;
        }

        .calendar-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class CalendarComponent {
  private readonly calApi = inject(CalApiService);
  private readonly contextService = inject(ContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly timeApi = inject(TimeApiService);

  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly isOrganizationContext = computed(
    () => this.contextService.activeContext().contextType === 'organization',
  );
  readonly isPersonalContext = computed(
    () => this.contextService.activeContext().contextType === 'personal',
  );
  readonly monthOptions = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2026, index, 1)),
  );

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly contacts = signal<ImportedContact[]>([]);
  readonly selectedCalendarIds = signal<string[]>([]);
  readonly entries = signal<CalendarEntry[]>([]);
  readonly error = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly message = signal<string | null>(null);
  readonly taskSummaries = signal<TaskSummary[]>([]);
  readonly linkedTaskAllocationWarning = signal<string | null>(null);
  readonly eventEditAllocationWarning = signal<string | null>(null);
  readonly advisory = signal<AdvisoryResult | null>(null);
  readonly pendingCreate = signal<PendingCreate | null>(null);
  readonly showAlternatives = signal(false);
  readonly aiMessage = signal<string | null>(null);
  readonly selectedEntryId = signal<string | null>(null);
  readonly selectedEvent = signal<EventDetail | null>(null);
  readonly selectedTaskEntry = signal<CalendarTaskDetail | null>(null);
  readonly selectedDayKey = signal<string | null>(null);
  readonly panelMode = signal<ContextPanelMode>('day');
  readonly displayedMonth = signal(new Date().getMonth());
  readonly displayedYear = signal(new Date().getFullYear());
  readonly weekStartsOn = signal<'monday' | 'sunday'>('monday');
  readonly calendarManagerOpen = signal(false);
  readonly pendingCalendarIds = signal<string[]>([]);
  readonly calendarBuckets = computed(() => this.buildCalendarBuckets());
  readonly selectedDayBucket = computed(() => {
    const selectedKey = this.selectedDayKey();
    return this.calendarBuckets().find((bucket) => bucket.key === selectedKey) ?? null;
  });
  readonly currentMonthLabel = computed(
    () => `${this.monthOptions[this.displayedMonth()]} ${this.displayedYear()}`,
  );
  readonly weekdayLabels = computed(() => {
    const baseDate = new Date(Date.UTC(2026, 0, this.weekStartsOn() === 'monday' ? 5 : 4));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
        new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000),
      ),
    );
  });

  personalCalendarName = '';

  eventDraft = this.createDefaultEventDraft();
  deadlineTaskDraft = this.createDefaultDeadlineTaskDraft();
  eventEditDraft = this.createDefaultEventDraft();
  eventAttachmentDraft = createAttachmentDraft();

  constructor() {
    effect(() => {
      const contextKey = this.contextService.activeContext().id;
      void contextKey;
      void this.bootstrap();
    });

    effect(() => {
      const month = this.displayedMonth();
      const year = this.displayedYear();
      const weekStartsOn = this.weekStartsOn();
      void month;
      void year;
      void weekStartsOn;
      if (this.calendars().length > 0) {
        void this.loadView();
      }
    });
  }

  private createDefaultEventDraft(dayKey?: string): EventDraft {
    const defaultCalendarIds = this.defaultDraftCalendarIds();
    const startAt = dayKey
      ? this.isoLocalValue(this.dateForDayKey(dayKey, 9))
      : this.nextRoundedHour(1);
    const endAt = dayKey
      ? this.isoLocalValue(this.dateForDayKey(dayKey, 10))
      : this.nextRoundedHour(2);

    return {
      allDay: false,
      allDayEndDate: dayKey ?? '',
      allDayStartDate: dayKey ?? '',
      calendarIds: [...defaultCalendarIds],
      contactIds: [],
      durationMinutes: 60,
      endAt,
      linkedTaskId: '',
      location: '',
      notes: '',
      startAt,
      timedEntryMode: 'end',
      title: '',
      workRelated: false,
    };
  }

  private createDefaultDeadlineTaskDraft(dayKey?: string): DeadlineTaskDraft {
    const defaultCalendarIds = this.defaultDraftCalendarIds();
    return {
      calendarIds: [...defaultCalendarIds],
      contactIds: [],
      dueAt: dayKey
        ? this.isoLocalValue(this.dateForDayKey(dayKey, 17))
        : this.isoLocalValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
      location: '',
      notes: '',
      title: '',
      workRelated: false,
    };
  }

  async bootstrap() {
    this.error.set(null);
    this.isLoading.set(true);
    try {
      const [calendars, contacts, tasks] = await Promise.all([
        this.calApi.listCalendars(),
        this.calApi.listImportedContacts(),
        this.calApi.listTasks({ deadlinePeriod: 'all', priority: 'all', status: 'all' }),
      ]);
      this.calendars.set(calendars);
      this.contacts.set(contacts);
      const activeSelections =
        this.selectedCalendarIds().length > 0
          ? this.selectedCalendarIds().filter((id) =>
              calendars.some((calendar) => calendar.id === id),
            )
          : calendars.map((calendar) => calendar.id);
      this.selectedCalendarIds.set(activeSelections);
      this.pendingCalendarIds.set(activeSelections);
      this.taskSummaries.set(
        (tasks as TaskSummary[]).map((task) => ({
          allocation: task.allocation,
          id: task.id,
          title: task.title,
        })),
      );
      if (this.eventDraft.calendarIds.length === 0) {
        this.eventDraft.calendarIds = this.defaultDraftCalendarIds();
      }
      if (this.deadlineTaskDraft.calendarIds.length === 0) {
        this.deadlineTaskDraft.calendarIds = this.defaultDraftCalendarIds();
      }
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load calendar view.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadView() {
    this.error.set(null);
    try {
      const visibleRange = this.visibleRange();
      const from = visibleRange.start.toISOString();
      const to = visibleRange.end.toISOString();
      const view = await this.calApi.listCalendarView({
        calendarIds: this.selectedCalendarIds(),
        from,
        to,
      });
      this.entries.set(view.entries as CalendarEntry[]);
      this.ensureSelectedDay();
      this.applyComposeQuery();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load calendar entries.');
    }
  }

  goToPreviousMonth() {
    if (this.displayedMonth() === 0) {
      this.displayedMonth.set(11);
      this.displayedYear.update((year) => year - 1);
      return;
    }

    this.displayedMonth.update((month) => month - 1);
  }

  goToNextMonth() {
    if (this.displayedMonth() === 11) {
      this.displayedMonth.set(0);
      this.displayedYear.update((year) => year + 1);
      return;
    }

    this.displayedMonth.update((month) => month + 1);
  }

  setDisplayedMonth(value: number | string) {
    const month = Number(value);
    if (Number.isInteger(month) && month >= 0 && month <= 11) {
      this.displayedMonth.set(month);
    }
  }

  setDisplayedYear(value: number | string) {
    const year = Number(value);
    if (Number.isInteger(year) && year >= 1970 && year <= 2100) {
      this.displayedYear.set(year);
    }
  }

  setWeekStartsOn(value: 'monday' | 'sunday') {
    this.weekStartsOn.set(value === 'sunday' ? 'sunday' : 'monday');
  }

  openCalendarManager() {
    this.pendingCalendarIds.set([...this.selectedCalendarIds()]);
    this.calendarManagerOpen.set(true);
  }

  cancelCalendarManager() {
    this.pendingCalendarIds.set([...this.selectedCalendarIds()]);
    this.calendarManagerOpen.set(false);
  }

  async applyCalendarManager() {
    this.selectedCalendarIds.set([...this.pendingCalendarIds()]);
    this.calendarManagerOpen.set(false);
    await this.loadView();
  }

  togglePendingCalendar(calendarId: string, checked: boolean) {
    const next = checked
      ? [...this.pendingCalendarIds(), calendarId]
      : this.pendingCalendarIds().filter((id) => id !== calendarId);
    this.pendingCalendarIds.set(Array.from(new Set(next)));
  }

  async createPersonalCalendar() {
    if (!this.isPersonalContext()) {
      return;
    }

    const trimmedName = this.personalCalendarName.trim();
    if (!trimmedName) {
      this.error.set('Personal calendar name is required.');
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      const calendar = await this.calApi.createPersonalCalendar(trimmedName);
      this.personalCalendarName = '';
      this.calendars.update((current) =>
        [...current, calendar].sort((left, right) => left.name.localeCompare(right.name)),
      );
      this.selectedCalendarIds.update((current) => Array.from(new Set([...current, calendar.id])));
      this.pendingCalendarIds.update((current) => Array.from(new Set([...current, calendar.id])));
      this.eventDraft.calendarIds = Array.from(
        new Set([...this.eventDraft.calendarIds, calendar.id]),
      );
      this.deadlineTaskDraft.calendarIds = Array.from(
        new Set([...this.deadlineTaskDraft.calendarIds, calendar.id]),
      );
      this.message.set(`Personal calendar "${calendar.name}" created.`);
      await this.loadView();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Failed to create personal calendar.',
      );
    }
  }

  selectDay(dayKey: string) {
    this.selectedDayKey.set(dayKey);
    this.panelMode.set('day');
    this.selectedEntryId.set(null);
    this.selectedEvent.set(null);
    this.selectedTaskEntry.set(null);
    this.clearAdvisoryState();
    this.linkedTaskAllocationWarning.set(null);
    this.eventEditAllocationWarning.set(null);
  }

  closeFocusedDay() {
    this.selectedDayKey.set(null);
    this.selectedEntryId.set(null);
    this.selectedEvent.set(null);
    this.selectedTaskEntry.set(null);
    this.panelMode.set('day');
    this.clearAdvisoryState();
    this.linkedTaskAllocationWarning.set(null);
    this.eventEditAllocationWarning.set(null);
  }

  openCreateEventForDay(dayKey: string) {
    this.selectedDayKey.set(dayKey);
    this.panelMode.set('create-event');
    this.selectedEntryId.set(null);
    this.selectedEvent.set(null);
    this.selectedTaskEntry.set(null);
    this.clearAdvisoryState();
    this.eventDraft = this.createDefaultEventDraft(dayKey);
    this.linkedTaskAllocationWarning.set(null);
    this.scrollExpandedPanelIntoView();
  }

  openCreateTaskForDay(dayKey: string) {
    this.selectedDayKey.set(dayKey);
    this.panelMode.set('create-task');
    this.selectedEntryId.set(null);
    this.selectedEvent.set(null);
    this.selectedTaskEntry.set(null);
    this.clearAdvisoryState();
    this.deadlineTaskDraft = this.createDefaultDeadlineTaskDraft(dayKey);
    this.scrollExpandedPanelIntoView();
  }

  async selectEntry(entry: CalendarEntry) {
    this.selectedEntryId.set(entry.id);
    this.selectedDayKey.set(this.calendarBucketKey(entry));
    this.message.set(null);
    this.error.set(null);
    this.clearAdvisoryState();

    if (entry.itemType === 'event') {
      try {
        const event = (await this.calApi.getEvent(entry.id)) as EventDetail;
        this.selectedEvent.set(event);
        this.selectedTaskEntry.set(null);
        this.panelMode.set('event');
        this.eventEditDraft = {
          allDay: event.allDay,
          allDayEndDate: event.allDayEndDate ?? '',
          allDayStartDate: event.allDayStartDate ?? '',
          calendarIds: event.calendars.map((calendar) => calendar.calendarId),
          contactIds: event.contacts.map((contact) => contact.id),
          durationMinutes: event.durationMinutes ?? null,
          endAt: event.endAt ? this.isoLocalValue(new Date(event.endAt)) : '',
          linkedTaskId: event.linkedTaskId ?? '',
          location: event.location ?? '',
          notes: event.notes ?? '',
          startAt: event.startAt ? this.isoLocalValue(new Date(event.startAt)) : '',
          timedEntryMode: event.durationMinutes != null ? 'duration' : 'end',
          title: event.title,
          workRelated: event.workRelated,
        };
        await this.refreshEventEditAllocation();
        this.eventAttachmentDraft = createAttachmentDraft();
        this.scrollExpandedPanelIntoView();
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'Failed to load event details.');
      }
      return;
    }

    try {
      const task = (await this.calApi.getTask(entry.id)) as CalendarTaskDetail;
      this.selectedTaskEntry.set(task);
      this.selectedEvent.set(null);
      this.panelMode.set('task');
      this.scrollExpandedPanelIntoView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load task details.');
    }
  }

  formatEntryMoment(entry: CalendarEntry) {
    return this.formatDateTime(entry.startAt || entry.dueAt || entry.endAt, 'No time');
  }

  formatEventTiming(event: EventDetail) {
    if (event.allDay) {
      return `${event.allDayStartDate ?? 'No start'} to ${event.allDayEndDate ?? 'No end'} · All day`;
    }

    return `${this.formatDateTime(event.startAt, 'No start')} to ${this.formatDateTime(event.endAt, 'No end')}`;
  }

  formatDateTime(value: string | null | undefined, fallback = 'n/a') {
    if (!value) {
      return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }

  joinLabels(items: Array<Record<string, string | null>>, key: string) {
    const values = items
      .map((item) => item[key])
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return values.length > 0 ? values.join(', ') : 'None';
  }

  async refreshLinkedTaskAllocation() {
    await this.refreshAllocationWarningForDraft(this.eventDraft, this.linkedTaskAllocationWarning);
  }

  async refreshEventEditAllocation() {
    await this.refreshAllocationWarningForDraft(
      this.eventEditDraft,
      this.eventEditAllocationWarning,
    );
  }

  async createEvent() {
    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.eventDraft.title.trim()) {
        throw new Error('Event title is required.');
      }
      if (this.eventDraft.calendarIds.length === 0) {
        throw new Error('Select at least one calendar.');
      }

      const payload: Record<string, unknown> = {
        allDay: this.eventDraft.allDay,
        calendarIds: this.eventDraft.calendarIds,
        contactIds: this.eventDraft.contactIds,
        linkedTaskId: this.eventDraft.linkedTaskId || undefined,
        location: this.eventDraft.location.trim() || undefined,
        notes: this.eventDraft.notes.trim() || undefined,
        title: this.eventDraft.title.trim(),
        workRelated: this.eventDraft.workRelated,
      };

      if (this.eventDraft.allDay) {
        payload['allDayStartDate'] = this.eventDraft.allDayStartDate;
        payload['allDayEndDate'] = this.eventDraft.allDayEndDate;
      } else {
        const timedValues = this.resolveTimedDraftValues(this.eventDraft);
        payload['startAt'] = timedValues.startAt;
        if (timedValues.endAt) {
          payload['endAt'] = timedValues.endAt;
        }
        if (timedValues.durationMinutes != null) {
          payload['durationMinutes'] = timedValues.durationMinutes;
        }
      }

      const advisory = await this.timeApi.evaluateAdvisory({
        allDay: this.eventDraft.allDay,
        endAt: this.eventDraft.allDay
          ? new Date(`${this.eventDraft.allDayEndDate}T23:59:00.000Z`).toISOString()
          : this.resolveDraftEndAt(this.eventDraft),
        itemType: 'event',
        location: this.eventDraft.location.trim() || undefined,
        startAt: this.eventDraft.allDay
          ? new Date(`${this.eventDraft.allDayStartDate}T00:00:00.000Z`).toISOString()
          : (payload['startAt'] as string),
        title: this.eventDraft.title,
        workRelated: this.eventDraft.workRelated,
      });

      if (advisory.concerns.length > 0) {
        this.advisory.set(advisory);
        this.pendingCreate.set({ kind: 'event', payload });
        this.showAlternatives.set(false);
        return;
      }

      await this.calApi.createEvent(payload);
      this.eventDraft = this.createDefaultEventDraft();
      this.linkedTaskAllocationWarning.set(null);
      this.clearAdvisoryState();
      this.closeFocusedDay();
      this.message.set('Event created.');
      await this.bootstrap();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create event.');
    }
  }

  async createDeadlineTask() {
    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.deadlineTaskDraft.title.trim()) {
        throw new Error('Task title is required.');
      }
      if (!this.deadlineTaskDraft.dueAt) {
        throw new Error('Calendar day creation requires a task deadline.');
      }
      if (this.deadlineTaskDraft.calendarIds.length === 0) {
        throw new Error('Select at least one calendar.');
      }

      const payload: Record<string, unknown> = {
        calendarIds: this.deadlineTaskDraft.calendarIds,
        contactIds: this.deadlineTaskDraft.contactIds,
        dueAt: new Date(this.deadlineTaskDraft.dueAt).toISOString(),
        location: this.deadlineTaskDraft.location.trim() || undefined,
        notes: this.deadlineTaskDraft.notes.trim() || undefined,
        title: this.deadlineTaskDraft.title.trim(),
        workRelated: this.deadlineTaskDraft.workRelated,
      };

      const advisory = await this.timeApi.evaluateAdvisory({
        dueAt: payload['dueAt'],
        itemType: 'task',
        location: this.deadlineTaskDraft.location.trim() || undefined,
        title: this.deadlineTaskDraft.title,
        workRelated: this.deadlineTaskDraft.workRelated,
      });

      if (advisory.concerns.length > 0) {
        this.advisory.set(advisory);
        this.pendingCreate.set({ kind: 'task', payload });
        this.showAlternatives.set(false);
        return;
      }

      await this.calApi.createTask(payload);
      this.deadlineTaskDraft = this.createDefaultDeadlineTaskDraft();
      this.clearAdvisoryState();
      this.closeFocusedDay();
      this.message.set('Deadline task created.');
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
    this.message.set(null);
    try {
      if (pending.kind === 'event') {
        await this.calApi.createEvent(pending.payload);
        this.eventDraft = this.createDefaultEventDraft();
      } else {
        await this.calApi.createTask(pending.payload);
        this.deadlineTaskDraft = this.createDefaultDeadlineTaskDraft();
      }

      this.closeFocusedDay();
      this.message.set(`${pending.kind === 'event' ? 'Event' : 'Task'} created.`);
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

  async saveEventUpdates() {
    const selected = this.selectedEvent();
    if (!selected) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.updateEvent(selected.id, {
        allDay: this.eventEditDraft.allDay,
        allDayEndDate: this.eventEditDraft.allDay ? this.eventEditDraft.allDayEndDate : undefined,
        allDayStartDate: this.eventEditDraft.allDay
          ? this.eventEditDraft.allDayStartDate
          : undefined,
        calendarIds: this.eventEditDraft.calendarIds,
        contactIds: this.eventEditDraft.contactIds,
        durationMinutes: this.eventEditDraft.allDay
          ? undefined
          : this.eventEditDraft.timedEntryMode === 'duration'
            ? this.requireDurationMinutes(this.eventEditDraft)
            : undefined,
        endAt: this.eventEditDraft.allDay
          ? undefined
          : this.eventEditDraft.timedEntryMode === 'end'
            ? this.resolveDraftEndAt(this.eventEditDraft)
            : undefined,
        linkedTaskId: this.eventEditDraft.linkedTaskId || null,
        location: this.eventEditDraft.location.trim() || null,
        notes: this.eventEditDraft.notes.trim() || null,
        startAt: this.eventEditDraft.allDay
          ? undefined
          : new Date(this.eventEditDraft.startAt).toISOString(),
        title: this.eventEditDraft.title.trim(),
        workRelated: this.eventEditDraft.workRelated,
      });
      this.message.set('Event updated.');
      await this.selectEntry({
        calendarEntryType: 'event',
        calendarIds: this.eventEditDraft.calendarIds,
        id: selected.id,
        itemType: 'event',
        title: this.eventEditDraft.title,
      });
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to update event.');
    }
  }

  setEventTimingMode(draft: EventDraft, mode: 'duration' | 'end', refreshEditWarning = false) {
    draft.timedEntryMode = mode;
    if (mode === 'duration' && (draft.durationMinutes == null || draft.durationMinutes <= 0)) {
      draft.durationMinutes = this.calculateDraftEventMinutes(draft) ?? 60;
    }

    if (refreshEditWarning) {
      void this.refreshEventEditAllocation();
      return;
    }

    void this.refreshLinkedTaskAllocation();
  }

  private async refreshAllocationWarningForDraft(
    draft: EventDraft,
    target: typeof this.linkedTaskAllocationWarning,
  ) {
    target.set(null);
    if (!draft.linkedTaskId) {
      return;
    }

    try {
      const task = (await this.calApi.getTask(draft.linkedTaskId)) as {
        allocation: {
          allocatedMinutes: number;
          estimateMinutes: number | null;
          overAllocated: boolean;
        };
      };

      if (task.allocation.estimateMinutes != null) {
        const eventMinutes = draft.allDay ? 0 : (this.calculateDraftEventMinutes(draft) ?? 0);
        const projectedMinutes = task.allocation.allocatedMinutes + eventMinutes;
        const estimate = task.allocation.estimateMinutes;
        const warning = `${task.allocation.allocatedMinutes}m allocated of ${estimate}m estimate.`;
        target.set(
          projectedMinutes > estimate
            ? `${warning} Saving this event projects ${projectedMinutes}m total and over-allocates the task.`
            : `${warning} Saving this event projects ${projectedMinutes}m total.`,
        );
      }
    } catch {
      target.set('Could not load linked-task allocation details.');
    }
  }

  private calculateDraftEventMinutes(draft: EventDraft) {
    if (draft.allDay) {
      return 0;
    }

    if (draft.timedEntryMode === 'duration') {
      return draft.durationMinutes != null && draft.durationMinutes > 0
        ? draft.durationMinutes
        : null;
    }

    if (!draft.startAt || !draft.endAt) {
      return null;
    }

    const diff = (new Date(draft.endAt).getTime() - new Date(draft.startAt).getTime()) / 60_000;
    return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : null;
  }

  private requireDurationMinutes(draft: EventDraft) {
    const durationMinutes = draft.durationMinutes ?? 0;
    if (durationMinutes <= 0) {
      throw new Error('Event duration must be greater than zero.');
    }

    return durationMinutes;
  }

  private resolveDraftEndAt(draft: EventDraft) {
    if (draft.timedEntryMode === 'duration') {
      const startAt = new Date(draft.startAt);
      return new Date(
        startAt.getTime() + this.requireDurationMinutes(draft) * 60_000,
      ).toISOString();
    }

    if (!draft.endAt) {
      throw new Error('Event end time is required.');
    }

    return new Date(draft.endAt).toISOString();
  }

  private resolveTimedDraftValues(draft: EventDraft) {
    const startAt = new Date(draft.startAt).toISOString();
    if (draft.timedEntryMode === 'duration') {
      return {
        durationMinutes: this.requireDurationMinutes(draft),
        endAt: undefined,
        startAt,
      };
    }

    return {
      durationMinutes: undefined,
      endAt: this.resolveDraftEndAt(draft),
      startAt,
    };
  }

  async deleteEvent() {
    const selected = this.selectedEvent();
    if (!selected) {
      return;
    }
    if (
      !window.confirm(
        `Delete event "${selected.title}" from ${this.contextService.getContextLabel()}?`,
      )
    ) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.deleteEvent(selected.id);
      this.selectedEvent.set(null);
      this.selectedEntryId.set(null);
      this.closeFocusedDay();
      this.message.set('Event deleted.');
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to delete event.');
    }
  }

  async deleteTask() {
    const selected = this.selectedTaskEntry();
    if (!selected) {
      return;
    }
    if (
      !window.confirm(
        `Delete task "${selected.title}" from ${this.contextService.getContextLabel()}?`,
      )
    ) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.deleteTask(selected.id);
      this.selectedTaskEntry.set(null);
      this.selectedEntryId.set(null);
      this.closeFocusedDay();
      this.message.set('Task deleted.');
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to delete task.');
    }
  }

  async addEventAttachment() {
    const selected = this.selectedEvent();
    if (!selected) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      if (
        !this.eventAttachmentDraft.fileName.trim() ||
        !this.eventAttachmentDraft.storageKey.trim()
      ) {
        throw new Error('File name and storage key are required.');
      }
      await this.calApi.addEventAttachment(selected.id, {
        fileName: this.eventAttachmentDraft.fileName.trim(),
        fileSizeBytes: this.eventAttachmentDraft.fileSizeBytes,
        mimeType: this.eventAttachmentDraft.mimeType.trim(),
        storageKey: this.eventAttachmentDraft.storageKey.trim(),
      });
      this.eventAttachmentDraft = createAttachmentDraft();
      this.message.set('Event attachment metadata added.');
      await this.selectEntry({
        calendarEntryType: 'event',
        calendarIds: selected.calendars.map((calendar) => calendar.calendarId),
        id: selected.id,
        itemType: 'event',
        title: selected.title,
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to attach file metadata.');
    }
  }

  async copySelectedEntryToPersonal() {
    const event = this.selectedEvent();
    if (event) {
      await this.copyEntryToPersonal({
        calendarEntryType: event.linkedTaskId ? 'linked_work_event' : 'event',
        calendarIds: event.calendars.map((calendar) => calendar.calendarId),
        id: event.id,
        itemType: 'event',
        title: event.title,
      });
      return;
    }

    const task = this.selectedTaskEntry();
    if (task) {
      await this.copyEntryToPersonal({
        calendarEntryType: 'task_due',
        calendarIds: [],
        dueAt: task.dueAt,
        id: task.id,
        itemType: 'task',
        title: task.title,
      });
    }
  }

  private buildCalendarBuckets(): CalendarDayBucket[] {
    const { start, end } = this.visibleRange();

    const buckets: CalendarDayBucket[] = [];
    const entriesByDay = new Map<string, CalendarEntry[]>();
    const currentMonth = this.displayedMonth();
    const currentYear = this.displayedYear();

    for (const entry of this.entries()) {
      const bucketKey = this.calendarBucketKey(entry);
      const existing = entriesByDay.get(bucketKey) ?? [];
      existing.push(entry);
      entriesByDay.set(bucketKey, existing);
    }

    const cursor = new Date(start);
    const todayKey = new Date().toISOString().slice(0, 10);

    while (cursor <= end && buckets.length < 42) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.push({
        entries: (entriesByDay.get(key) ?? []).sort((left, right) =>
          (left.startAt || left.dueAt || '').localeCompare(right.startAt || right.dueAt || ''),
        ),
        fullLabel: cursor.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'long',
          weekday: 'long',
          year: 'numeric',
        }),
        isInCurrentMonth:
          cursor.getMonth() === currentMonth && cursor.getFullYear() === currentYear,
        isToday: key === todayKey,
        key,
        label: cursor.toLocaleDateString(undefined, { day: 'numeric' }),
        shortLabel: cursor.toLocaleDateString(undefined, {
          weekday: 'short',
        }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
  }

  private ensureSelectedDay() {
    const buckets = this.calendarBuckets();
    if (buckets.length === 0) {
      this.selectedDayKey.set(null);
      this.panelMode.set('day');
      return;
    }

    const activeKey = this.selectedDayKey();
    if (activeKey && !buckets.some((bucket) => bucket.key === activeKey)) {
      this.closeFocusedDay();
    }
  }

  private applyComposeQuery() {
    const compose = this.route.snapshot.queryParamMap.get('compose');
    if (compose !== 'event' && compose !== 'task') {
      return;
    }

    const dayKey = this.selectedDayKey() ?? new Date().toISOString().slice(0, 10);
    if (compose === 'event') {
      this.openCreateEventForDay(dayKey);
      return;
    }

    this.openCreateTaskForDay(dayKey);
  }

  private nextRoundedHour(offsetHours: number) {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + offsetHours);
    return this.isoLocalValue(base);
  }

  private scrollExpandedPanelIntoView() {
    setTimeout(() => {
      document
        .getElementById('calendar-context-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 0);
  }

  private dateForDayKey(dayKey: string, hour: number) {
    const [year, month, day] = dayKey.split('-').map((value) => Number(value));
    return new Date(year, month - 1, day, hour, 0, 0, 0);
  }

  private clearAdvisoryState() {
    this.advisory.set(null);
    this.pendingCreate.set(null);
    this.showAlternatives.set(false);
    this.aiMessage.set(null);
  }

  private async copyEntryToPersonal(entry: CalendarEntry) {
    this.error.set(null);
    this.message.set(null);
    if (
      !window.confirm(
        `Copy this ${entry.itemType} from ${this.contextService.getContextLabel()} to your default personal calendar?`,
      )
    ) {
      return;
    }

    try {
      const copied = (await this.calApi.copyToPersonal({
        calendarIds: [],
        itemId: entry.id,
        itemType: entry.itemType,
      })) as { id: string };
      this.message.set(
        `Copied ${entry.itemType} to your default personal calendar as ${copied.id}.`,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to copy item to personal.');
    }
  }

  private isoLocalValue(date: Date) {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return offsetDate.toISOString().slice(0, 16);
  }

  private defaultDraftCalendarIds() {
    return this.selectedCalendarIds().length > 0
      ? [this.selectedCalendarIds()[0]]
      : this.calendars()
          .slice(0, 1)
          .map((calendar) => calendar.id);
  }

  private calendarBucketKey(entry: CalendarEntry) {
    const rawValue = entry.startAt || entry.dueAt || entry.endAt;
    if (!rawValue) {
      return 'unscheduled';
    }

    return new Date(rawValue).toISOString().slice(0, 10);
  }

  private visibleRange() {
    const monthStart = new Date(this.displayedYear(), this.displayedMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(
      this.displayedYear(),
      this.displayedMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const start = new Date(monthStart);
    const offset =
      this.weekStartsOn() === 'monday'
        ? (monthStart.getDay() + 6) % 7
        : monthStart.getDay();
    start.setDate(monthStart.getDate() - offset);
    start.setHours(0, 0, 0, 0);

    const end = new Date(monthEnd);
    const endOffset =
      this.weekStartsOn() === 'monday' ? (7 - ((monthEnd.getDay() + 6) % 7) - 1) : 6 - monthEnd.getDay();
    end.setDate(monthEnd.getDate() + endOffset);
    end.setHours(23, 59, 59, 999);

    return { end, start };
  }
}
