import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CalApiService,
  type AttachmentSummary,
  type CalendarSummary,
  type ImportedContact,
} from './cal-api.service';
import { ContextService } from './context.service';

type TaskRow = {
  allocation: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  dueAt: string | null;
  estimatedDurationMinutes: number | null;
  id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  subtaskSummary: { completed: number; total: number };
  taskDependencyCount: number;
  title: string;
  workRelated: boolean;
};

type TaskDetail = {
  allocation: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  attachments: AttachmentSummary[];
  autoCompleteFromSubtasks: boolean;
  calendars: Array<{ calendarId: string; calendarName: string }>;
  contacts: ImportedContact[];
  dependencies: string[];
  dueAt: string | null;
  estimatedDurationMinutes: number | null;
  id: string;
  linkedEvents: Array<{ endAt: string | null; id: string; startAt: string | null; title: string }>;
  location: string | null;
  notes: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  provenance: {
    copiedAt: string;
    sourceContextType: 'organization' | 'personal';
    sourceItemId: string;
    sourceOrganizationId: string | null;
  } | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  subtasks: Array<{ completed: boolean; id: string; title: string }>;
  timezone: string;
  title: string;
  workRelated: boolean;
};

type ContactImportDraft = {
  displayName: string;
  email: string;
  phone: string;
  providerCode: string;
  providerContactId: string;
};

type AttachmentDraft = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageKey: string;
};

type TaskDraft = {
  autoCompleteFromSubtasks: boolean;
  calendarIds: string[];
  contactIds: string[];
  dependencySearch: string;
  dependencyTaskIds: string[];
  dueAt: string;
  estimatedDurationMinutes: number;
  location: string;
  notes: string;
  priority: TaskDetail['priority'];
  status: TaskDetail['status'];
  subtasksToken: string;
  title: string;
  workRelated: boolean;
};

function createTaskDraft(): TaskDraft {
  return {
    autoCompleteFromSubtasks: false,
    calendarIds: [],
    contactIds: [],
    dependencySearch: '',
    dependencyTaskIds: [],
    dueAt: '',
    estimatedDurationMinutes: 60,
    location: '',
    notes: '',
    priority: 'medium',
    status: 'todo',
    subtasksToken: '',
    title: '',
    workRelated: false,
  };
}

function createAttachmentDraft(): AttachmentDraft {
  return {
    fileName: '',
    fileSizeBytes: 1024,
    mimeType: 'application/octet-stream',
    storageKey: '',
  };
}

function createContactImportDraft(): ContactImportDraft {
  return {
    displayName: '',
    email: '',
    phone: '',
    providerCode: 'manual-import',
    providerContactId: '',
  };
}

function encodeSubtasks(subtasks: Array<{ completed: boolean; title: string }>) {
  return subtasks
    .map((subtask) => `${subtask.completed ? '[x]' : '[ ]'} ${subtask.title}`)
    .join('\n');
}

