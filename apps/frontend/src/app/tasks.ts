import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalApiService, type CalendarSummary, type ImportedContact } from './cal-api.service';
import { ContextService } from './context.service';

type TaskRow = {
  id: string;
  title: string;
  dueAt: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  allocation: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  estimatedDurationMinutes: number | null;
  subtaskSummary: { completed: number; total: number };
  taskDependencyCount: number;
  workRelated: boolean;
};

type TaskDetail = {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueAt: string | null;
  timezone: string;
  notes: string | null;
  location: string | null;
  workRelated: boolean;
  estimatedDurationMinutes: number | null;
  allocation: {
    allocatedMinutes: number;
    estimateMinutes: number | null;
    overAllocated: boolean;
    remainingMinutes: number | null;
  };
  autoCompleteFromSubtasks: boolean;
  subtasks: Array<{ id: string; title: string; completed: boolean }>;
  dependencies: string[];
  linkedEvents: Array<{ id: string; title: string; startAt: string | null; endAt: string | null }>;
  contacts: ImportedContact[];
  attachments: Array<{ id: string; fileName: string; state: string }>;
  provenance: {
    sourceContextType: 'organization' | 'personal';
    sourceOrganizationId: string | null;
    sourceItemId: string;
    copiedAt: string;
  } | null;
  calendars: Array<{ calendarId: string; calendarName: string }>;
};

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-page" data-testid="page-tasks">
      <article class="ui-card">
        <p class="ui-kicker">End-User Workspace</p>
        <h1>Task Overview</h1>
        <p class="ui-copy">
          Tasks with and without deadlines are managed here for {{ contextLabel() }}.
        </p>

        <div class="ui-toolbar">
          <input class="ui-input" placeholder="Search by name" [(ngModel)]="filters.name" />
          <select class="ui-select" [(ngModel)]="filters.deadlinePeriod">
            <option value="all">All deadlines</option>
            <option value="none">No deadline</option>
            <option value="overdue">Overdue</option>
            <option value="next_7_days">Next 7 days</option>
            <option value="next_30_days">Next 30 days</option>
          </select>
          <select class="ui-select" [(ngModel)]="filters.status">
            <option value="all">All statuses</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>
          <select class="ui-select" [(ngModel)]="filters.priority">
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button class="ui-button ui-button-secondary" type="button" (click)="loadTasks()">
            Apply
          </button>
        </div>

        <p class="ui-banner ui-banner-warning" *ngIf="error()">{{ error() }}</p>
      </article>

      <article class="ui-card split-layout">
        <section>
          <h2>Create task</h2>
          <form class="stack" (ngSubmit)="createTask()">
            <input
              class="ui-input"
              placeholder="Title"
              [(ngModel)]="draft.title"
              name="task-title"
            />
            <input
              class="ui-input"
              type="datetime-local"
              [(ngModel)]="draft.dueAt"
              name="task-due"
            />
            <input
              class="ui-input"
              type="number"
              min="0"
              max="1440"
              [(ngModel)]="draft.estimatedDurationMinutes"
              name="task-estimated-duration"
              placeholder="Estimated duration (minutes)"
            />
            <label class="ui-field compact-field">
              <span>Auto-complete from subtasks</span>
              <input
                type="checkbox"
                [(ngModel)]="draft.autoCompleteFromSubtasks"
                name="task-auto-complete"
              />
            </label>
            <select class="ui-select" multiple [(ngModel)]="draft.contactIds" name="task-contacts">
              <option *ngFor="let contact of contacts()" [value]="contact.id">
                {{ contact.displayName }}
              </option>
            </select>
            <button class="ui-button ui-button-primary" type="submit">Create task</button>
          </form>

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
                  {{ task.subtaskSummary.completed }}/{{ task.subtaskSummary.total }}
                </p>
              </div>
            </li>
            <li *ngIf="tasks().length === 0" class="ui-copy">No tasks for current filters.</li>
          </ul>
        </section>

        <section>
          <h2>Task details</h2>
          <ng-container *ngIf="selectedTask(); else noTaskSelected">
            <p class="ui-copy">{{ selectedTask()!.title }}</p>

            <div class="ui-state-grid">
              <article class="ui-state ui-state-info">
                <h3>Allocation</h3>
                <p>
                  {{ selectedTask()!.allocation.allocatedMinutes }}m allocated of
                  {{ selectedTask()!.allocation.estimateMinutes ?? 'n/a' }}m estimate.
                </p>
              </article>
              <article
                class="ui-state ui-state-warning"
                *ngIf="selectedTask()!.allocation.overAllocated"
              >
                <h3>Over-allocation warning</h3>
                <p>Planned linked event time exceeds estimate, but edits remain allowed.</p>
              </article>
            </div>

            <p class="ui-banner ui-banner-warning" *ngIf="selectedTask()!.provenance">
              Copied from {{ selectedTask()!.provenance!.sourceContextType }} item
              {{ selectedTask()!.provenance!.sourceItemId }} on
              {{ selectedTask()!.provenance!.copiedAt }}.
            </p>

            <div class="ui-meta-grid">
              <div class="ui-panel">
                <h3>Subtasks</h3>
                <ul>
                  <li *ngFor="let subtask of selectedTask()!.subtasks">
                    {{ subtask.completed ? '✓' : '○' }} {{ subtask.title }}
                  </li>
                  <li *ngIf="selectedTask()!.subtasks.length === 0">No subtasks.</li>
                </ul>
              </div>
              <div class="ui-panel">
                <h3>Dependencies</h3>
                <ul>
                  <li *ngFor="let dependency of selectedTask()!.dependencies">{{ dependency }}</li>
                  <li *ngIf="selectedTask()!.dependencies.length === 0">No dependencies.</li>
                </ul>
              </div>
              <div class="ui-panel">
                <h3>Linked work events</h3>
                <ul>
                  <li *ngFor="let event of selectedTask()!.linkedEvents">
                    {{ event.title }} ({{ event.startAt || 'n/a' }})
                  </li>
                  <li *ngIf="selectedTask()!.linkedEvents.length === 0">No linked events.</li>
                </ul>
              </div>
              <div class="ui-panel">
                <h3>Contacts and attachments</h3>
                <ul>
                  <li *ngFor="let contact of selectedTask()!.contacts">
                    {{ contact.displayName }}
                  </li>
                  <li *ngIf="selectedTask()!.contacts.length === 0">No contacts.</li>
                </ul>
                <ul>
                  <li *ngFor="let attachment of selectedTask()!.attachments">
                    {{ attachment.fileName }} ({{ attachment.state }})
                  </li>
                  <li *ngIf="selectedTask()!.attachments.length === 0">No attachments.</li>
                </ul>
              </div>
            </div>

            <form class="stack" (ngSubmit)="saveTaskUpdates()">
              <h3>Edit task</h3>
              <input class="ui-input" [(ngModel)]="editDraft.title" name="edit-task-title" />
              <input
                class="ui-input"
                type="datetime-local"
                [(ngModel)]="editDraft.dueAt"
                name="edit-task-due"
              />
              <select class="ui-select" [(ngModel)]="editDraft.status" name="edit-task-status">
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
              <select class="ui-select" [(ngModel)]="editDraft.priority" name="edit-task-priority">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button class="ui-button ui-button-primary" type="submit">Save task updates</button>
            </form>
          </ng-container>

          <ng-template #noTaskSelected>
            <p class="ui-copy">
              Select a task to inspect subtasks, dependencies, linked events, and history hooks.
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
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: var(--spacing-6);
      }

      .stack {
        display: grid;
        gap: var(--spacing-3);
        margin-bottom: var(--spacing-6);
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

      @media (max-width: 980px) {
        .split-layout {
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

  readonly tasks = signal<TaskRow[]>([]);
  readonly selectedTask = signal<TaskDetail | null>(null);
  readonly selectedTaskId = signal<string | null>(null);
  readonly contacts = signal<ImportedContact[]>([]);
  readonly calendars = signal<CalendarSummary[]>([]);
  readonly error = signal<string | null>(null);

  filters: {
    name: string;
    deadlinePeriod: 'all' | 'none' | 'overdue' | 'next_30_days' | 'next_7_days';
    status: 'all' | 'blocked' | 'completed' | 'in_progress' | 'todo';
    priority: 'all' | 'high' | 'low' | 'medium' | 'urgent';
  } = {
    deadlinePeriod: 'all',
    name: '',
    priority: 'all',
    status: 'all',
  };

  draft = {
    title: '',
    dueAt: '',
    estimatedDurationMinutes: 60,
    autoCompleteFromSubtasks: false,
    contactIds: [] as string[],
  };

  editDraft = {
    title: '',
    dueAt: '',
    status: 'todo' as TaskDetail['status'],
    priority: 'medium' as TaskDetail['priority'],
  };

  constructor() {
    void this.bootstrap();
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
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load tasks workspace.');
    }
  }

  async loadTasks() {
    this.error.set(null);
    try {
      this.tasks.set((await this.calApi.listTasks(this.filters)) as TaskRow[]);
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
        dueAt: task.dueAt ? this.isoLocalValue(new Date(task.dueAt)) : '',
        priority: task.priority,
        status: task.status,
        title: task.title,
      };
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load task details.');
    }
  }

  async createTask() {
    this.error.set(null);
    try {
      if (!this.draft.title.trim()) {
        throw new Error('Task title is required.');
      }

      const payload: Record<string, unknown> = {
        autoCompleteFromSubtasks: this.draft.autoCompleteFromSubtasks,
        calendarIds: this.calendars().map((calendar) => calendar.id),
        contactIds: this.draft.contactIds,
        estimatedDurationMinutes: this.draft.estimatedDurationMinutes,
        priority: 'medium',
        status: 'todo',
        title: this.draft.title,
      };

      if (this.draft.dueAt) {
        payload['dueAt'] = new Date(this.draft.dueAt).toISOString();
      }

      await this.calApi.createTask(payload);

      this.draft.title = '';
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
    try {
      const patch: Record<string, unknown> = {
        priority: this.editDraft.priority,
        status: this.editDraft.status,
        title: this.editDraft.title,
      };
      if (this.editDraft.dueAt) {
        patch['dueAt'] = new Date(this.editDraft.dueAt).toISOString();
      }

      await this.calApi.updateTask(selected.id, patch);

      await this.selectTask(selected.id);
      await this.loadTasks();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to update task.');
    }
  }

  private isoLocalValue(date: Date) {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return offsetDate.toISOString().slice(0, 16);
  }
}
