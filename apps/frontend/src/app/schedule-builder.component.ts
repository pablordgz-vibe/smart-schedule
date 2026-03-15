import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DirtyStateService } from './dirty-state.service';
import {
  SchedApiError,
  SchedApiService,
  type ScheduleDetail,
  type ScheduleDraftDefinition,
  type ScheduleDraftItem,
  type ScheduleDraftVersion,
  type ScheduleOccurrencePreview,
  type ScheduleValidationMessage,
} from './sched-api.service';

type SaveScopeState = {
  anchorDate: string;
  error: string | null;
  includePast: boolean;
  overwriteExceptions: boolean;
  scope: 'all' | 'selected_and_future';
};

function createDraftItem(kind: 'event' | 'task' = 'event'): ScheduleDraftItem {
  return {
    dayOffset: 0,
    dueTime: kind === 'task' ? '11:00' : null,
    durationMinutes: kind === 'event' ? 60 : null,
    itemType: kind,
    repetitionMode: 'grouped',
    startTime: kind === 'event' ? '09:00' : null,
    title: kind === 'event' ? 'New event block' : 'New task',
    workRelated: true,
  };
}

function createDraftVersion(): ScheduleDraftVersion {
  return {
    effectiveFromDate: new Date().toISOString().slice(0, 10),
    items: [createDraftItem('event')],
    recurrence: {
      frequency: 'weekly',
      interval: 1,
      pauses: [],
      weekdays: [1],
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    timezoneMode: 'wall_clock',
  };
}

function createDraftDefinition(): ScheduleDraftDefinition {
  return {
    boundaryEndDate: null,
    boundaryStartDate: new Date().toISOString().slice(0, 10),
    description: '',
    name: '',
    state: 'template',
    versions: [createDraftVersion()],
  };
}

function cloneDraft(definition: ScheduleDraftDefinition): ScheduleDraftDefinition {
  return JSON.parse(JSON.stringify(definition)) as ScheduleDraftDefinition;
}

@Component({
  selector: 'app-schedule-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="grid gap-6" data-testid="page-schedule-builder">
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-5">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div class="max-w-3xl">
              <p class="ui-kicker">Mutation Surface</p>
              <h1 class="text-3xl font-semibold tracking-tight">
                {{ isEditing() ? 'Edit Schedule' : 'Schedule Builder' }}
              </h1>
              <p class="ui-copy mt-2">
                Define the canonical schedule, preview generated occurrences, and save through the
                dedicated builder only.
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <a class="btn btn-ghost" routerLink="/schedules">Back to library</a>
              <button class="btn btn-neutral" type="button" (click)="save()">
                {{ isEditing() ? 'Save changes' : 'Create schedule' }}
              </button>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
            <aside class="rounded-box border border-base-300 bg-base-200/40 p-4">
              <p class="text-xs uppercase tracking-[0.24em] text-base-content/60">Sections</p>
              <ul class="mt-3 grid gap-2 text-sm">
                <li><a class="link link-hover" href="#builder-basics">Basics</a></li>
                <li><a class="link link-hover" href="#builder-items">Items</a></li>
                <li><a class="link link-hover" href="#builder-recurrence">Recurrence</a></li>
                <li><a class="link link-hover" href="#builder-timezone">Timezone/DST</a></li>
                <li><a class="link link-hover" href="#builder-review">Review</a></li>
              </ul>
            </aside>

            <div class="grid gap-4">
              <article class="card border border-base-300 bg-base-100" id="builder-basics">
                <div class="card-body gap-4">
                  <div>
                    <h2 class="text-xl font-semibold">Basics</h2>
                    <p class="text-sm text-base-content/65">
                      Keep template state separate from active operational schedules and capture
                      optional boundaries.
                    </p>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <label class="ui-field">
                      <span>Name</span>
                      <input
                        class="input input-bordered w-full"
                        [ngModel]="draft().name"
                        (ngModelChange)="patchDraft({ name: $event })"
                        placeholder="Support rota"
                      />
                    </label>
                    <label class="ui-field">
                      <span>State</span>
                      <select
                        class="select select-bordered w-full"
                        [ngModel]="draft().state"
                        (ngModelChange)="patchDraft({ state: $event })"
                      >
                        <option value="template">Template</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <label class="ui-field md:col-span-2">
                      <span>Description</span>
                      <textarea
                        class="textarea textarea-bordered min-h-28 w-full"
                        [ngModel]="draft().description"
                        (ngModelChange)="patchDraft({ description: $event })"
                      ></textarea>
                    </label>
                    <label class="ui-field">
                      <span>Boundary start</span>
                      <input
                        class="input input-bordered w-full"
                        type="date"
                        [ngModel]="draft().boundaryStartDate"
                        (ngModelChange)="patchDraft({ boundaryStartDate: $event || null })"
                      />
                    </label>
                    <label class="ui-field">
                      <span>Boundary end</span>
                      <input
                        class="input input-bordered w-full"
                        type="date"
                        [ngModel]="draft().boundaryEndDate"
                        (ngModelChange)="patchDraft({ boundaryEndDate: $event || null })"
                      />
                    </label>
                  </div>
                </div>
              </article>

              <article class="card border border-base-300 bg-base-100" id="builder-items">
                <div class="card-body gap-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 class="text-xl font-semibold">Items</h2>
                      <p class="text-sm text-base-content/65">
                        Mix event and task definitions, spread them across days, and choose grouped
                        or individual repetition treatment.
                      </p>
                    </div>
                    <div class="flex gap-2">
                      <button
                        class="btn btn-outline btn-sm"
                        type="button"
                        (click)="addItem('event')"
                      >
                        Add event
                      </button>
                      <button
                        class="btn btn-outline btn-sm"
                        type="button"
                        (click)="addItem('task')"
                      >
                        Add task
                      </button>
                    </div>
                  </div>

                  <div
                    class="grid gap-4"
                    *ngFor="let item of primaryVersion().items; let index = index"
                  >
                    <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <strong>{{ item.title || 'Item ' + (index + 1) }}</strong>
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="removeItem(index)"
                          [disabled]="primaryVersion().items.length === 1"
                        >
                          Remove
                        </button>
                      </div>
                      <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label class="ui-field">
                          <span>Title</span>
                          <input
                            class="input input-bordered w-full"
                            [ngModel]="item.title"
                            (ngModelChange)="patchItem(index, { title: $event })"
                          />
                        </label>
                        <label class="ui-field">
                          <span>Type</span>
                          <select
                            class="select select-bordered w-full"
                            [ngModel]="item.itemType"
                            (ngModelChange)="changeItemType(index, $event)"
                          >
                            <option value="event">Event</option>
                            <option value="task">Task</option>
                          </select>
                        </label>
                        <label class="ui-field">
                          <span>Day offset</span>
                          <input
                            class="input input-bordered w-full"
                            type="number"
                            [ngModel]="item.dayOffset"
                            (ngModelChange)="patchItem(index, { dayOffset: toInt($event, 0) })"
                          />
                        </label>
                        <label class="ui-field">
                          <span>{{ item.itemType === 'event' ? 'Start time' : 'Due time' }}</span>
                          <input
                            class="input input-bordered w-full"
                            type="time"
                            [ngModel]="item.itemType === 'event' ? item.startTime : item.dueTime"
                            (ngModelChange)="
                              patchItem(
                                index,
                                item.itemType === 'event'
                                  ? { startTime: $event }
                                  : { dueTime: $event }
                              )
                            "
                          />
                        </label>
                        <label class="ui-field" *ngIf="item.itemType === 'event'">
                          <span>Duration (minutes)</span>
                          <input
                            class="input input-bordered w-full"
                            type="number"
                            [ngModel]="item.durationMinutes"
                            (ngModelChange)="
                              patchItem(index, { durationMinutes: toInt($event, 60) })
                            "
                          />
                        </label>
                        <label class="ui-field">
                          <span>Repetition mode</span>
                          <select
                            class="select select-bordered w-full"
                            [ngModel]="item.repetitionMode"
                            (ngModelChange)="patchItem(index, { repetitionMode: $event })"
                          >
                            <option value="grouped">Grouped</option>
                            <option value="individual">Individual</option>
                          </select>
                        </label>
                        <label class="ui-field">
                          <span>Group key</span>
                          <input
                            class="input input-bordered w-full"
                            [ngModel]="item.groupKey"
                            (ngModelChange)="patchItem(index, { groupKey: $event || null })"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="card border border-base-300 bg-base-100" id="builder-recurrence">
                <div class="card-body gap-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 class="text-xl font-semibold">Recurrence</h2>
                      <p class="text-sm text-base-content/65">
                        Add future rule changes, pause windows, weekly weekday selection, and
                        monthly day-of-month behavior.
                      </p>
                    </div>
                    <button class="btn btn-outline btn-sm" type="button" (click)="addVersion()">
                      Add future change
                    </button>
                  </div>

                  <div
                    class="grid gap-4"
                    *ngFor="let version of draft().versions; let versionIndex = index"
                  >
                    <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <strong>Rule phase {{ versionIndex + 1 }}</strong>
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="removeVersion(versionIndex)"
                          [disabled]="draft().versions.length === 1"
                        >
                          Remove
                        </button>
                      </div>
                      <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label class="ui-field">
                          <span>Effective from</span>
                          <input
                            class="input input-bordered w-full"
                            type="date"
                            [ngModel]="version.effectiveFromDate"
                            (ngModelChange)="
                              patchVersion(versionIndex, { effectiveFromDate: $event })
                            "
                          />
                        </label>
                        <label class="ui-field">
                          <span>Frequency</span>
                          <select
                            class="select select-bordered w-full"
                            [ngModel]="version.recurrence.frequency"
                            (ngModelChange)="patchRecurrence(versionIndex, { frequency: $event })"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </label>
                        <label class="ui-field">
                          <span>Interval</span>
                          <input
                            class="input input-bordered w-full"
                            type="number"
                            [ngModel]="version.recurrence.interval"
                            (ngModelChange)="
                              patchRecurrence(versionIndex, { interval: toInt($event, 1) })
                            "
                          />
                        </label>
                        <label class="ui-field" *ngIf="version.recurrence.frequency === 'monthly'">
                          <span>Day of month</span>
                          <input
                            class="input input-bordered w-full"
                            type="number"
                            [ngModel]="version.recurrence.dayOfMonth"
                            (ngModelChange)="
                              patchRecurrence(versionIndex, { dayOfMonth: toInt($event, 1) })
                            "
                          />
                        </label>
                      </div>

                      <div
                        class="mt-4 grid gap-3"
                        *ngIf="version.recurrence.frequency === 'weekly'"
                      >
                        <span class="text-sm font-medium">Weekdays</span>
                        <div class="flex flex-wrap gap-2">
                          <label
                            class="btn btn-sm"
                            [class.btn-neutral]="
                              version.recurrence.weekdays.includes(weekday.value)
                            "
                            [class.btn-outline]="
                              !version.recurrence.weekdays.includes(weekday.value)
                            "
                            *ngFor="let weekday of weekdays"
                          >
                            <input
                              class="hidden"
                              type="checkbox"
                              [checked]="version.recurrence.weekdays.includes(weekday.value)"
                              (change)="toggleWeekday(versionIndex, weekday.value)"
                            />
                            {{ weekday.label }}
                          </label>
                        </div>
                      </div>

                      <div class="mt-4 rounded-box border border-base-300 bg-base-100 p-4">
                        <div class="flex items-center justify-between gap-3">
                          <strong>Pause windows</strong>
                          <button
                            class="btn btn-ghost btn-xs"
                            type="button"
                            (click)="addPause(versionIndex)"
                          >
                            Add pause
                          </button>
                        </div>
                        <div
                          class="grid gap-3 mt-3"
                          *ngIf="version.recurrence.pauses.length > 0; else noPauses"
                        >
                          <div
                            class="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                            *ngFor="let pause of version.recurrence.pauses; let pauseIndex = index"
                          >
                            <input
                              class="input input-bordered w-full"
                              type="date"
                              [ngModel]="pause.startDate"
                              (ngModelChange)="
                                patchPause(versionIndex, pauseIndex, { startDate: $event })
                              "
                            />
                            <input
                              class="input input-bordered w-full"
                              type="date"
                              [ngModel]="pause.endDate"
                              (ngModelChange)="
                                patchPause(versionIndex, pauseIndex, { endDate: $event })
                              "
                            />
                            <button
                              class="btn btn-ghost"
                              type="button"
                              (click)="removePause(versionIndex, pauseIndex)"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <ng-template #noPauses>
                          <p class="mt-3 text-sm text-base-content/60">
                            No pause windows for this phase.
                          </p>
                        </ng-template>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="card border border-base-300 bg-base-100" id="builder-timezone">
                <div class="card-body gap-4">
                  <div>
                    <h2 class="text-xl font-semibold">Timezone / DST</h2>
                    <p class="text-sm text-base-content/65">
                      Each rule phase can choose whether local wall-clock time stays fixed or the
                      UTC instant stays fixed through DST changes.
                    </p>
                  </div>
                  <div
                    class="grid gap-4"
                    *ngFor="let version of draft().versions; let versionIndex = index"
                  >
                    <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
                      <strong>Rule phase {{ versionIndex + 1 }}</strong>
                      <div class="mt-4 grid gap-4 md:grid-cols-2">
                        <label class="ui-field">
                          <span>Timezone</span>
                          <input
                            class="input input-bordered w-full"
                            [ngModel]="version.timezone"
                            (ngModelChange)="patchVersion(versionIndex, { timezone: $event })"
                          />
                        </label>
                        <label class="ui-field">
                          <span>DST mode</span>
                          <select
                            class="select select-bordered w-full"
                            [ngModel]="version.timezoneMode"
                            (ngModelChange)="patchVersion(versionIndex, { timezoneMode: $event })"
                          >
                            <option value="wall_clock">Keep local wall-clock time constant</option>
                            <option value="utc_constant">Keep UTC instant constant</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="card border border-base-300 bg-base-100" id="builder-review">
                <div class="card-body gap-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 class="text-xl font-semibold">Review</h2>
                      <p class="text-sm text-base-content/65">
                        Preview generated occurrences and plain-language validation before you save.
                      </p>
                    </div>
                    <button class="btn btn-outline btn-sm" type="button" (click)="refreshPreview()">
                      Refresh preview
                    </button>
                  </div>

                  <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
                  <p class="alert alert-info" *ngIf="isPreviewLoading()">Refreshing preview…</p>

                  <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div class="rounded-box border border-base-300 bg-base-200/30 p-4">
                      <h3 class="text-lg font-semibold">Upcoming occurrences</h3>
                      <div
                        class="mt-4 grid gap-3"
                        *ngIf="previewOccurrences().length > 0; else previewEmpty"
                      >
                        <article
                          class="rounded-box border border-base-300 bg-base-100 p-4"
                          *ngFor="let occurrence of previewOccurrences()"
                        >
                          <strong>{{ occurrence.date }}</strong>
                          <ul class="mt-2 grid gap-2 text-sm text-base-content/75">
                            <li *ngFor="let item of occurrence.items">
                              <span class="badge badge-outline mr-2">{{ item.itemType }}</span>
                              {{ item.title }}
                            </li>
                          </ul>
                        </article>
                      </div>
                      <ng-template #previewEmpty>
                        <p class="mt-4 text-sm text-base-content/60">
                          No occurrences available in the preview window.
                        </p>
                      </ng-template>
                    </div>

                    <div class="rounded-box border border-base-300 bg-base-100 p-4">
                      <h3 class="text-lg font-semibold">Validation</h3>
                      <div
                        class="mt-4 space-y-3"
                        *ngIf="validation().length > 0; else validationClean"
                      >
                        <article
                          class="alert"
                          [class.alert-warning]="message.level === 'warning'"
                          [class.alert-error]="message.level === 'error'"
                          *ngFor="let message of validation()"
                        >
                          <div>
                            <strong class="block">{{ message.field }}</strong>
                            <span>{{ message.message }}</span>
                          </div>
                        </article>
                      </div>
                      <ng-template #validationClean>
                        <p class="mt-4 text-sm text-base-content/60">
                          No validation messages at the moment.
                        </p>
                      </ng-template>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </article>
    </section>

    <div class="modal modal-open" *ngIf="saveScope() as modal">
      <div class="modal-box max-w-2xl">
        <h2 class="text-2xl font-semibold">Recurrence scope</h2>
        <p class="mt-2 text-sm text-base-content/70">
          Series edits must declare which occurrences should change and whether past eligible
          occurrences stay included.
        </p>

        <div class="mt-5 grid gap-4">
          <label class="ui-field">
            <span>Update scope</span>
            <select
              class="select select-bordered w-full"
              [ngModel]="modal.scope"
              (ngModelChange)="patchSaveScope({ scope: $event })"
            >
              <option value="selected_and_future">Selected occurrence and future</option>
              <option value="all">All eligible occurrences</option>
            </select>
          </label>
          <label class="ui-field">
            <span>Anchor occurrence date</span>
            <input
              class="input input-bordered w-full"
              type="date"
              [ngModel]="modal.anchorDate"
              (ngModelChange)="patchSaveScope({ anchorDate: $event })"
            />
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              class="checkbox"
              type="checkbox"
              [ngModel]="modal.includePast"
              (ngModelChange)="patchSaveScope({ includePast: $event })"
            />
            <span class="label-text">Include eligible past occurrences when relevant</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              class="checkbox"
              type="checkbox"
              [ngModel]="modal.overwriteExceptions"
              (ngModelChange)="patchSaveScope({ overwriteExceptions: $event })"
            />
            <span class="label-text"
              >Overwrite conflicting exceptions if the API requires confirmation</span
            >
          </label>
        </div>

        <div class="alert alert-error mt-4" *ngIf="modal.error">{{ modal.error }}</div>

        <div class="modal-action">
          <button class="btn btn-ghost" type="button" (click)="saveScope.set(null)">Cancel</button>
          <button class="btn btn-neutral" type="button" (click)="confirmScopedSave()">
            Apply save
          </button>
        </div>
      </div>
      <form class="modal-backdrop" method="dialog">
        <button type="button" (click)="saveScope.set(null)">close</button>
      </form>
    </div>
  `,
})
export class ScheduleBuilderComponent {
  private readonly dirtyState = inject(DirtyStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly schedApi = inject(SchedApiService);

  readonly draft = signal<ScheduleDraftDefinition>(createDraftDefinition());
  readonly error = signal<string | null>(null);
  readonly isPreviewLoading = signal(false);
  readonly isSaving = signal(false);
  readonly loadedDetail = signal<ScheduleDetail | null>(null);
  readonly baselineJson = signal(JSON.stringify(createDraftDefinition()));
  readonly previewOccurrences = signal<ScheduleOccurrencePreview[]>([]);
  readonly saveScope = signal<SaveScopeState | null>(null);
  readonly validation = signal<ScheduleValidationMessage[]>([]);
  readonly isEditing = computed(() => Boolean(this.route.snapshot.queryParamMap.get('scheduleId')));
  readonly primaryVersion = computed(() => this.draft().versions[0] ?? createDraftVersion());
  readonly weekdays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  constructor() {
    effect(() => {
      const scheduleId = this.route.snapshot.queryParamMap.get('scheduleId');
      void this.load(scheduleId);
    });

    effect(() => {
      const current = JSON.stringify(this.draft());
      if (current === this.baselineJson()) {
        this.dirtyState.markClean();
      } else {
        this.dirtyState.markDirty();
      }
      void this.refreshPreview();
    });
  }

  async load(scheduleId: string | null) {
    if (!scheduleId) {
      this.loadedDetail.set(null);
      const draft = createDraftDefinition();
      this.draft.set(draft);
      this.baselineJson.set(JSON.stringify(draft));
      return;
    }

    try {
      const detail = await this.schedApi.getSchedule(scheduleId);
      this.loadedDetail.set(detail);
      const draft = cloneDraft(detail.schedule);
      this.draft.set(draft);
      this.baselineJson.set(JSON.stringify(draft));
      this.previewOccurrences.set(detail.upcomingOccurrences);
      this.validation.set(detail.validation);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load the schedule.');
    }
  }

  patchDraft(patch: Partial<ScheduleDraftDefinition>) {
    this.draft.set({
      ...this.draft(),
      ...patch,
    });
  }

  patchVersion(index: number, patch: Partial<ScheduleDraftVersion>) {
    const versions = [...this.draft().versions];
    versions[index] = {
      ...versions[index],
      ...patch,
    };
    this.patchDraft({ versions });
  }

  patchRecurrence(index: number, patch: Partial<ScheduleDraftVersion['recurrence']>) {
    const version = this.draft().versions[index];
    this.patchVersion(index, {
      recurrence: {
        ...version.recurrence,
        ...patch,
      },
    });
  }

  patchPause(
    versionIndex: number,
    pauseIndex: number,
    patch: Partial<{ endDate: string; startDate: string }>,
  ) {
    const version = this.draft().versions[versionIndex];
    const pauses = [...version.recurrence.pauses];
    pauses[pauseIndex] = {
      ...pauses[pauseIndex],
      ...patch,
    };
    this.patchRecurrence(versionIndex, { pauses });
  }

  patchItem(index: number, patch: Partial<ScheduleDraftItem>) {
    const versions = [...this.draft().versions];
    const items = [...versions[0].items];
    items[index] = {
      ...items[index],
      ...patch,
    };
    versions[0] = {
      ...versions[0],
      items,
    };
    this.patchDraft({ versions });
  }

  addItem(kind: 'event' | 'task') {
    this.patchVersion(0, {
      items: [...this.primaryVersion().items, createDraftItem(kind)],
    });
  }

  removeItem(index: number) {
    const items = this.primaryVersion().items.filter((_item, itemIndex) => itemIndex !== index);
    if (items.length === 0) {
      return;
    }
    this.patchVersion(0, { items });
  }

  changeItemType(index: number, itemType: 'event' | 'task') {
    const base = createDraftItem(itemType);
    const current = this.primaryVersion().items[index];
    this.patchItem(index, {
      ...current,
      dueTime: base.dueTime,
      durationMinutes: base.durationMinutes,
      itemType,
      startTime: base.startTime,
    });
  }

  addVersion() {
    const versions = [...this.draft().versions, createDraftVersion()];
    this.patchDraft({ versions });
  }

  removeVersion(index: number) {
    const versions = this.draft().versions.filter(
      (_version, versionIndex) => versionIndex !== index,
    );
    if (versions.length === 0) {
      return;
    }
    this.patchDraft({ versions });
  }

  addPause(versionIndex: number) {
    const version = this.draft().versions[versionIndex];
    this.patchRecurrence(versionIndex, {
      pauses: [
        ...version.recurrence.pauses,
        {
          endDate: version.effectiveFromDate,
          startDate: version.effectiveFromDate,
        },
      ],
    });
  }

  removePause(versionIndex: number, pauseIndex: number) {
    const version = this.draft().versions[versionIndex];
    this.patchRecurrence(versionIndex, {
      pauses: version.recurrence.pauses.filter((_pause, index) => index !== pauseIndex),
    });
  }

  toggleWeekday(versionIndex: number, weekday: number) {
    const version = this.draft().versions[versionIndex];
    const weekdays = version.recurrence.weekdays.includes(weekday)
      ? version.recurrence.weekdays.filter((entry) => entry !== weekday)
      : [...version.recurrence.weekdays, weekday].sort((left, right) => left - right);
    this.patchRecurrence(versionIndex, { weekdays });
  }

  toInt(value: string | number, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async refreshPreview() {
    this.isPreviewLoading.set(true);
    this.error.set(null);
    try {
      const preview = await this.schedApi.preview(this.draft());
      this.previewOccurrences.set(preview.upcomingOccurrences);
      this.validation.set(preview.validation);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to refresh the preview.');
    } finally {
      this.isPreviewLoading.set(false);
    }
  }

  async save() {
    this.error.set(null);
    if (this.isEditing() && this.draft().state === 'active') {
      this.saveScope.set({
        anchorDate:
          this.previewOccurrences()[0]?.occurrenceDate ??
          this.draft().boundaryStartDate ??
          new Date().toISOString().slice(0, 10),
        error: null,
        includePast: false,
        overwriteExceptions: false,
        scope: 'selected_and_future',
      });
      return;
    }

    await this.commitSave();
  }

  patchSaveScope(patch: Partial<SaveScopeState>) {
    const current = this.saveScope();
    if (!current) {
      return;
    }
    this.saveScope.set({
      ...current,
      ...patch,
      error: patch.error ?? current.error,
    });
  }

  async confirmScopedSave() {
    await this.commitSave(this.saveScope() ?? undefined);
  }

  private async commitSave(scope?: SaveScopeState) {
    this.isSaving.set(true);
    this.error.set(null);

    try {
      const scheduleId = this.route.snapshot.queryParamMap.get('scheduleId');
      if (scheduleId) {
        await this.schedApi.update(scheduleId, {
          changeControl: scope
            ? {
                anchorDate: scope.anchorDate,
                includePast: scope.includePast,
                overwriteExceptions: scope.overwriteExceptions,
                scope: scope.scope,
              }
            : undefined,
          definition: this.draft(),
        });
      } else {
        await this.schedApi.create(this.draft());
      }

      this.baselineJson.set(JSON.stringify(this.draft()));
      this.dirtyState.markClean();
      this.saveScope.set(null);
      await this.router.navigate(['/schedules'], {
        queryParams: {
          tab: this.draft().state === 'active' ? 'active' : 'template',
        },
      });
    } catch (error) {
      if (error instanceof SchedApiError && scope && error.details.dates?.length) {
        this.patchSaveScope({
          error:
            'This edit would overwrite existing exceptions. Enable overwrite if you want to continue.',
        });
        return;
      }

      this.error.set(error instanceof Error ? error.message : 'Failed to save the schedule.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