function parseSubtasks(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const completed = entry.startsWith('[x]');
      const normalizedTitle = entry.replace(/^\[(x| )\]\s*/i, '').trim();
      return {
        completed,
        title: normalizedTitle || entry,
      };
    })
    .filter((entry) => entry.title.length > 0);
}

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" data-testid="page-tasks">
      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <p class="ui-kicker">End-User Workspace</p>
        <h1>Task Overview</h1>
        <p class="ui-copy">
          Tasks with and without deadlines are managed here for {{ contextLabel() }}.
        </p>

        <div class="flex flex-wrap items-end gap-3">
          <input class="input input-bordered w-full" placeholder="Search by name" [(ngModel)]="filters.name" />
          <select class="select select-bordered w-full" [(ngModel)]="filters.deadlinePeriod">
            <option value="all">All deadlines</option>
            <option value="none">No deadline</option>
            <option value="overdue">Overdue</option>
            <option value="next_7_days">Next 7 days</option>
            <option value="next_30_days">Next 30 days</option>
          </select>
          <select class="select select-bordered w-full" [(ngModel)]="filters.status">
            <option value="all">All statuses</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>
          <select class="select select-bordered w-full" [(ngModel)]="filters.priority">
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button class="btn btn-outline" type="button" (click)="loadTasks()">
            Apply
          </button>
        </div>

        <p class="alert alert-warning" *ngIf="error()">{{ error() }}</p>
        <p class="alert alert-info" *ngIf="message()">{{ message() }}</p>
      </article>

      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm split-layout">
        <section>
          <h2>Create task</h2>
          <form class="form-stack" (ngSubmit)="createTask()">
            <input
              class="input input-bordered w-full"
              placeholder="Title"
              [(ngModel)]="draft.title"
              name="task-title"
            />
            <textarea
              class="textarea textarea-bordered w-full"
              placeholder="Notes"
              [(ngModel)]="draft.notes"
              name="task-notes"
              rows="3"
            ></textarea>
            <div class="inline-grid">
              <input
                class="input input-bordered w-full"
                type="datetime-local"
                [(ngModel)]="draft.dueAt"
                name="task-due"
              />
              <input
                class="input input-bordered w-full"
                placeholder="Location"
                [(ngModel)]="draft.location"
                name="task-location"
              />
            </div>
            <div class="inline-grid">
              <input
                class="input input-bordered w-full"
                type="number"
                min="0"
                max="1440"
                [(ngModel)]="draft.estimatedDurationMinutes"
                name="task-estimated-duration"
                placeholder="Estimated duration (minutes)"
              />
              <label class="checkbox-row">
                <span>Work related</span>
                <input type="checkbox" [(ngModel)]="draft.workRelated" name="task-work-related" />
              </label>
            </div>
            <div class="inline-grid">
              <select class="select select-bordered w-full" [(ngModel)]="draft.status" name="task-status">
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
              <select class="select select-bordered w-full" [(ngModel)]="draft.priority" name="task-priority">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <label class="checkbox-row">
              <span>Auto-complete from subtasks</span>
              <input
                type="checkbox"
                [(ngModel)]="draft.autoCompleteFromSubtasks"
                name="task-auto-complete"
              />
            </label>
            <label class="ui-field">
              <span>Calendar memberships</span>
              <select
                class="select select-bordered w-full"
                multiple
                [(ngModel)]="draft.calendarIds"
                name="task-calendars"
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
                [(ngModel)]="draft.contactIds"
                name="task-contacts"
              >
                <option *ngFor="let contact of contacts()" [value]="contact.id">
                  {{ contact.displayName }}
                </option>
              </select>
            </label>
            <label class="ui-field">
              <span>Dependencies</span>
              <input
                class="input input-bordered w-full"
                [(ngModel)]="draft.dependencySearch"
                name="task-dependency-search"
                placeholder="Search tasks by title"
              />
            </label>
            <div class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
              <p class="ui-copy">Selected dependencies</p>
              <div class="dependency-chip-row">
                <button
                  *ngFor="let dependencyId of draft.dependencyTaskIds"
                  class="btn btn-outline"
                  type="button"
                  (click)="removeDependencyFromDraft(draft, dependencyId)"
                >
                  {{ dependencyLabel(dependencyId) }} ×
                </button>
                <span *ngIf="draft.dependencyTaskIds.length === 0" class="ui-copy">
                  No dependencies selected.
                </span>
              </div>
              <ul class="simple-list nested">
                <li *ngFor="let task of availableDependencyTasksForDraft(draft)">
                  <button
                    class="btn btn-outline"
                    type="button"
                    (click)="addDependencyToDraft(draft, task.id)"
                  >
                    Add {{ task.title }}
                  </button>
                </li>
              </ul>
            </div>
            <label class="ui-field">
              <span>Subtasks (one per line, prefix with [x] for completed)</span>
              <textarea
                class="textarea textarea-bordered w-full"
                rows="4"
                [(ngModel)]="draft.subtasksToken"
                name="task-subtasks"
              ></textarea>
            </label>
            <button class="btn btn-neutral" type="submit">Create task</button>
          </form>

          <article class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
            <h2>Import contact</h2>
            <div class="inline-grid">
              <input
                class="input input-bordered w-full"
                placeholder="Display name"
                [(ngModel)]="contactImport.displayName"
                [ngModelOptions]="{ standalone: true }"
              />
              <input
                class="input input-bordered w-full"
                placeholder="Provider contact id"
                [(ngModel)]="contactImport.providerContactId"
                [ngModelOptions]="{ standalone: true }"
              />
            </div>
            <div class="inline-grid">
              <input
                class="input input-bordered w-full"
                placeholder="Provider code"
                [(ngModel)]="contactImport.providerCode"
                [ngModelOptions]="{ standalone: true }"
              />
              <input
                class="input input-bordered w-full"
                placeholder="Email"
                [(ngModel)]="contactImport.email"
                [ngModelOptions]="{ standalone: true }"
              />
            </div>
            <input
              class="input input-bordered w-full"
              placeholder="Phone"
              [(ngModel)]="contactImport.phone"
              [ngModelOptions]="{ standalone: true }"
            />
            <button
              class="btn btn-outline"
              type="button"
              (click)="createImportedContact()"
            >
              Import contact into current context
            </button>
          </article>

          <h2>Tasks</h2>
          <ul class="task-list">
            <li
              *ngFor="let task of tasks()"
              class="task-row"
              [class.selected]="selectedTaskId() === task.id"
              (click)="selectTask(task.id)"
            >
              <div>
                <strong>{{ task.title }}</strong>
                <p class="ui-copy">
                  {{ task.status }} · {{ task.priority }} · due {{ task.dueAt || 'none' }}
                </p>
                <p class="ui-copy">
                  allocated {{ task.allocation.allocatedMinutes }}m / est
                  {{ task.allocation.estimateMinutes ?? 'n/a' }}m · subtasks
                  {{ task.subtaskSummary.completed }}/{{ task.subtaskSummary.total }} · deps
                  {{ task.taskDependencyCount }}
                </p>
              </div>
            </li>
            <li *ngIf="tasks().length === 0" class="ui-copy">No tasks for current filters.</li>
          </ul>
        </section>

        <section>
          <h2>Task details</h2>
          <ng-container *ngIf="selectedTask() as task; else noTaskSelected">
            <p class="ui-copy">{{ task.title }}</p>

            <div class="ui-state-grid">
              <article class="ui-state ui-state-info">
                <h3>Allocation</h3>
                <p>
                  {{ task.allocation.allocatedMinutes }}m allocated of
                  {{ task.allocation.estimateMinutes ?? 'n/a' }}m estimate.
                </p>
              </article>
              <article class="ui-state ui-state-warning" *ngIf="task.allocation.overAllocated">
                <h3>Over-allocation warning</h3>
                <p>Planned linked event time exceeds estimate, but edits remain allowed.</p>
              </article>
            </div>

            <p class="alert alert-warning" *ngIf="task.provenance">
              Copied from {{ task.provenance.sourceContextType }} item
              {{ task.provenance.sourceItemId }} on {{ task.provenance.copiedAt }}.
            </p>

            <div class="flex flex-wrap items-center gap-3">
              <button
                *ngIf="isOrganizationContext()"
                class="btn btn-outline"
                type="button"
                (click)="copyToPersonal(task.id)"
              >
                Copy to Personal
              </button>
              <button class="btn btn-outline" type="button" (click)="deleteTask()">Delete task</button>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Subtasks</h3>
                <ul>
                  <li *ngFor="let subtask of task.subtasks">
                    {{ subtask.completed ? '✓' : '○' }} {{ subtask.title }}
                  </li>
                  <li *ngIf="task.subtasks.length === 0">No subtasks.</li>
                </ul>
              </div>
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Dependencies</h3>
                <ul>
                  <li *ngFor="let dependency of task.dependencies">{{ dependency }}</li>
                  <li *ngIf="task.dependencies.length === 0">No dependencies.</li>
                </ul>
              </div>
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Linked work events</h3>
                <ul>
                  <li *ngFor="let event of task.linkedEvents">
                    {{ event.title }} ({{ event.startAt || 'n/a' }})
                  </li>
                  <li *ngIf="task.linkedEvents.length === 0">No linked events.</li>
                </ul>
              </div>
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Calendar memberships</h3>
                <ul>
                  <li *ngFor="let calendar of task.calendars">{{ calendar.calendarName }}</li>
                  <li *ngIf="task.calendars.length === 0">No calendar memberships.</li>
                </ul>
              </div>
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Contacts</h3>
                <ul>
                  <li *ngFor="let contact of task.contacts">{{ contact.displayName }}</li>
                  <li *ngIf="task.contacts.length === 0">No contacts.</li>
                </ul>
              </div>
              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3>Attachments</h3>
                <ul>
                  <li *ngFor="let attachment of task.attachments">
                    {{ attachment.fileName }} ({{ attachment.state }})
                  </li>
                  <li *ngIf="task.attachments.length === 0">No attachments.</li>
                </ul>
              </div>
            </div>

            <form class="form-stack" (ngSubmit)="saveTaskUpdates()">
              <h3>Edit task</h3>
              <input class="input input-bordered w-full" [(ngModel)]="editDraft.title" name="edit-task-title" />
              <textarea
                class="textarea textarea-bordered w-full"
                rows="3"
                [(ngModel)]="editDraft.notes"
                name="edit-task-notes"
              ></textarea>
              <div class="inline-grid">
                <input
                  class="input input-bordered w-full"
                  type="datetime-local"
                  [(ngModel)]="editDraft.dueAt"
                  name="edit-task-due"
                />
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="editDraft.location"
                  name="edit-task-location"
                  placeholder="Location"
                />
              </div>
              <div class="inline-grid">
                <select class="select select-bordered w-full" [(ngModel)]="editDraft.status" name="edit-task-status">
                  <option value="todo">Todo</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                </select>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="editDraft.priority"
                  name="edit-task-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div class="inline-grid">
                <input
                  class="input input-bordered w-full"
                  type="number"
                  min="0"
                  max="1440"
                  [(ngModel)]="editDraft.estimatedDurationMinutes"
                  name="edit-task-estimated-duration"
                  placeholder="Estimated duration (minutes)"
                />
                <label class="checkbox-row">
                  <span>Work related</span>
                  <input
                    type="checkbox"
                    [(ngModel)]="editDraft.workRelated"
                    name="edit-task-work-related"
                  />
                </label>
              </div>
              <label class="checkbox-row">
                <span>Auto-complete from subtasks</span>
                <input
                  type="checkbox"
                  [(ngModel)]="editDraft.autoCompleteFromSubtasks"
                  name="edit-task-auto-complete"
                />
              </label>
              <label class="ui-field">
                <span>Calendar memberships</span>
                <select
                  class="select select-bordered w-full"
                  multiple
                  [(ngModel)]="editDraft.calendarIds"
                  name="edit-task-calendars"
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
                  [(ngModel)]="editDraft.contactIds"
                  name="edit-task-contacts"
                >
                  <option *ngFor="let contact of contacts()" [value]="contact.id">
                    {{ contact.displayName }}
                  </option>
                </select>
              </label>
              <label class="ui-field">
                <span>Dependencies</span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="editDraft.dependencySearch"
                  name="edit-task-dependency-search"
                  placeholder="Search tasks by title"
                />
              </label>
              <div class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
                <p class="ui-copy">Selected dependencies</p>
                <div class="dependency-chip-row">
                  <button
                    *ngFor="let dependencyId of editDraft.dependencyTaskIds"
                    class="btn btn-outline"
                    type="button"
                    (click)="removeDependencyFromDraft(editDraft, dependencyId)"
                  >
                    {{ dependencyLabel(dependencyId) }} ×
                  </button>
                  <span *ngIf="editDraft.dependencyTaskIds.length === 0" class="ui-copy">
                    No dependencies selected.
                  </span>
                </div>
                <ul class="simple-list nested">
                  <li
                    *ngFor="
                      let task of availableDependencyTasksForDraft(editDraft, selectedTaskId() ?? undefined)
                    "
                  >
                    <button
                      class="btn btn-outline"
                      type="button"
                      (click)="addDependencyToDraft(editDraft, task.id)"
                    >
                      Add {{ task.title }}
                    </button>
                  </li>
                </ul>
              </div>
              <label class="ui-field">
                <span>Subtasks</span>
                <textarea
                  class="textarea textarea-bordered w-full"
                  rows="4"
                  [(ngModel)]="editDraft.subtasksToken"
                  name="edit-task-subtasks"
                ></textarea>
              </label>
              <button class="btn btn-neutral" type="submit">Save task updates</button>
            </form>

            <article class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
              <h3>Add attachment metadata</h3>
              <div class="inline-grid">
                <input
                  class="input input-bordered w-full"
                  placeholder="File name"
                  [(ngModel)]="attachmentDraft.fileName"
                  [ngModelOptions]="{ standalone: true }"
                />
                <input
                  class="input input-bordered w-full"
                  placeholder="MIME type"
                  [(ngModel)]="attachmentDraft.mimeType"
                  [ngModelOptions]="{ standalone: true }"
                />
              </div>
              <div class="inline-grid">
                <input
                  class="input input-bordered w-full"
                  type="number"
                  min="1"
                  [(ngModel)]="attachmentDraft.fileSizeBytes"
                  [ngModelOptions]="{ standalone: true }"
                />
                <input
                  class="input input-bordered w-full"
                  placeholder="Storage key"
                  [(ngModel)]="attachmentDraft.storageKey"
                  [ngModelOptions]="{ standalone: true }"
                />
              </div>
              <button class="btn btn-outline" type="button" (click)="addAttachment()">
                Attach file metadata
              </button>
            </article>
          </ng-container>

          <ng-template #noTaskSelected>
            <p class="ui-copy">
              Select a task to inspect subtasks, dependencies, linked events, attachments, and
              cross-context copy actions.
            </p>
          </ng-template>
        </section>
      </article>
    </section>
  `,
  styles: [
    `
      .ui-copy {
        color: var(--text-secondary);
      }

      .split-layout {
        align-items: start;
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: var(--spacing-6);
      }

      .form-stack {
        display: grid;
        gap: var(--spacing-4);
        margin-bottom: var(--spacing-6);
      }

      .stack {
        display: grid;
        gap: var(--spacing-3);
        margin-bottom: var(--spacing-6);
      }

      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
      }

      .inline-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-3);
      }


      .split-layout > section {
        min-width: 0;
        display: grid;
        gap: var(--spacing-5);
        align-content: start;
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
      .form-stack select[multiple] {
        min-height: 8rem;
      }

      .form-stack select[multiple] {
        padding-block: 0.6rem;
      }

      .task-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--spacing-2);
      }

      .task-row {
        border: 1px solid rgb(148 163 184 / 0.2);
        border-radius: var(--radius-lg);
        padding: var(--spacing-3);
        cursor: pointer;
      }

      .task-row.selected {
        border-color: rgb(2 132 199 / 0.6);
        box-shadow: 0 0 0 3px rgb(2 132 199 / 0.15);
      }

      .dependency-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-2);
      }

      @media (max-width: 980px) {
        .split-layout,
        .inline-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class TasksComponent {
  private readonly calApi = inject(CalApiService);
  private readonly contextService = inject(ContextService);

  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly isOrganizationContext = computed(
    () => this.contextService.activeContext().contextType === 'organization',
  );

  readonly tasks = signal<TaskRow[]>([]);
  readonly selectedTask = signal<TaskDetail | null>(null);
  readonly selectedTaskId = signal<string | null>(null);
  readonly contacts = signal<ImportedContact[]>([]);
  readonly calendars = signal<CalendarSummary[]>([]);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  filters: {
    deadlinePeriod: 'all' | 'none' | 'overdue' | 'next_30_days' | 'next_7_days';
    name: string;
    priority: 'all' | 'high' | 'low' | 'medium' | 'urgent';
    status: 'all' | 'blocked' | 'completed' | 'in_progress' | 'todo';
  } = {
    deadlinePeriod: 'all',
    name: '',
    priority: 'all',
    status: 'all',
  };

  draft = createTaskDraft();
  editDraft = createTaskDraft();
  attachmentDraft = createAttachmentDraft();
  contactImport = createContactImportDraft();

  constructor() {
    effect(() => {
      const contextKey = this.contextService.activeContext().id;
      void contextKey;
      void this.bootstrap();
    });
  }

  async bootstrap() {
    this.error.set(null);
    try {
      const [contacts, calendars] = await Promise.all([
        this.calApi.listImportedContacts(),
        this.calApi.listCalendars(),
      ]);
      this.contacts.set(contacts);
      this.calendars.set(calendars);
      if (this.draft.calendarIds.length === 0) {
        this.draft.calendarIds = calendars.map((calendar) => calendar.id);
      }
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load tasks workspace.');
    }
  }

  async loadTasks() {
    this.error.set(null);
    try {
      this.tasks.set((await this.calApi.listTasks(this.filters)) as TaskRow[]);
      const selectedTaskId = this.selectedTaskId();
      if (selectedTaskId) {
        await this.selectTask(selectedTaskId);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load tasks.');
    }
  }

  async selectTask(taskId: string) {
    this.error.set(null);
    this.selectedTaskId.set(taskId);
    try {
      const task = (await this.calApi.getTask(taskId)) as TaskDetail;
      this.selectedTask.set(task);
      this.editDraft = {
        autoCompleteFromSubtasks: task.autoCompleteFromSubtasks,
        calendarIds: task.calendars.map((calendar) => calendar.calendarId),
        contactIds: task.contacts.map((contact) => contact.id),
        dependencySearch: '',
        dependencyTaskIds: task.dependencies,
        dueAt: task.dueAt ? this.isoLocalValue(new Date(task.dueAt)) : '',
        estimatedDurationMinutes: task.estimatedDurationMinutes ?? 0,
        location: task.location ?? '',
        notes: task.notes ?? '',
        priority: task.priority,
        status: task.status,
        subtasksToken: encodeSubtasks(task.subtasks),
        title: task.title,
        workRelated: task.workRelated,
      };
      this.attachmentDraft = createAttachmentDraft();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load task details.');
    }
  }

  async createTask() {
    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.draft.title.trim()) {
        throw new Error('Task title is required.');
      }
      if (this.draft.calendarIds.length === 0) {
        throw new Error('Select at least one calendar.');
      }

      await this.calApi.createTask({
        autoCompleteFromSubtasks: this.draft.autoCompleteFromSubtasks,
        calendarIds: this.draft.calendarIds,
        contactIds: this.draft.contactIds,
        dependencyTaskIds: this.draft.dependencyTaskIds,
        dueAt: this.draft.dueAt ? new Date(this.draft.dueAt).toISOString() : undefined,
        estimatedDurationMinutes: this.draft.estimatedDurationMinutes || undefined,
        location: this.draft.location.trim() || undefined,
        notes: this.draft.notes.trim() || undefined,
        priority: this.draft.priority,
        status: this.draft.status,
        subtasks: parseSubtasks(this.draft.subtasksToken),
        title: this.draft.title.trim(),
        workRelated: this.draft.workRelated,
      });

      this.draft = {
        ...createTaskDraft(),
        calendarIds: this.calendars().map((calendar) => calendar.id),
      };
      this.message.set('Task created.');
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to create task.');
    }
  }

  async saveTaskUpdates() {
    const selected = this.selectedTask();
    if (!selected) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.updateTask(selected.id, {
        autoCompleteFromSubtasks: this.editDraft.autoCompleteFromSubtasks,
        calendarIds: this.editDraft.calendarIds,
        contactIds: this.editDraft.contactIds,
        dependencyTaskIds: this.editDraft.dependencyTaskIds,
        dueAt: this.editDraft.dueAt ? new Date(this.editDraft.dueAt).toISOString() : null,
        estimatedDurationMinutes: this.editDraft.estimatedDurationMinutes || null,
        location: this.editDraft.location.trim() || null,
        notes: this.editDraft.notes.trim() || null,
        priority: this.editDraft.priority,
        status: this.editDraft.status,
        subtasks: parseSubtasks(this.editDraft.subtasksToken),
        title: this.editDraft.title.trim(),
        workRelated: this.editDraft.workRelated,
      });

      this.message.set('Task updated.');
      await this.selectTask(selected.id);
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to update task.');
    }
  }

  async deleteTask() {
    const selected = this.selectedTask();
    if (!selected) {
      return;
    }

    if (!window.confirm(`Delete task "${selected.title}"?`)) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      await this.calApi.deleteTask(selected.id);
      this.selectedTask.set(null);
      this.selectedTaskId.set(null);
      this.message.set('Task deleted.');
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to delete task.');
    }
  }

  async copyToPersonal(taskId: string) {
    this.error.set(null);
    this.message.set(null);
    try {
      const copied = (await this.calApi.copyToPersonal({
        calendarIds: [],
        itemId: taskId,
        itemType: 'task',
      })) as { id: string };
      this.message.set(`Copied task to personal context as ${copied.id}.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to copy task.');
    }
  }

  async addAttachment() {
    const selected = this.selectedTask();
    if (!selected) {
      return;
    }

    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.attachmentDraft.fileName.trim() || !this.attachmentDraft.storageKey.trim()) {
        throw new Error('File name and storage key are required.');
      }

      await this.calApi.addTaskAttachment(selected.id, {
        fileName: this.attachmentDraft.fileName.trim(),
        fileSizeBytes: this.attachmentDraft.fileSizeBytes,
        mimeType: this.attachmentDraft.mimeType.trim(),
        storageKey: this.attachmentDraft.storageKey.trim(),
      });

      this.attachmentDraft = createAttachmentDraft();
      this.message.set('Attachment metadata added.');
      await this.selectTask(selected.id);
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to add attachment.');
    }
  }

  async createImportedContact() {
    this.error.set(null);
    this.message.set(null);
    try {
      if (!this.contactImport.displayName.trim() || !this.contactImport.providerContactId.trim()) {
        throw new Error('Display name and provider contact id are required.');
      }

      await this.calApi.createImportedContact({
        displayName: this.contactImport.displayName.trim(),
        email: this.contactImport.email.trim() || undefined,
        phone: this.contactImport.phone.trim() || undefined,
        providerCode: this.contactImport.providerCode.trim(),
        providerContactId: this.contactImport.providerContactId.trim(),
      });

      this.contactImport = createContactImportDraft();
      this.message.set('Contact imported into current context.');
      this.contacts.set(await this.calApi.listImportedContacts());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to import contact.');
    }
  }

  availableDependencyTasksForDraft(draft: TaskDraft, excludeTaskId?: string) {
    const query = draft.dependencySearch.trim().toLowerCase();
    const selectedIds = new Set(draft.dependencyTaskIds);
    return this.tasks()
      .filter((task) => task.id !== excludeTaskId)
      .filter((task) => !selectedIds.has(task.id))
      .filter((task) => query.length === 0 || task.title.toLowerCase().includes(query))
      .slice(0, 8);
  }

  addDependencyToDraft(draft: TaskDraft, taskId: string) {
    draft.dependencyTaskIds = Array.from(new Set([...draft.dependencyTaskIds, taskId]));
    draft.dependencySearch = '';
  }

  removeDependencyFromDraft(draft: TaskDraft, taskId: string) {
    draft.dependencyTaskIds = draft.dependencyTaskIds.filter((id) => id !== taskId);
  }

  dependencyLabel(taskId: string) {
    return this.tasks().find((task) => task.id === taskId)?.title ?? taskId;
  }

  private isoLocalValue(date: Date) {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return offsetDate.toISOString().slice(0, 16);
  }
}
