import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
            Click a day to create an item for that date, or click an event or task to inspect it
            in context for {{ contextLabel() }}.
          </p>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <label class="ui-field compact-field">
            <span>From</span>
            <input class="input input-bordered w-full" type="datetime-local" [(ngModel)]="from" />
          </label>
          <label class="ui-field compact-field">
            <span>To</span>
            <input class="input input-bordered w-full" type="datetime-local" [(ngModel)]="to" />
          </label>
          <button class="btn btn-outline" type="button" (click)="loadView()">
            Refresh view
          </button>
          <a class="btn btn-outline" routerLink="/schedules/builder">
            Schedule builder
          </a>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-box border border-base-300 bg-base-100 p-4">
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

          <div class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>Legend</h2>
            <ul class="legend-list">
              <li><span class="dot event"></span> Event</li>
              <li><span class="dot linked"></span> Linked work event</li>
              <li><span class="dot due"></span> Task due item</li>
            </ul>
          </div>

          <div
            class="rounded-box border border-base-300 bg-base-100 p-5 space-y-4"
            *ngIf="isPersonalContext()"
            data-testid="personal-calendar-panel"
          >
            <h2>Personal calendars</h2>
            <p class="ui-copy">
              Create additional calendars here and add them to your aggregate views immediately.
            </p>
            <div class="flex flex-wrap items-end gap-3">
              <label class="ui-field grow">
                <span>New personal calendar</span>
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
            <ul class="entry-list pt-1">
              <li *ngFor="let calendar of personalCalendars()" class="entry-item">
                <strong>{{ calendar.name }}</strong>
              </li>
            </ul>
          </div>
        </div>

        <p class="alert alert-warning" *ngIf="error()">{{ error() }}</p>
        <p class="alert alert-info" *ngIf="message()">{{ message() }}</p>
      </article>

      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-4 overflow-hidden">
        <div class="calendar-grid-header">
          <div>
            <h2>Calendar grid</h2>
            <p class="ui-copy">
              Date buckets for the selected range and calendars in {{ contextLabel() }}.
            </p>
          </div>
          <p class="ui-copy">
            {{ calendarBuckets().length }} day{{ calendarBuckets().length === 1 ? '' : 's' }}
            visible
          </p>
        </div>

        <div class="calendar-workspace" *ngIf="calendarBuckets().length > 0; else invalidRange">
          <ng-container *ngIf="selectedDayBucket() as bucket; else fullCalendar">
            <div class="focused-day-layout">
              <article class="card border border-base-300 bg-base-100 shadow-sm day-card day-card-focused">
                <div class="card-body gap-4 p-4">
                  <div class="day-card-header">
                    <div>
                      <p class="ui-kicker">{{ bucket.shortLabel }}</p>
                      <h3>{{ bucket.label }}</h3>
                      <p class="ui-copy">{{ bucket.fullLabel }}</p>
                    </div>
                    <div class="badge badge-outline">{{ bucket.entries.length }} items</div>
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

              <aside id="calendar-context-panel" class="card border border-base-300 bg-base-100 shadow-sm context-panel">
                <div class="card-body gap-4 p-4">
                  <div class="context-panel-toolbar">
                    <button class="btn btn-ghost btn-sm" type="button" (click)="closeFocusedDay()">
                      Back to calendar
                    </button>
                    <div class="context-actions" *ngIf="panelMode() === 'day'">
                      <button class="btn btn-neutral btn-sm" type="button" (click)="openCreateEventForDay(bucket.key)">
                        New event
                      </button>
                      <button class="btn btn-outline btn-sm" type="button" (click)="openCreateTaskForDay(bucket.key)">
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

                  <form class="form-stack compact-stack" *ngIf="panelMode() === 'create-event'" (ngSubmit)="createEvent()">
                    <div class="join join-horizontal self-start">
                      <button class="btn btn-sm join-item btn-neutral" type="button">
                        Event
                      </button>
                      <button class="btn btn-sm join-item btn-outline" type="button" (click)="openCreateTaskForDay(bucket.key)">
                        Task
                      </button>
                    </div>
                    <div class="panel-section-title">
                      <h4>Create event</h4>
                      <p class="ui-copy">{{ bucket.fullLabel }}</p>
                    </div>
                    <input class="input input-bordered w-full" placeholder="Title" [(ngModel)]="eventDraft.title" name="event-title" />
                    <textarea class="textarea textarea-bordered w-full" rows="2" placeholder="Notes" [(ngModel)]="eventDraft.notes" name="event-notes"></textarea>
                    <div class="inline-grid">
                      <label class="checkbox-row">
                        <span>All day</span>
                        <input type="checkbox" [(ngModel)]="eventDraft.allDay" name="event-all-day" />
                      </label>
                      <label class="checkbox-row">
                        <span>Work related</span>
                        <input type="checkbox" [(ngModel)]="eventDraft.workRelated" name="event-work-related" />
                      </label>
                    </div>
                    <div class="inline-grid" *ngIf="!eventDraft.allDay">
                      <input class="input input-bordered w-full" type="datetime-local" [(ngModel)]="eventDraft.startAt" name="event-start" (ngModelChange)="refreshLinkedTaskAllocation()" />
                      <select class="select select-bordered w-full" [(ngModel)]="eventDraft.timedEntryMode" name="event-timed-entry-mode" (ngModelChange)="setEventTimingMode(eventDraft, $event)">
                        <option value="end">Use end time</option>
                        <option value="duration">Use duration</option>
                      </select>
                      <input *ngIf="eventDraft.timedEntryMode === 'end'" class="input input-bordered w-full" type="datetime-local" [(ngModel)]="eventDraft.endAt" name="event-end" (ngModelChange)="refreshLinkedTaskAllocation()" />
                      <input *ngIf="eventDraft.timedEntryMode === 'duration'" class="input input-bordered w-full" type="number" min="1" max="1440" [(ngModel)]="eventDraft.durationMinutes" name="event-duration" placeholder="Duration (minutes)" (ngModelChange)="refreshLinkedTaskAllocation()" />
                    </div>
                    <div class="inline-grid" *ngIf="eventDraft.allDay">
                      <input class="input input-bordered w-full" type="date" [(ngModel)]="eventDraft.allDayStartDate" name="event-all-day-start" />
                      <input class="input input-bordered w-full" type="date" [(ngModel)]="eventDraft.allDayEndDate" name="event-all-day-end" />
                    </div>
                    <div class="inline-grid">
                      <input class="input input-bordered w-full" placeholder="Location" [(ngModel)]="eventDraft.location" name="event-location" />
                      <select class="select select-bordered w-full" [(ngModel)]="eventDraft.linkedTaskId" name="event-linked-task" (ngModelChange)="refreshLinkedTaskAllocation()">
                        <option value="">No linked task</option>
                        <option *ngFor="let task of taskSummaries()" [value]="task.id">{{ task.title }}</option>
                      </select>
                    </div>
                    <label class="ui-field">
                      <span>Calendar memberships</span>
                      <select class="select select-bordered w-full" multiple [(ngModel)]="eventDraft.calendarIds" name="event-calendars">
                        <option *ngFor="let calendar of calendars()" [value]="calendar.id">{{ calendar.name }}</option>
                      </select>
                    </label>
                    <label class="ui-field">
                      <span>Contacts</span>
                      <select class="select select-bordered w-full" multiple [(ngModel)]="eventDraft.contactIds" name="event-contacts">
                        <option *ngFor="let contact of contacts()" [value]="contact.id">{{ contact.displayName }}</option>
                      </select>
                    </label>
                    <p class="alert alert-warning" *ngIf="linkedTaskAllocationWarning()">{{ linkedTaskAllocationWarning() }}</p>
                    <div class="context-actions">
                      <button class="btn btn-neutral" type="submit">Create event</button>
                      <button class="btn btn-ghost" type="button" (click)="closeFocusedDay()">Cancel</button>
                    </div>
                  </form>

                  <form class="form-stack compact-stack" *ngIf="panelMode() === 'create-task'" (ngSubmit)="createDeadlineTask()">
                    <div class="join join-horizontal self-start">
                      <button class="btn btn-sm join-item btn-outline" type="button" (click)="openCreateEventForDay(bucket.key)">
                        Event
                      </button>
                      <button class="btn btn-sm join-item btn-neutral" type="button">
                        Task
                      </button>
                    </div>
                    <div class="panel-section-title">
                      <h4>Create deadline task</h4>
                      <p class="ui-copy">{{ bucket.fullLabel }}</p>
                    </div>
                    <input class="input input-bordered w-full" placeholder="Title" [(ngModel)]="deadlineTaskDraft.title" name="deadline-task-title" />
                    <textarea class="textarea textarea-bordered w-full" rows="2" placeholder="Notes" [(ngModel)]="deadlineTaskDraft.notes" name="deadline-task-notes"></textarea>
                    <div class="inline-grid">
                      <input class="input input-bordered w-full" type="datetime-local" [(ngModel)]="deadlineTaskDraft.dueAt" name="deadline-task-due" />
                      <input class="input input-bordered w-full" placeholder="Location" [(ngModel)]="deadlineTaskDraft.location" name="deadline-task-location" />
                    </div>
                    <label class="checkbox-row">
                      <span>Work related</span>
                      <input type="checkbox" [(ngModel)]="deadlineTaskDraft.workRelated" name="deadline-task-work-related" />
                    </label>
                    <label class="ui-field">
                      <span>Calendar memberships</span>
                      <select class="select select-bordered w-full" multiple [(ngModel)]="deadlineTaskDraft.calendarIds" name="deadline-task-calendars">
                        <option *ngFor="let calendar of calendars()" [value]="calendar.id">{{ calendar.name }}</option>
                      </select>
                    </label>
                    <label class="ui-field">
                      <span>Contacts</span>
                      <select class="select select-bordered w-full" multiple [(ngModel)]="deadlineTaskDraft.contactIds" name="deadline-task-contacts">
                        <option *ngFor="let contact of contacts()" [value]="contact.id">{{ contact.displayName }}</option>
                      </select>
                    </label>
                    <div class="context-actions">
                      <button class="btn btn-neutral" type="submit">Create task</button>
                      <button class="btn btn-ghost" type="button" (click)="closeFocusedDay()">Cancel</button>
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
                          <button class="btn btn-outline btn-sm" type="button" (click)="copySelectedEntryToPersonal()">Copy to Personal</button>
                        </div>
                      </div>
                      <p class="alert alert-warning" *ngIf="event.provenance">
                        Copied from {{ event.provenance.sourceContextType }} item
                        {{ event.provenance.sourceItemId }} on {{ event.provenance.copiedAt }}.
                      </p>
                      <p class="ui-copy" *ngIf="event.linkedTaskId">
                        Allocation: {{ event.allocation.allocatedMinutes }}m of {{ event.allocation.estimateMinutes ?? 'n/a' }}m.
                      </p>
                      <p class="alert alert-warning" *ngIf="event.allocation.overAllocated">
                        This linked event allocation exceeds the linked task estimate.
                      </p>
                      <form class="stack-tight compact-stack" (ngSubmit)="saveEventUpdates()">
                        <input class="input input-bordered w-full" [(ngModel)]="eventEditDraft.title" name="edit-event-title" />
                        <textarea class="textarea textarea-bordered w-full" rows="2" [(ngModel)]="eventEditDraft.notes" name="edit-event-notes"></textarea>
                        <div class="inline-grid">
                          <label class="checkbox-row">
                            <span>All day</span>
                            <input type="checkbox" [(ngModel)]="eventEditDraft.allDay" name="edit-event-all-day" />
                          </label>
                          <label class="checkbox-row">
                            <span>Work related</span>
                            <input type="checkbox" [(ngModel)]="eventEditDraft.workRelated" name="edit-event-work-related" />
                          </label>
                        </div>
                        <div class="inline-grid" *ngIf="!eventEditDraft.allDay">
                          <input class="input input-bordered w-full" type="datetime-local" [(ngModel)]="eventEditDraft.startAt" name="edit-event-start" (ngModelChange)="refreshEventEditAllocation()" />
                          <select class="select select-bordered w-full" [(ngModel)]="eventEditDraft.timedEntryMode" name="edit-event-timed-entry-mode" (ngModelChange)="setEventTimingMode(eventEditDraft, $event, true)">
                            <option value="end">Use end time</option>
                            <option value="duration">Use duration</option>
                          </select>
                          <input *ngIf="eventEditDraft.timedEntryMode === 'end'" class="input input-bordered w-full" type="datetime-local" [(ngModel)]="eventEditDraft.endAt" name="edit-event-end" (ngModelChange)="refreshEventEditAllocation()" />
                          <input *ngIf="eventEditDraft.timedEntryMode === 'duration'" class="input input-bordered w-full" type="number" min="1" max="1440" [(ngModel)]="eventEditDraft.durationMinutes" name="edit-event-duration" placeholder="Duration (minutes)" (ngModelChange)="refreshEventEditAllocation()" />
                        </div>
                        <div class="inline-grid" *ngIf="eventEditDraft.allDay">
                          <input class="input input-bordered w-full" type="date" [(ngModel)]="eventEditDraft.allDayStartDate" name="edit-event-all-day-start" />
                          <input class="input input-bordered w-full" type="date" [(ngModel)]="eventEditDraft.allDayEndDate" name="edit-event-all-day-end" />
                        </div>
                        <div class="inline-grid">
                          <input class="input input-bordered w-full" [(ngModel)]="eventEditDraft.location" name="edit-event-location" placeholder="Location" />
                          <select class="select select-bordered w-full" [(ngModel)]="eventEditDraft.linkedTaskId" name="edit-event-linked-task" (ngModelChange)="refreshEventEditAllocation()">
                            <option value="">No linked task</option>
                            <option *ngFor="let task of taskSummaries()" [value]="task.id">{{ task.title }}</option>
                          </select>
                        </div>
                        <label class="ui-field">
                          <span>Calendar memberships</span>
                          <select class="select select-bordered w-full" multiple [(ngModel)]="eventEditDraft.calendarIds" name="edit-event-calendars">
                            <option *ngFor="let calendar of calendars()" [value]="calendar.id">{{ calendar.name }}</option>
                          </select>
                        </label>
                        <label class="ui-field">
                          <span>Contacts</span>
                          <select class="select select-bordered w-full" multiple [(ngModel)]="eventEditDraft.contactIds" name="edit-event-contacts">
                            <option *ngFor="let contact of contacts()" [value]="contact.id">{{ contact.displayName }}</option>
                          </select>
                        </label>
                        <p class="alert alert-warning" *ngIf="eventEditAllocationWarning()">{{ eventEditAllocationWarning() }}</p>
                        <div class="context-actions">
                          <button class="btn btn-neutral" type="submit">Save event updates</button>
                          <button class="btn btn-outline" type="button" (click)="deleteEvent()">Delete event</button>
                          <button class="btn btn-ghost" type="button" (click)="selectDay(bucket.key)">Back to day</button>
                        </div>
                      </form>
                      <article class="rounded-box border border-base-300 p-4 stack-tight">
                        <h5>Add attachment metadata</h5>
                        <div class="inline-grid">
                          <input class="input input-bordered w-full" placeholder="File name" [(ngModel)]="eventAttachmentDraft.fileName" [ngModelOptions]="{ standalone: true }" />
                          <input class="input input-bordered w-full" placeholder="MIME type" [(ngModel)]="eventAttachmentDraft.mimeType" [ngModelOptions]="{ standalone: true }" />
                        </div>
                        <div class="inline-grid">
                          <input class="input input-bordered w-full" type="number" min="1" [(ngModel)]="eventAttachmentDraft.fileSizeBytes" [ngModelOptions]="{ standalone: true }" />
                          <input class="input input-bordered w-full" placeholder="Storage key" [(ngModel)]="eventAttachmentDraft.storageKey" [ngModelOptions]="{ standalone: true }" />
                        </div>
                        <button class="btn btn-outline" type="button" (click)="addEventAttachment()">Attach file metadata</button>
                      </article>
                      <div class="detail-list">
                        <p><strong>Calendars:</strong> {{ joinLabels(event.calendars, 'calendarName') }}</p>
                        <p><strong>Contacts:</strong> {{ joinLabels(event.contacts, 'displayName') }}</p>
                      </div>
                      <ul class="simple-list">
                        <li *ngFor="let attachment of event.attachments">{{ attachment.fileName }} ({{ attachment.state }})</li>
                        <li *ngIf="event.attachments.length === 0" class="ui-copy">No attachments.</li>
                      </ul>
                    </section>
                  </ng-container>

                  <ng-container *ngIf="panelMode() === 'task'">
                    <section class="stack-tight compact-stack" *ngIf="selectedTaskEntry() as taskEntry">
                      <div class="context-panel-header">
                        <div>
                          <p class="ui-kicker">Task</p>
                          <h4>{{ taskEntry.title }}</h4>
                          <p class="ui-copy">{{ taskEntry.dueAt || 'No deadline' }}</p>
                        </div>
                        <div class="context-actions">
                          <button *ngIf="isOrganizationContext()" class="btn btn-outline btn-sm" type="button" (click)="copySelectedEntryToPersonal()">Copy to Personal</button>
                          <a class="btn btn-ghost btn-sm" [routerLink]="['/tasks']" [queryParams]="{ taskId: taskEntry.id }">Open in Tasks</a>
                        </div>
                      </div>
                      <p class="ui-copy">{{ taskEntry.notes || 'No notes.' }}</p>
                      <p class="ui-copy" *ngIf="taskEntry.location">Location: {{ taskEntry.location }}</p>
                      <p class="ui-copy" *ngIf="taskEntry.contacts.length > 0">Contacts: {{ joinLabels(taskEntry.contacts, 'displayName') }}</p>
                      <p class="ui-copy" *ngIf="taskEntry.workRelated">Marked as work related.</p>
                      <p class="alert alert-warning" *ngIf="taskEntry.provenance">
                        Copied from {{ taskEntry.provenance.sourceContextType }} item
                        {{ taskEntry.provenance.sourceItemId }} on {{ taskEntry.provenance.copiedAt }}.
                      </p>
                      <div class="context-actions">
                        <button class="btn btn-ghost" type="button" (click)="selectDay(bucket.key)">Back to day</button>
                      </div>
                    </section>
                  </ng-container>

                  <section class="rounded-box border border-base-300 p-4 stack-tight compact-stack" *ngIf="advisory()">
                    <h4>Conflict and advisory panel</h4>
                    <p class="ui-copy">
                      Advisory concerns are warnings only. They do not hard-block scheduling by themselves.
                    </p>
                    <ul class="entry-list compact-list">
                      <li *ngFor="let concern of advisory()!.concerns" class="entry-item">
                        <strong>{{ concern.category }}</strong>
                        <p class="ui-copy">{{ concern.message }}</p>
                      </li>
                    </ul>
                    <div class="context-actions">
                      <button class="btn btn-neutral" type="button" (click)="proceedWithPending()">Proceed anyway</button>
                      <button class="btn btn-outline" type="button" (click)="toggleAlternatives()">View alternative slot suggestions</button>
                      <button class="btn btn-outline" type="button" (click)="askAi()">Ask AI</button>
                      <button class="btn btn-ghost" type="button" (click)="cancelPending()">Cancel</button>
                    </div>
                    <p class="ui-copy" *ngIf="aiMessage()">{{ aiMessage() }}</p>
                    <ul class="entry-list compact-list" *ngIf="showAlternatives()">
                      <li *ngFor="let slot of advisory()!.alternativeSlots" class="entry-item">
                        <p class="ui-copy">{{ slot.startAt }} to {{ slot.endAt }} · {{ slot.reason }}</p>
                        <button class="btn btn-outline" type="button" (click)="applyAlternative(slot.startAt, slot.endAt)">Use this slot</button>
                      </li>
                      <li *ngIf="advisory()!.alternativeSlots.length === 0" class="ui-copy">No alternative slots available.</li>
                    </ul>
                  </section>
                </div>
              </aside>
            </div>
          </ng-container>
        </div>
      </article>
    </section>

    <ng-template #invalidRange>
      <div class="rounded-box border border-dashed border-base-300 p-6 text-sm text-base-content/65">
        Choose a valid date range to render the calendar.
      </div>
    </ng-template>
    <ng-template #fullCalendar>
      <div class="calendar-grid">
        <button
          *ngFor="let bucket of calendarBuckets()"
          class="card border border-base-300 bg-base-100 text-left shadow-sm day-card"
          type="button"
          [class.ring-2]="bucket.isToday"
          [class.ring-base-300]="bucket.isToday"
          (click)="selectDay(bucket.key)"
        >
          <div class="card-body gap-3 p-4">
            <div class="day-card-header">
              <div>
                <p class="ui-kicker">{{ bucket.shortLabel }}</p>
                <h3>{{ bucket.label }}</h3>
              </div>
              <div class="badge badge-outline">{{ bucket.entries.length }}</div>
            </div>
            <ul class="day-entry-list">
              <li
                *ngFor="let entry of bucket.entries.slice(0, 3)"
                class="day-entry"
                [attr.data-kind]="entry.calendarEntryType"
                (click)="selectEntry(entry); $event.stopPropagation()"
              >
                <strong>{{ entry.title }}</strong>
                <span>{{ formatEntryMoment(entry) }}</span>
              </li>
              <li *ngIf="bucket.entries.length === 0" class="text-sm text-base-content/60">
                No items scheduled.
              </li>
              <li *ngIf="bucket.entries.length > 3" class="text-sm text-base-content/60">
                +{{ bucket.entries.length - 3 }} more
              </li>
            </ul>
          </div>
        </button>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .ui-copy {
        color: var(--text-secondary);
      }

      .compact-field {
        min-width: 11rem;
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

      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
        gap: var(--spacing-4);
      }

      .focused-day-layout {
        display: grid;
        grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
        gap: var(--spacing-4);
        align-items: start;
      }

      .day-card {
        min-width: 0;
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
          grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
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
  readonly isOrganizationContext = computed(
    () => this.contextService.activeContext().contextType === 'organization',
  );
  readonly isPersonalContext = computed(
    () => this.contextService.activeContext().contextType === 'personal',
  );

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly personalCalendars = computed(() =>
    this.calendars().filter((calendar) => calendar.type === 'personal'),
  );
  readonly contacts = signal<ImportedContact[]>([]);
  readonly selectedCalendarIds = signal<string[]>([]);
  readonly entries = signal<CalendarEntry[]>([]);
  readonly error = signal<string | null>(null);
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
  readonly calendarBuckets = computed(() => this.buildCalendarBuckets());
  readonly selectedDayBucket = computed(() => {
    const selectedKey = this.selectedDayKey();
    return this.calendarBuckets().find((bucket) => bucket.key === selectedKey) ?? null;
  });

  from = this.isoLocalValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
  to = this.isoLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
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
  }

  private createDefaultEventDraft(dayKey?: string): EventDraft {
    const defaultCalendarIds =
      this.selectedCalendarIds().length > 0 ? this.selectedCalendarIds() : [];
    const startAt = dayKey ? this.isoLocalValue(this.dateForDayKey(dayKey, 9)) : this.nextRoundedHour(1);
    const endAt = dayKey ? this.isoLocalValue(this.dateForDayKey(dayKey, 10)) : this.nextRoundedHour(2);

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
    const defaultCalendarIds =
      this.selectedCalendarIds().length > 0 ? this.selectedCalendarIds() : [];
    return {
      calendarIds: [...defaultCalendarIds],
      contactIds: [],
      dueAt: dayKey ? this.isoLocalValue(this.dateForDayKey(dayKey, 17)) : this.isoLocalValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
      location: '',
      notes: '',
      title: '',
      workRelated: false,
    };
  }

  async bootstrap() {
    this.error.set(null);
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
      this.taskSummaries.set(
        (tasks as TaskSummary[]).map((task) => ({
          allocation: task.allocation,
          id: task.id,
          title: task.title,
        })),
      );
      if (this.eventDraft.calendarIds.length === 0) {
        this.eventDraft.calendarIds = [...activeSelections];
      }
      if (this.deadlineTaskDraft.calendarIds.length === 0) {
        this.deadlineTaskDraft.calendarIds = [...activeSelections];
      }
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
      this.ensureSelectedDay();
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
      this.eventDraft.calendarIds = Array.from(new Set([...this.eventDraft.calendarIds, calendar.id]));
      this.deadlineTaskDraft.calendarIds = Array.from(
        new Set([...this.deadlineTaskDraft.calendarIds, calendar.id]),
      );
      this.message.set(`Personal calendar "${calendar.name}" created.`);
      await this.loadView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create personal calendar.');
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
    return entry.startAt || entry.dueAt || entry.endAt || 'No time';
  }

  formatEventTiming(event: EventDetail) {
    if (event.allDay) {
      return `${event.allDayStartDate ?? 'No start'} to ${event.allDayEndDate ?? 'No end'} · All day`;
    }

    return `${event.startAt ?? 'No start'} to ${event.endAt ?? 'No end'}`;
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
      return new Date(startAt.getTime() + this.requireDurationMinutes(draft) * 60_000).toISOString();
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
    if (!window.confirm(`Delete event "${selected.title}"?`)) {
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

  async addEventAttachment() {
    const selected = this.selectedEvent();
    if (!selected) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.eventAttachmentDraft.fileName.trim() || !this.eventAttachmentDraft.storageKey.trim()) {
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
    const fromDate = new Date(this.from);
    const toDate = new Date(this.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return [];
    }

    const buckets: CalendarDayBucket[] = [];
    const entriesByDay = new Map<string, CalendarEntry[]>();

    for (const entry of this.entries()) {
      const bucketKey = this.calendarBucketKey(entry);
      const existing = entriesByDay.get(bucketKey) ?? [];
      existing.push(entry);
      entriesByDay.set(bucketKey, existing);
    }

    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
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
        isToday: key === todayKey,
        key,
        label: cursor.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
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

    try {
      const copied = (await this.calApi.copyToPersonal({
        calendarIds: [],
        itemId: entry.id,
        itemType: entry.itemType,
      })) as { id: string };
      this.message.set(`Copied ${entry.itemType} to personal context as ${copied.id}.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to copy item to personal.');
    }
  }

  private isoLocalValue(date: Date) {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return offsetDate.toISOString().slice(0, 16);
  }

  private calendarBucketKey(entry: CalendarEntry) {
    const rawValue = entry.startAt || entry.dueAt || entry.endAt;
    if (!rawValue) {
      return 'unscheduled';
    }

    return new Date(rawValue).toISOString().slice(0, 10);
  }
}
