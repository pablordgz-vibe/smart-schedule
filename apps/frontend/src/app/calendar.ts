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
            Aggregate calendar for {{ contextLabel() }}. Tasks without deadlines are excluded from
            this grid.
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
            New Schedule
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
            <ul>
              <li><span class="dot event"></span> Event</li>
              <li><span class="dot linked"></span> Linked work event</li>
              <li><span class="dot due"></span> Task due item</li>
            </ul>
          </div>

          <div class="rounded-box border border-base-300 bg-base-100 p-5 space-y-4" *ngIf="isPersonalContext()" data-testid="personal-calendar-panel">
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
              <button
                class="btn btn-outline"
                type="button"
                (click)="createPersonalCalendar()"
              >
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
          <h2>Calendar grid</h2>
          <p class="ui-copy">
            Date buckets for the selected range and calendars in {{ contextLabel() }}.
          </p>
        </div>

        <div class="calendar-grid">
          <article class="calendar-day" *ngFor="let bucket of calendarBuckets()">
            <div class="stack-tight">
              <strong>{{ bucket.label }}</strong>
              <span class="ui-copy">{{ bucket.entries.length }} items</span>
            </div>

            <ul class="entry-list">
              <li
                *ngFor="let entry of bucket.entries"
                class="entry-item selectable"
                [attr.data-kind]="entry.calendarEntryType"
                (click)="selectEntry(entry)"
              >
                <strong>{{ entry.title }}</strong>
                <p class="ui-copy">{{ entry.startAt || entry.dueAt || 'No time' }}</p>
              </li>
              <li *ngIf="bucket.entries.length === 0" class="ui-copy">No items scheduled.</li>
            </ul>
          </article>
        </div>
      </article>

      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm split-card">
        <section>
          <h2>Quick create</h2>

          <div class="quick-create-grid">
            <form class="form-stack" (ngSubmit)="createEvent()">
              <h3>New Event</h3>
              <input
                class="input input-bordered w-full"
                placeholder="Title"
                [(ngModel)]="eventDraft.title"
                name="event-title"
              />
              <textarea
                class="textarea textarea-bordered w-full"
                rows="3"
                placeholder="Notes"
                [(ngModel)]="eventDraft.notes"
                name="event-notes"
              ></textarea>
              <div class="inline-grid">
                <label class="checkbox-row">
                  <span>All day</span>
                  <input type="checkbox" [(ngModel)]="eventDraft.allDay" name="event-all-day" />
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
              <button class="btn btn-neutral" type="submit">Create event</button>
            </form>

            <form class="form-stack" (ngSubmit)="createDeadlineTask()">
              <h3>New deadline task</h3>
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
              <button class="btn btn-neutral" type="submit">Create task</button>
            </form>
          </div>

          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack" *ngIf="advisory()">
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

            <div class="flex flex-wrap items-end gap-3">
              <button
                class="btn btn-neutral"
                type="button"
                (click)="proceedWithPending()"
              >
                Proceed anyway
              </button>
              <button
                class="btn btn-outline"
                type="button"
                (click)="toggleAlternatives()"
              >
                View alternative slot suggestions
              </button>
              <button class="btn btn-outline" type="button" (click)="askAi()">
                Ask AI
              </button>
              <button class="btn btn-outline" type="button" (click)="cancelPending()">Cancel</button>
            </div>

            <p class="ui-copy" *ngIf="aiMessage()">{{ aiMessage() }}</p>

            <ul class="entry-list" *ngIf="showAlternatives()">
              <li *ngFor="let slot of advisory()!.alternativeSlots" class="entry-item">
                <p class="ui-copy">{{ slot.startAt }} to {{ slot.endAt }} · {{ slot.reason }}</p>
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
        </section>

        <section>
          <h2>Entries</h2>
          <ul class="entry-list">
            <li
              *ngFor="let entry of entries()"
              class="entry-item selectable"
              [attr.data-kind]="entry.calendarEntryType"
              [class.selected]="selectedEntryId() === entry.id"
              (click)="selectEntry(entry)"
            >
              <div>
                <strong>{{ entry.title }}</strong>
                <p class="ui-copy">
                  {{ entry.calendarEntryType }} · {{ entry.startAt || entry.dueAt || 'No date' }}
                </p>
              </div>
              <button
                *ngIf="isOrganizationContext()"
                class="btn btn-outline"
                type="button"
                (click)="copyEntryToPersonal(entry); $event.stopPropagation()"
              >
                Copy to Personal
              </button>
            </li>
            <li *ngIf="entries().length === 0" class="ui-copy">
              No calendar-placeable items in range.
            </li>
          </ul>

          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight" *ngIf="selectedEvent() as event">
            <h3>Event details</h3>
            <p class="ui-copy">{{ event.title }}</p>
            <p class="alert alert-warning" *ngIf="event.provenance">
              Copied from {{ event.provenance.sourceContextType }} item
              {{ event.provenance.sourceItemId }} on {{ event.provenance.copiedAt }}.
            </p>
            <p class="ui-copy" *ngIf="event.linkedTaskId">
              Allocation: {{ event.allocation.allocatedMinutes }}m of
              {{ event.allocation.estimateMinutes ?? 'n/a' }}m.
            </p>
            <p class="alert alert-warning" *ngIf="event.allocation.overAllocated">
              This linked event allocation exceeds the linked task estimate.
            </p>

            <form class="stack-tight" (ngSubmit)="saveEventUpdates()">
              <input class="input input-bordered w-full" [(ngModel)]="eventEditDraft.title" name="edit-event-title" />
              <textarea
                class="textarea textarea-bordered w-full"
                rows="3"
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
              <div class="flex flex-wrap items-end gap-3">
                <button class="btn btn-neutral" type="submit">
                  Save event updates
                </button>
                <button class="btn btn-outline" type="button" (click)="deleteEvent()">
                  Delete event
                </button>
              </div>
            </form>

            <article class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
              <h4>Add attachment metadata</h4>
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
                />
                <input
                  class="input input-bordered w-full"
                  placeholder="Storage key"
                  [(ngModel)]="eventAttachmentDraft.storageKey"
                  [ngModelOptions]="{ standalone: true }"
                />
              </div>
              <button
                class="btn btn-outline"
                type="button"
                (click)="addEventAttachment()"
              >
                Attach file metadata
              </button>
            </article>

            <ul class="simple-list">
              <li *ngFor="let attachment of event.attachments">
                {{ attachment.fileName }} ({{ attachment.state }})
              </li>
              <li *ngIf="event.attachments.length === 0" class="ui-copy">No attachments.</li>
            </ul>
          </section>

          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight" *ngIf="selectedTaskEntry() as taskEntry">
            <h3>Task due details</h3>
            <p class="ui-copy">{{ taskEntry.title }} · {{ taskEntry.dueAt || 'No deadline' }}</p>
            <p class="ui-copy">{{ taskEntry.notes || 'No notes.' }}</p>
            <p class="ui-copy" *ngIf="taskEntry.location">Location: {{ taskEntry.location }}</p>
            <p class="alert alert-warning" *ngIf="taskEntry.provenance">
              Copied from {{ taskEntry.provenance.sourceContextType }} item
              {{ taskEntry.provenance.sourceItemId }} on {{ taskEntry.provenance.copiedAt }}.
            </p>
            <a class="btn btn-outline" routerLink="/tasks">Open in Tasks</a>
          </section>
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

      .card-heading,
      .calendar-grid-header {
        display: grid;
        gap: var(--spacing-1);
      }

      .calendar-grid-header {
        max-width: 40rem;
      }

      .split-card {
        align-items: start;
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--spacing-5);
      }


      .split-card > section {
        min-width: 0;
        display: grid;
        gap: var(--spacing-4);
        align-content: start;
      }

      .quick-create-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-4);
      }

      .form-stack {
        display: grid;
        gap: var(--spacing-4);
        padding: var(--spacing-4);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-surface);
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
        min-height: 8rem;
      }

      .form-stack select[multiple],
      .stack-tight select[multiple] {
        padding-block: 0.6rem;
      }

      .calendar-grid {
        margin-top: var(--spacing-4);
        min-width: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        gap: var(--spacing-3);
      }

      .calendar-day {
        min-width: 0;
        border: 1px solid rgb(148 163 184 / 0.2);
        border-radius: var(--radius-lg);
        padding: var(--spacing-3);
        background: rgb(255 255 255 / 0.65);
      }

      .stack,
      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
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

      .inline-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-3);
      }

      .entry-item {
        border: 1px solid rgb(148 163 184 / 0.2);
        border-left-width: 5px;
        border-radius: var(--radius-lg);
        padding: var(--spacing-3);
      }

      .entry-item.selectable {
        cursor: pointer;
      }

      .entry-item.selected {
        box-shadow: 0 0 0 3px rgb(2 132 199 / 0.15);
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
        .inline-grid {
          grid-template-columns: 1fr;
        }

        .quick-create-grid {
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

  private createDefaultEventDraft(): EventDraft {
    const defaultCalendarIds =
      this.selectedCalendarIds().length > 0 ? this.selectedCalendarIds() : [];
    return {
      allDay: false,
      allDayEndDate: '',
      allDayStartDate: '',
      calendarIds: [...defaultCalendarIds],
      contactIds: [],
      durationMinutes: 60,
      endAt: this.isoLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
      linkedTaskId: '',
      location: '',
      notes: '',
      startAt: this.isoLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
      timedEntryMode: 'end',
      title: '',
      workRelated: false,
    };
  }

  private createDefaultDeadlineTaskDraft(): DeadlineTaskDraft {
    const defaultCalendarIds =
      this.selectedCalendarIds().length > 0 ? this.selectedCalendarIds() : [];
    return {
      calendarIds: [...defaultCalendarIds],
      contactIds: [],
      dueAt: this.isoLocalValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
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

  async selectEntry(entry: CalendarEntry) {
    this.selectedEntryId.set(entry.id);
    this.message.set(null);
    this.error.set(null);
    if (entry.itemType === 'event') {
      try {
        const event = (await this.calApi.getEvent(entry.id)) as EventDetail;
        this.selectedEvent.set(event);
        this.selectedTaskEntry.set(null);
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
          timedEntryMode: 'end',
          title: event.title,
          workRelated: event.workRelated,
        };
        await this.refreshEventEditAllocation();
        this.eventAttachmentDraft = createAttachmentDraft();
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'Failed to load event details.');
      }
      return;
    }

    try {
      const task = (await this.calApi.getTask(entry.id)) as CalendarTaskDetail;
      this.selectedTaskEntry.set(task);
      this.selectedEvent.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load task details.');
    }
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
        throw new Error('Calendar quick-create requires a task deadline.');
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

      this.clearAdvisoryState();
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

  calendarBuckets() {
    const fromDate = new Date(this.from);
    const toDate = new Date(this.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return [];
    }

    const buckets: Array<{
      entries: CalendarEntry[];
      key: string;
      label: string;
    }> = [];
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

    while (cursor <= end && buckets.length < 31) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.push({
        entries: (entriesByDay.get(key) ?? []).sort((left, right) =>
          (left.startAt || left.dueAt || '').localeCompare(right.startAt || right.dueAt || ''),
        ),
        key,
        label: cursor.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          weekday: 'short',
        }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
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
    if (!window.confirm(`Delete event "${selected.title}"?`)) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.deleteEvent(selected.id);
      this.selectedEvent.set(null);
      this.selectedEntryId.set(null);
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

  private clearAdvisoryState() {
    this.advisory.set(null);
    this.pendingCreate.set(null);
    this.showAlternatives.set(false);
    this.aiMessage.set(null);
  }

  async copyEntryToPersonal(entry: CalendarEntry) {
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
