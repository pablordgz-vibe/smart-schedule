import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContextService } from './context.service';
import {
  SchedApiError,
  SchedApiService,
  type ScheduleDetail,
  type ScheduleDraftDefinition,
  type ScheduleOccurrenceProjection,
  type ScheduleOccurrencePreview,
  type ScheduleSummary,
} from './sched-api.service';

type OccurrenceModalState = {
  action: 'cancel' | 'move' | 'replace';
  detached: boolean;
  error: string | null;
  includePast: boolean;
  movedToDate: string;
  overwriteExceptions: boolean;
  schedule: ScheduleDetail | null;
  scheduleId: string;
  scope: 'all' | 'selected' | 'selected_and_future';
  selectedItemId: string | null;
  target: ScheduleOccurrencePreview;
};

type OccurrenceCalendarDay = {
  date: string;
  entries: ScheduleOccurrenceProjection[];
  inCurrentMonth: boolean;
  isToday: boolean;
  label: string;
};

function formatOccurrenceLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function toMonthStartIso(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getMonthGrid(monthStartIso: string, occurrences: ScheduleOccurrenceProjection[]) {
  const [year, month] = monthStartIso.split('-').map((part) => Number(part));
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const gridStart = addDays(firstDay, -startOffset);
  const buckets = new Map<string, ScheduleOccurrenceProjection[]>();

  for (const occurrence of occurrences) {
    const current = buckets.get(occurrence.localDate) ?? [];
    current.push(occurrence);
    buckets.set(occurrence.localDate, current);
  }

  return Array.from({ length: 42 }, (_unused, index) => {
    const current = addDays(gridStart, index);
    const date = current.toISOString().slice(0, 10);
    return {
      date,
      entries: buckets.get(date) ?? [],
      inCurrentMonth: current.getUTCMonth() === firstDay.getUTCMonth(),
      isToday: date === new Date().toISOString().slice(0, 10),
      label: String(current.getUTCDate()),
    } satisfies OccurrenceCalendarDay;
  });
}

function sanitizeDefinition(
  schedule: ScheduleDetail['schedule'],
  options?: {
    includeItemIds?: boolean;
    includeVersionIds?: boolean;
    name?: string;
    state?: ScheduleDraftDefinition['state'];
  },
): ScheduleDraftDefinition {
  return {
    boundaryEndDate: schedule.boundaryEndDate,
    boundaryStartDate: schedule.boundaryStartDate,
    description: schedule.description,
    name: options?.name ?? schedule.name,
    state: options?.state ?? schedule.state,
    versions: schedule.versions.map((version) => ({
      effectiveFromDate: version.effectiveFromDate,
      id: options?.includeVersionIds ? version.id : undefined,
      items: version.items.map((item) => ({
        ...item,
        id: options?.includeItemIds ? item.id : undefined,
      })),
      recurrence: {
        ...version.recurrence,
        pauses: version.recurrence.pauses.map((pause) => ({ ...pause })),
        weekdays: [...version.recurrence.weekdays],
      },
      timezone: version.timezone,
      timezoneMode: version.timezoneMode,
    })),
  };
}

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="grid gap-6" data-testid="page-schedules">
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-5">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div class="max-w-3xl">
              <p class="ui-kicker">End-User Workspace</p>
              <h1 class="text-3xl font-semibold tracking-tight">Schedules</h1>
              <p class="ui-copy mt-2">
                Templates and active schedules stay separate, use the dedicated builder, and show
                recurrence and timezone behavior in plain language for {{ contextLabel() }}.
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <a class="btn btn-neutral" routerLink="/schedules/builder">New schedule</a>
              <div class="badge badge-outline h-11 px-4">{{ contextLabel() }}</div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <article class="rounded-box border border-base-300 bg-base-200/60 p-4">
              <p class="text-sm uppercase tracking-[0.24em] text-base-content/60">Visible</p>
              <strong class="mt-3 block text-3xl font-semibold">{{ schedules().length }}</strong>
              <p class="mt-2 text-sm text-base-content/70">
                {{ activeTab() === 'template' ? 'Reusable templates' : 'Operational schedules' }}
              </p>
            </article>
            <article class="rounded-box border border-base-300 bg-base-200/60 p-4">
              <p class="text-sm uppercase tracking-[0.24em] text-base-content/60">Exceptions</p>
              <strong class="mt-3 block text-3xl font-semibold">{{ exceptionCount() }}</strong>
              <p class="mt-2 text-sm text-base-content/70">
                Occurrence overrides that remain preserved unless explicitly overwritten.
              </p>
            </article>
            <article class="rounded-box border border-base-300 bg-base-200/60 p-4">
              <p class="text-sm uppercase tracking-[0.24em] text-base-content/60">Future changes</p>
              <strong class="mt-3 block text-3xl font-semibold">{{ versionCount() }}</strong>
              <p class="mt-2 text-sm text-base-content/70">
                Effective-from rule changes already captured in the canonical definition.
              </p>
            </article>
          </div>

          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="tabs tabs-boxed w-fit">
              <button
                class="tab"
                type="button"
                [class.tab-active]="activeTab() === 'template'"
                (click)="setTab('template')"
              >
                Templates
              </button>
              <button
                class="tab"
                type="button"
                [class.tab-active]="activeTab() === 'active'"
                (click)="setTab('active')"
              >
                Active schedules
              </button>
            </div>

            <label class="input input-bordered flex items-center gap-3 w-full max-w-md">
              <span class="text-base-content/50">Search</span>
              <input
                type="search"
                class="grow"
                placeholder="Name or summary"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
            </label>
          </div>

          <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
          <p class="alert alert-info" *ngIf="message()">{{ message() }}</p>
          <p class="alert alert-info" *ngIf="isLoading()">Loading schedules…</p>
        </div>
      </article>

      <section class="grid gap-4" *ngIf="schedules().length > 0">
        <article
          class="card border border-base-300 bg-base-100 shadow-sm"
          *ngFor="let schedule of schedules(); trackBy: trackBySchedule"
        >
          <div class="card-body gap-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-2xl font-semibold">{{ schedule.name }}</h2>
                  <span class="badge badge-primary badge-outline">{{ schedule.state }}</span>
                  <span class="badge badge-outline">{{ schedule.timezone }}</span>
                  <span class="badge badge-outline">{{ schedule.timezoneModeLabel }}</span>
                </div>
                <p class="text-sm leading-6 text-base-content/70">
                  {{ schedule.description || 'No description yet.' }}
                </p>
                <div class="flex flex-wrap gap-2 text-sm text-base-content/70">
                  <span class="badge badge-ghost"
                    >{{ schedule.itemSummary.eventCount }} events</span
                  >
                  <span class="badge badge-ghost">{{ schedule.itemSummary.taskCount }} tasks</span>
                  <span class="badge badge-ghost"
                    >{{ schedule.versionCount }} rule phase{{
                      schedule.versionCount === 1 ? '' : 's'
                    }}</span
                  >
                  <span class="badge badge-ghost">{{ schedule.exceptionCount }} exceptions</span>
                </div>
                <p class="text-sm font-medium">{{ schedule.recurrenceSummary }}</p>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  (click)="openBuilder(schedule.id)"
                >
                  Edit
                </button>
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  (click)="duplicateSchedule(schedule.id)"
                >
                  Duplicate
                </button>
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  (click)="toggleScheduleState(schedule)"
                >
                  {{ schedule.state === 'template' ? 'Activate' : 'Archive' }}
                </button>
              </div>
            </div>

            <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-semibold">Upcoming occurrences</h3>
                  <span class="text-xs uppercase tracking-[0.22em] text-base-content/50">
                    Next {{ schedule.nextOccurrences.length }}
                  </span>
                </div>
                <div
                  class="mt-4 grid gap-3"
                  *ngIf="schedule.nextOccurrences.length > 0; else emptyOccurrences"
                >
                  <article
                    class="rounded-box border border-base-300 bg-base-100 p-4"
                    *ngFor="let occurrence of schedule.nextOccurrences"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong class="block">{{ formatOccurrence(occurrence.date) }}</strong>
                        <p class="mt-1 text-sm text-base-content/65">
                          {{ occurrence.items.length }} generated item{{
                            occurrence.items.length === 1 ? '' : 's'
                          }}
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="openOccurrenceModal(schedule.id, occurrence, 'cancel')"
                        >
                          Cancel
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="openOccurrenceModal(schedule.id, occurrence, 'move')"
                        >
                          Move
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="openOccurrenceModal(schedule.id, occurrence, 'replace')"
                        >
                          Replace item
                        </button>
                      </div>
                    </div>
                    <ul class="mt-3 grid gap-2 text-sm text-base-content/75">
                      <li *ngFor="let item of occurrence.items">
                        <span class="badge badge-outline mr-2">{{ item.itemType }}</span>
                        {{ item.title }}
                      </li>
                    </ul>
                  </article>
                </div>
                <ng-template #emptyOccurrences>
                  <p class="mt-4 text-sm text-base-content/60">
                    No occurrences in the current preview window.
                  </p>
                </ng-template>
              </div>

              <div class="rounded-box border border-base-300 bg-base-100 p-4">
                <h3 class="text-lg font-semibold">Definition summary</h3>
                <dl class="mt-4 grid gap-3 text-sm">
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-base-content/60">Boundaries</dt>
                    <dd class="text-right">
                      {{ schedule.boundaryStartDate || 'Open start' }} to
                      {{ schedule.boundaryEndDate || 'Open end' }}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-base-content/60">Assignments</dt>
                    <dd>{{ schedule.assignmentCount }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-base-content/60">Validation</dt>
                    <dd>
                      {{
                        schedule.validation.length === 0
                          ? 'Clean'
                          : schedule.validation.length + ' message(s)'
                      }}
                    </dd>
                  </div>
                </dl>
                <div class="mt-4 space-y-2" *ngIf="schedule.validation.length > 0">
                  <div
                    class="alert py-2"
                    [class.alert-warning]="validation.level === 'warning'"
                    [class.alert-error]="validation.level === 'error'"
                    *ngFor="let validation of schedule.validation"
                  >
                    <span>{{ validation.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <article
        class="card border border-base-300 bg-base-100 shadow-sm"
        *ngIf="schedules().length > 0"
      >
        <div class="card-body gap-5">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 class="text-2xl font-semibold">Occurrence calendar</h2>
              <p class="text-sm text-base-content/70">
                Inspect generated schedule instances on a monthly grid without leaving the library.
              </p>
            </div>

            <div class="grid gap-3 md:grid-cols-[minmax(16rem,20rem)_auto_auto]">
              <label class="ui-field">
                <span>Schedule</span>
                <select
                  class="select select-bordered w-full"
                  [ngModel]="selectedScheduleId()"
                  (ngModelChange)="selectedScheduleId.set($event)"
                >
                  <option *ngFor="let schedule of schedules()" [ngValue]="schedule.id">
                    {{ schedule.name }}
                  </option>
                </select>
              </label>
              <button class="btn btn-outline" type="button" (click)="shiftCalendarMonth(-1)">
                Previous
              </button>
              <button class="btn btn-outline" type="button" (click)="shiftCalendarMonth(1)">
                Next
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm uppercase tracking-[0.24em] text-base-content/50">
                {{ calendarMonthLabel() }}
              </p>
              <p class="mt-1 text-sm text-base-content/70" *ngIf="selectedCalendarSchedule()">
                {{ selectedCalendarSchedule()?.recurrenceSummary }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2" *ngIf="selectedCalendarSchedule()">
              <span class="badge badge-outline">{{ selectedCalendarSchedule()?.timezone }}</span>
              <span class="badge badge-outline">{{
                selectedCalendarSchedule()?.timezoneModeLabel
              }}</span>
            </div>
          </div>

          <p class="alert alert-error" *ngIf="calendarError()">{{ calendarError() }}</p>
          <p class="alert alert-info" *ngIf="isCalendarLoading()">Loading occurrence calendar…</p>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <div
                class="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.24em] text-base-content/50"
              >
                <span *ngFor="let weekday of calendarWeekdays">{{ weekday }}</span>
              </div>

              <div class="mt-3 grid grid-cols-7 gap-2">
                <button
                  class="rounded-box border p-3 text-left transition"
                  type="button"
                  [class.border-primary]="day.date === selectedCalendarDay()"
                  [class.bg-base-200]="day.date === selectedCalendarDay()"
                  [class.border-base-300]="day.date !== selectedCalendarDay()"
                  [class.opacity-55]="!day.inCurrentMonth"
                  *ngFor="let day of calendarDays()"
                  (click)="selectedCalendarDay.set(day.date)"
                >
                  <span class="text-sm font-semibold">{{ day.label }}</span>
                  <span class="badge badge-primary badge-sm mt-2" *ngIf="day.entries.length > 0">
                    {{ day.entries.length }} item{{ day.entries.length === 1 ? '' : 's' }}
                  </span>
                  <span
                    class="badge badge-outline badge-sm mt-2"
                    *ngIf="day.entries.length === 0 && day.isToday"
                  >
                    Today
                  </span>
                  <ul
                    class="mt-3 space-y-1 text-xs text-base-content/70"
                    *ngIf="day.entries.length > 0"
                  >
                    <li *ngFor="let occurrence of day.entries.slice(0, 2)">
                      {{ occurrence.title }}
                    </li>
                    <li *ngIf="day.entries.length > 2">+{{ day.entries.length - 2 }} more</li>
                  </ul>
                </button>
              </div>
            </div>

            <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold">Selected day</h3>
                <span class="text-sm text-base-content/60">{{
                  formatOccurrence(selectedCalendarDay())
                }}</span>
              </div>

              <div
                class="mt-4 grid gap-3"
                *ngIf="selectedCalendarEntries().length > 0; else noCalendarEntries"
              >
                <article
                  class="rounded-box border border-base-300 bg-base-100 p-4"
                  *ngFor="let occurrence of selectedCalendarEntries()"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <strong class="block">{{ occurrence.title }}</strong>
                      <p class="mt-1 text-sm text-base-content/65">
                        {{ occurrence.itemType }} ·
                        {{ formatOccurrenceTime(occurrence.startsAt || occurrence.dueAt) }}
                      </p>
                    </div>
                    <span class="badge badge-outline" *ngIf="occurrence.detached">Detached</span>
                  </div>
                </article>
              </div>
              <ng-template #noCalendarEntries>
                <p class="mt-4 text-sm text-base-content/60">
                  No generated items on this day for the selected schedule.
                </p>
              </ng-template>
            </div>
          </div>
        </div>
      </article>

      <article
        class="card border border-dashed border-base-300 bg-base-100 shadow-sm"
        *ngIf="!isLoading() && schedules().length === 0"
      >
        <div class="card-body items-start gap-3">
          <h2 class="text-2xl font-semibold">
            {{ activeTab() === 'template' ? 'No templates yet' : 'No active schedules yet' }}
          </h2>
          <p class="text-sm text-base-content/70">
            Start in the dedicated builder so recurrence, timezone, and validation all stay in one
            place.
          </p>
          <a class="btn btn-neutral" routerLink="/schedules/builder">Open builder</a>
        </div>
      </article>
    </section>

    <div class="modal modal-open" *ngIf="occurrenceModal() as modal">
      <div class="modal-box max-w-3xl">
        <h2 class="text-2xl font-semibold">Occurrence update</h2>
        <p class="mt-2 text-sm text-base-content/70">
          {{ modal.target.occurrenceDate }} in {{ modalScheduleName() }}.
        </p>

        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <label class="ui-field">
            <span>Action</span>
            <select
              class="select select-bordered w-full"
              [ngModel]="modal.action"
              (ngModelChange)="patchModal({ action: $event })"
            >
              <option value="cancel">Cancel occurrence</option>
              <option value="move">Move occurrence</option>
              <option value="replace">Replace one item</option>
            </select>
          </label>

          <label class="ui-field">
            <span>Update scope</span>
            <select
              class="select select-bordered w-full"
              [ngModel]="modal.scope"
              (ngModelChange)="patchModal({ scope: $event })"
            >
              <option value="selected">Selected occurrence only</option>
              <option value="selected_and_future">Selected occurrence and future</option>
              <option value="all">All eligible occurrences</option>
            </select>
          </label>

          <label class="ui-field" *ngIf="modal.action === 'move'">
            <span>New occurrence date</span>
            <input
              class="input input-bordered w-full"
              type="date"
              [ngModel]="modal.movedToDate"
              (ngModelChange)="patchModal({ movedToDate: $event })"
            />
          </label>

          <label class="ui-field" *ngIf="modal.action === 'replace'">
            <span>Target item</span>
            <select
              class="select select-bordered w-full"
              [ngModel]="modal.selectedItemId"
              (ngModelChange)="patchModal({ selectedItemId: $event })"
            >
              <option *ngFor="let item of modalTargetItems()" [ngValue]="item.id">
                {{ item.title }}
              </option>
            </select>
          </label>
        </div>

        <div
          class="mt-4 rounded-box border border-base-300 bg-base-200/40 p-4"
          *ngIf="modal.action === 'replace'"
        >
          <h3 class="font-semibold">Replacement details</h3>
          <div class="mt-3 grid gap-4 md:grid-cols-2">
            <label class="ui-field">
              <span>Replacement title</span>
              <input
                class="input input-bordered w-full"
                [ngModel]="replacementTitle()"
                (ngModelChange)="replacementTitle.set($event)"
              />
            </label>
            <label class="ui-field">
              <span>Replacement time</span>
              <input
                class="input input-bordered w-full"
                type="time"
                [ngModel]="replacementTime()"
                (ngModelChange)="replacementTime.set($event)"
              />
            </label>
          </div>
        </div>

        <div class="mt-4 grid gap-3">
          <label class="label cursor-pointer justify-start gap-3">
            <input
              class="checkbox"
              type="checkbox"
              [ngModel]="modal.includePast"
              (ngModelChange)="patchModal({ includePast: $event })"
            />
            <span class="label-text">Include eligible past occurrences when relevant</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3" *ngIf="modal.action !== 'cancel'">
            <input
              class="checkbox"
              type="checkbox"
              [ngModel]="modal.detached"
              (ngModelChange)="patchModal({ detached: $event })"
            />
            <span class="label-text">Detach the modified occurrence from later series edits</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              class="checkbox"
              type="checkbox"
              [ngModel]="modal.overwriteExceptions"
              (ngModelChange)="patchModal({ overwriteExceptions: $event })"
            />
            <span class="label-text"
              >Overwrite conflicting exceptions if the API reports a conflict</span
            >
          </label>
        </div>

        <div class="alert alert-error mt-4" *ngIf="modal.error">{{ modal.error }}</div>

        <div class="modal-action">
          <button class="btn btn-ghost" type="button" (click)="closeOccurrenceModal()">
            Close
          </button>
          <button class="btn btn-neutral" type="button" (click)="submitOccurrenceModal()">
            Apply update
          </button>
        </div>
      </div>
      <form class="modal-backdrop" method="dialog">
        <button type="button" (click)="closeOccurrenceModal()">close</button>
      </form>
    </div>
  `,
})
export class SchedulesComponent {
  private readonly contextService = inject(ContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly schedApi = inject(SchedApiService);

  readonly activeTab = signal<'active' | 'template'>(
    this.route.snapshot.queryParamMap.get('tab') === 'active' ? 'active' : 'template',
  );
  readonly calendarDays = computed(() =>
    getMonthGrid(this.calendarMonthStart(), this.calendarOccurrences()),
  );
  readonly calendarError = signal<string | null>(null);
  readonly calendarMonthLabel = computed(() => formatMonthLabel(this.calendarMonthStart()));
  readonly calendarMonthStart = signal(toMonthStartIso(new Date()));
  readonly calendarOccurrences = signal<ScheduleOccurrenceProjection[]>([]);
  readonly calendarWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly error = signal<string | null>(null);
  readonly exceptionCount = computed(() =>
    this.schedules().reduce((total, schedule) => total + schedule.exceptionCount, 0),
  );
  readonly isCalendarLoading = signal(false);
  readonly isLoading = signal(false);
  readonly message = signal<string | null>(null);
  readonly modalScheduleName = computed(
    () => this.occurrenceModal()?.schedule?.schedule?.name ?? 'selected schedule',
  );
  readonly modalTargetItems = computed(() => {
    const modal = this.occurrenceModal();
    if (!modal?.schedule) {
      return [];
    }
    const version = modal.schedule.schedule.versions.find(
      (entry) => entry.id === modal.target.versionId,
    );
    return version?.items ?? [];
  });
  readonly occurrenceModal = signal<OccurrenceModalState | null>(null);
  readonly query = signal('');
  readonly replacementTime = signal('11:00');
  readonly replacementTitle = signal('Replacement item');
  readonly schedules = signal<ScheduleSummary[]>([]);
  readonly selectedCalendarDay = signal(new Date().toISOString().slice(0, 10));
  readonly selectedCalendarEntries = computed(() =>
    this.calendarOccurrences().filter((entry) => entry.localDate === this.selectedCalendarDay()),
  );
  readonly selectedCalendarSchedule = computed(
    () => this.schedules().find((schedule) => schedule.id === this.selectedScheduleId()) ?? null,
  );
  readonly selectedScheduleId = signal<string | null>(null);
  readonly versionCount = computed(() =>
    this.schedules().reduce((total, schedule) => total + schedule.versionCount, 0),
  );

  constructor() {
    effect(() => {
      this.contextService.activeContext();
      this.activeTab();
      this.query();
      void this.loadSchedules();
    });

    effect(() => {
      const scheduleId = this.selectedScheduleId();
      const monthStart = this.calendarMonthStart();

      if (!scheduleId) {
        this.calendarOccurrences.set([]);
        return;
      }

      void this.loadCalendar(scheduleId, monthStart);
    });
  }

  async loadSchedules() {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const schedules = await this.schedApi.listSchedules({
        query: this.query(),
        state: this.activeTab(),
      });
      this.schedules.set(schedules);

      const selected = this.selectedScheduleId();
      if (!selected || !schedules.some((schedule) => schedule.id === selected)) {
        this.selectedScheduleId.set(schedules[0]?.id ?? null);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load schedules.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tab: 'active' | 'template') {
    this.activeTab.set(tab);
  }

  trackBySchedule(_index: number, schedule: ScheduleSummary) {
    return schedule.id;
  }

  formatOccurrence(value: string) {
    return formatOccurrenceLabel(value);
  }

  formatOccurrenceTime(value: string | null) {
    if (!value) {
      return 'No time set';
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  }

  openBuilder(scheduleId?: string) {
    void this.router.navigate(['/schedules/builder'], {
      queryParams: scheduleId ? { scheduleId } : undefined,
    });
  }

  shiftCalendarMonth(direction: -1 | 1) {
    const [year, month] = this.calendarMonthStart()
      .split('-')
      .map((part) => Number(part));
    const nextMonthStart = toMonthStartIso(new Date(Date.UTC(year, month - 1 + direction, 1)));

    this.calendarMonthStart.set(nextMonthStart);
    if (!this.selectedCalendarDay().startsWith(nextMonthStart.slice(0, 7))) {
      this.selectedCalendarDay.set(nextMonthStart);
    }
  }

  async duplicateSchedule(scheduleId: string) {
    this.message.set(null);
    this.error.set(null);

    try {
      const detail = await this.schedApi.getSchedule(scheduleId);
      await this.schedApi.create(
        sanitizeDefinition(detail.schedule, {
          name: `${detail.schedule.name} copy`,
        }),
      );
      this.message.set('Schedule duplicated.');
      await this.loadSchedules();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to duplicate schedule.');
    }
  }

  async toggleScheduleState(schedule: ScheduleSummary) {
    this.error.set(null);
    this.message.set(null);

    try {
      const detail = await this.schedApi.getSchedule(schedule.id);
      await this.schedApi.update(schedule.id, {
        definition: sanitizeDefinition(detail.schedule, {
          includeItemIds: true,
          includeVersionIds: true,
          state: schedule.state === 'template' ? 'active' : 'archived',
        }),
      });
      this.message.set(
        schedule.state === 'template' ? 'Template activated.' : 'Schedule archived.',
      );
      await this.loadSchedules();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to update the schedule.');
    }
  }

  async openOccurrenceModal(
    scheduleId: string,
    occurrence: ScheduleOccurrencePreview,
    action: 'cancel' | 'move' | 'replace',
  ) {
    this.error.set(null);
    const schedule = await this.schedApi.getSchedule(scheduleId).catch(() => null);
    const firstItem = schedule?.schedule.versions.find((entry) => entry.id === occurrence.versionId)
      ?.items[0];

    this.replacementTitle.set(firstItem?.title ?? 'Replacement item');
    this.replacementTime.set(firstItem?.dueTime ?? firstItem?.startTime ?? '11:00');
    this.occurrenceModal.set({
      action,
      detached: false,
      error: null,
      includePast: false,
      movedToDate: occurrence.date,
      overwriteExceptions: false,
      schedule,
      scheduleId,
      scope: 'selected',
      selectedItemId: firstItem?.id ?? null,
      target: occurrence,
    });
  }

  patchModal(patch: Partial<OccurrenceModalState>) {
    const current = this.occurrenceModal();
    if (!current) {
      return;
    }
    this.occurrenceModal.set({
      ...current,
      ...patch,
      error: patch.error ?? current.error,
    });
  }

  closeOccurrenceModal() {
    this.occurrenceModal.set(null);
  }

  async submitOccurrenceModal() {
    const modal = this.occurrenceModal();
    if (!modal) {
      return;
    }

    const targetItem = this.modalTargetItems().find((item) => item.id === modal.selectedItemId);

    try {
      await this.schedApi.mutateOccurrence(modal.scheduleId, modal.target.occurrenceDate, {
        action: modal.action,
        detached: modal.detached,
        includePast: modal.includePast,
        movedToDate: modal.action === 'move' ? modal.movedToDate : null,
        overrideItem:
          modal.action === 'replace' && targetItem
            ? {
                ...targetItem,
                dueTime:
                  targetItem.itemType === 'task' ? this.replacementTime() : targetItem.dueTime,
                startTime:
                  targetItem.itemType === 'event' ? this.replacementTime() : targetItem.startTime,
                title: this.replacementTitle(),
              }
            : null,
        overwriteExceptions: modal.overwriteExceptions,
        scope: modal.scope,
        targetItemId: modal.action === 'replace' ? modal.selectedItemId : null,
      });
      this.message.set('Occurrence update applied.');
      this.closeOccurrenceModal();
      await this.loadSchedules();
    } catch (error) {
      if (error instanceof SchedApiError && error.details.dates?.length) {
        this.patchModal({
          error:
            'This change conflicts with existing exceptions. Enable overwrite if that is intended.',
        });
        return;
      }

      this.patchModal({
        error: error instanceof Error ? error.message : 'Failed to mutate the occurrence.',
      });
    }
  }

  private async loadCalendar(scheduleId: string, monthStart: string) {
    this.isCalendarLoading.set(true);
    this.calendarError.set(null);

    try {
      const [year, month] = monthStart.split('-').map((part) => Number(part));
      const occurrences = await this.schedApi.listOccurrences(scheduleId, {
        from: monthStart,
        to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
      });
      this.calendarOccurrences.set(occurrences);

      if (!this.selectedCalendarDay().startsWith(monthStart.slice(0, 7))) {
        this.selectedCalendarDay.set(monthStart);
      }
    } catch (error) {
      this.calendarError.set(
        error instanceof Error ? error.message : 'Failed to load the occurrence calendar.',
      );
    } finally {
      this.isCalendarLoading.set(false);
    }
  }
}
