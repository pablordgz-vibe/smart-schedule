import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrgApiService } from './org-api.service';
import {
  type HolidayLocationCatalog,
  TimeApiService,
  type TimePolicyCategory,
  type TimePolicyScopeLevel,
  type TimePolicySummary,
} from './time-api.service';

type TimeTab = {
  id: TimePolicyCategory;
  label: string;
};

@Component({
  selector: 'app-org-time-policies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="grid gap-6" data-testid="page-org-time-policies">
      <article class="card border border-base-300 bg-base-100 p-6 shadow-sm space-y-5">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/45">
          Organization Administration
        </p>
        <h1>Time Policies</h1>
        <p class="text-sm leading-6 text-base-content/65">
          Configure working hours, availability, unavailability, holidays, blackout periods, rest
          rules, and maximum hours.
        </p>

        <div class="rounded-box border border-base-300 bg-base-100 p-4 precedence-panel">
          <h2>Precedence</h2>
          <p class="text-sm leading-6 text-base-content/65">
            User overrides group overrides organization.
          </p>
        </div>

        <div role="tablist" class="tabs tabs-boxed w-fit">
          <button
            *ngFor="let tab of tabs"
            class="tab"
            type="button"
            [class.tab-active]="activeTab() === tab.id"
            (click)="setActiveTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <p class="text-sm leading-6 text-base-content/65">
          {{ activeTabDescription() }}
        </p>

        <p *ngIf="errorMessage()" class="alert alert-error">{{ errorMessage() }}</p>
        <p *ngIf="successMessage()" class="alert alert-info">{{ successMessage() }}</p>
        <p *ngIf="isLoading()" class="alert alert-info">Loading organization time policies…</p>

        <div class="grid items-start gap-4 xl:grid-cols-2" *ngIf="organizationId(); else noContext">
          <section class="rounded-box border border-base-300 bg-base-100 p-3 rule-editor-card">
            <h2>Rule editor</h2>
            <label class="form-control gap-2">
              <span>Scope</span>
              <select
                class="select select-bordered w-full"
                [(ngModel)]="form.scopeLevel"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="organization">organization</option>
                <option value="group">group</option>
                <option value="user">user</option>
              </select>
            </label>

            <label class="form-control gap-2" *ngIf="form.scopeLevel === 'group'">
              <span>Target group</span>
              <select
                class="select select-bordered w-full"
                [(ngModel)]="form.targetGroupId"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="">Select group</option>
                <option *ngFor="let group of groups()" [value]="group.id">{{ group.name }}</option>
              </select>
            </label>

            <label class="form-control gap-2" *ngIf="form.scopeLevel === 'user'">
              <span>Target user</span>
              <select
                class="select select-bordered w-full"
                [(ngModel)]="form.targetUserId"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="">Select user</option>
                <option *ngFor="let user of memberships()" [value]="user.userId">
                  {{ user.name }}
                </option>
              </select>
            </label>

            <label class="form-control gap-2">
              <span>Title</span>
              <input
                class="input input-bordered w-full"
                [(ngModel)]="form.title"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>

            <ng-container [ngSwitch]="activeTab()">
              <ng-container *ngSwitchCase="'working_hours'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Days (0-6 comma separated)</span>
                    <input
                      class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'availability'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Days (0-6 comma separated)</span>
                    <input
                      class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'unavailability'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Days (0-6 comma separated)</span>
                    <input
                      class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input
                      class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'holiday'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Date</span>
                    <input
                      class="input input-bordered w-full"
                      type="date"
                      [(ngModel)]="form.date"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Holiday name</span>
                    <input
                      class="input input-bordered w-full"
                      [(ngModel)]="form.holidayName"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'blackout'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input
                      class="input input-bordered w-full"
                      type="datetime-local"
                      [(ngModel)]="form.startAt"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input
                      class="input input-bordered w-full"
                      type="datetime-local"
                      [(ngModel)]="form.endAt"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'rest'">
                <label class="form-control gap-2">
                  <span>Minimum rest minutes</span>
                  <input
                    class="input input-bordered w-full"
                    type="number"
                    min="1"
                    max="1440"
                    [(ngModel)]="form.minRestMinutes"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </label>
              </ng-container>

              <ng-container *ngSwitchCase="'max_hours'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Max daily minutes</span>
                    <input
                      class="input input-bordered w-full"
                      type="number"
                      min="1"
                      max="1440"
                      [(ngModel)]="form.maxDailyMinutes"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Max weekly minutes</span>
                    <input
                      class="input input-bordered w-full"
                      type="number"
                      min="1"
                      max="10080"
                      [(ngModel)]="form.maxWeeklyMinutes"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>
            </ng-container>

            <button class="btn btn-neutral mt-2 self-start" type="button" (click)="createPolicy()">
              Save policy
            </button>
          </section>

          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
            <div class="space-y-2">
              <h2>Holiday Import Integration</h2>
              <p class="text-sm leading-6 text-base-content/65">
                Import official holidays from the configured provider with country and region
                selectors only.
              </p>
            </div>

            <div
              class="alert alert-warning"
              *ngIf="
                holidayCatalog() && (!holidayCatalog()!.enabled || !holidayCatalog()!.configured)
              "
            >
              <span>
                {{
                  !holidayCatalog()!.enabled
                    ? 'Enable Calendarific in Global Integrations before importing holidays.'
                    : 'Calendarific is enabled but still needs its API key in Global Integrations.'
                }}
              </span>
            </div>

            <div class="inline-fields">
              <label class="form-control gap-2">
                <span>Provider</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.providerCode"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="loadHolidayCatalog()"
                >
                  <option value="calendarific">Calendarific</option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>Country</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.countryCode"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="selectHolidayCountry($event)"
                >
                  <option value="">Select a country</option>
                  <option *ngFor="let country of holidayCountries()" [value]="country.code">
                    {{ country.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>Region / state</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.subdivisionCode"
                  [ngModelOptions]="{ standalone: true }"
                  [disabled]="!holidayImport.countryCode"
                >
                  <option value="">Country-wide holidays only</option>
                  <option
                    *ngFor="let subdivision of holidaySubdivisions()"
                    [value]="subdivision.code"
                  >
                    {{ subdivision.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>Year</span>
                <input
                  class="input input-bordered w-full"
                  type="number"
                  [(ngModel)]="holidayImport.year"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
            </div>
            <label class="label cursor-pointer justify-start gap-3 rounded-box border border-base-300 px-3 py-2">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [(ngModel)]="holidayImport.replaceExisting"
                [ngModelOptions]="{ standalone: true }"
              />
              <span class="label-text">Replace previously imported holidays for this scope</span>
            </label>
            <div class="grid gap-4 md:grid-cols-3">
              <label class="form-control gap-2">
                <span>Import scope</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.scopeLevel"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="organization">organization</option>
                  <option value="group">group</option>
                  <option value="user">user</option>
                </select>
              </label>
              <label class="form-control gap-2" *ngIf="holidayImport.scopeLevel === 'group'">
                <span>Target group</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.targetGroupId"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">Select group</option>
                  <option *ngFor="let group of groups()" [value]="group.id">
                    {{ group.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2" *ngIf="holidayImport.scopeLevel === 'user'">
                <span>Target user</span>
                <select
                  class="select select-bordered w-full"
                  [(ngModel)]="holidayImport.targetUserId"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">Select user</option>
                  <option *ngFor="let user of memberships()" [value]="user.userId">
                    {{ user.name }}
                  </option>
                </select>
              </label>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button class="btn btn-outline" type="button" (click)="importHolidays()">
                Import official holidays
              </button>
              <span class="text-sm text-base-content/60" *ngIf="holidayCatalog() as catalog">
                {{ catalog.countries.length }} supported countries loaded
              </span>
            </div>
            <p class="text-sm text-base-content/60" *ngIf="selectedHolidayLocationCode()">
              Import target: {{ selectedHolidayLocationLabel() }} · {{ importScopeSummary() }}
            </p>
            <p class="alert alert-warning" *ngIf="holidayCatalogErrorMessage()">
              {{ holidayCatalogErrorMessage() }}
            </p>
            <p class="text-sm leading-6 text-base-content/65" *ngIf="lastImportMessage()">
              {{ lastImportMessage() }}
            </p>

            <h2>Effective policy preview</h2>
            <p class="alert alert-warning" *ngIf="previewErrorMessage()">
              {{ previewErrorMessage() }}
            </p>
            <label class="form-control gap-2">
              <span>Preview user</span>
              <select
                class="select select-bordered w-full"
                [(ngModel)]="previewUserId"
                [ngModelOptions]="{ standalone: true }"
                (ngModelChange)="loadPreview()"
              >
                <option value="">Current actor</option>
                <option *ngFor="let user of memberships()" [value]="user.userId">
                  {{ user.name }}
                </option>
              </select>
            </label>

            <ul class="simple-list">
              <li *ngFor="let item of previewRows()">
                <strong>{{ formatPolicyCategory(item.category) }}</strong>
                <span class="badge badge-outline">{{ formatScopeLabel(item.scope) }}</span>
                <span class="text-sm text-base-content/60">rules: {{ item.ruleCount }}</span>
                <span class="text-sm text-base-content/60">{{ item.summary }}</span>
              </li>
            </ul>
          </section>
        </div>

        <article
          class="rounded-box border border-base-300 bg-base-100 p-4"
          *ngIf="organizationId()"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2>Current {{ activeTabLabel() }} rules</h2>
              <p class="text-sm text-base-content/60">Click rows to select. Ctrl-click and shift-click are supported.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn btn-outline btn-sm"
                type="button"
                [disabled]="selectedPolicyIds().length === 0"
                (click)="deleteSelectedPolicies()"
              >
                Delete selected
              </button>
              <button
                class="btn btn-outline btn-sm"
                type="button"
                [disabled]="filteredPolicies().length === 0"
                (click)="deleteAllPoliciesInTab()"
              >
                Delete all
              </button>
            </div>
          </div>
          <ul class="simple-list">
            <li
              *ngFor="let policy of filteredPolicies(); let index = index"
              class="policy-row"
              [class.policy-row-selected]="isPolicySelected(policy.id)"
              data-testid="time-policy-row"
              (click)="togglePolicySelection(policy.id, index, $event)"
            >
              <label class="label cursor-pointer justify-start gap-3 self-start p-0">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  [checked]="isPolicySelected(policy.id)"
                  (click)="$event.stopPropagation()"
                  (change)="togglePolicySelection(policy.id, index, $event)"
                />
                <span class="sr-only">Select {{ policy.title }}</span>
              </label>
              <div class="min-w-0">
                <strong>{{ policy.title }}</strong>
                <p class="text-sm leading-6 text-base-content/65">{{ describePolicy(policy) }}</p>
                <p class="text-sm leading-6 text-base-content/55">
                  {{ policyTargetLabel(policy) }} · {{ formatSourceLabel(policy.sourceType) }} ·
                  {{ policy.isActive ? 'active' : 'inactive' }} · updated
                  {{ formatDateTime(policy.updatedAt) }}
                </p>
              </div>
              <button class="btn btn-outline" type="button" (click)="$event.stopPropagation(); removePolicy(policy.id)">
                Delete
              </button>
            </li>
            <li *ngIf="filteredPolicies().length === 0" class="text-sm text-base-content/60">
              No rules in this tab yet.
            </li>
          </ul>
        </article>

        <ng-template #noContext>
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2>Organization context required</h2>
            <p class="text-sm leading-6 text-base-content/65">
              Switch into an organization admin context to manage time policies.
            </p>
          </article>
        </ng-template>
      </article>
    </section>
  `,
  styles: [
    `
      .stack {
        display: grid;
        gap: var(--spacing-4);
      }

      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
      }

      .rule-editor-card {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2);
      }

      .rule-editor-card .form-control {
        gap: 0.45rem;
      }

      .rule-editor-card .inline-fields > .form-control > span,
      .rule-editor-card > .form-control > span {
        min-height: 2.5rem;
        display: flex;
        align-items: flex-end;
        line-height: 1.2;
      }

      .tabs {
        display: flex;
        gap: var(--spacing-2);
        flex-wrap: wrap;
      }

      .inline-fields {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--spacing-3);
      }

      .precedence-panel {
        border-left: 4px solid rgb(14 116 144 / 0.7);
      }

      .policy-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: var(--spacing-3);
        align-items: start;
        padding: 0.85rem 1rem;
        border: 1px solid rgb(148 163 184 / 0.2);
        border-radius: var(--radius-xl);
        cursor: pointer;
      }

      .policy-row-selected {
        border-color: rgb(2 132 199 / 0.35);
        box-shadow: inset 0 0 0 1px rgb(2 132 199 / 0.25);
        background: color-mix(in srgb, var(--color-base-200) 42%, white 58%);
      }

      @media (max-width: 1100px) {
        .inline-fields {
          grid-template-columns: 1fr;
        }

        .policy-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class OrgTimePoliciesComponent {
  private readonly orgApi = inject(OrgApiService);
  private readonly timeApi = inject(TimeApiService);

  readonly tabs: TimeTab[] = [
    { id: 'working_hours', label: 'Working Hours' },
    { id: 'availability', label: 'Availability' },
    { id: 'unavailability', label: 'Unavailability' },
    { id: 'holiday', label: 'Holidays' },
    { id: 'blackout', label: 'Blackout Periods' },
    { id: 'rest', label: 'Rest Rules' },
    { id: 'max_hours', label: 'Maximum Hours' },
  ];

  readonly activeTab = signal<TimePolicyCategory>('working_hours');
  readonly organizationId = computed(() => this.orgApi.activeOrganizationId());
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly lastImportMessage = signal<string | null>(null);
  readonly previewErrorMessage = signal<string | null>(null);
  readonly holidayCatalogErrorMessage = signal<string | null>(null);
  readonly holidayCatalog = signal<HolidayLocationCatalog | null>(null);
  readonly selectedPolicyIds = signal<string[]>([]);

  private readonly policiesState = signal<TimePolicySummary[]>([]);
  readonly policies = this.policiesState.asReadonly();

  private readonly membershipsState = signal<
    Array<{ userId: string; name: string; email: string; role: 'admin' | 'member' }>
  >([]);
  readonly memberships = this.membershipsState.asReadonly();

  private readonly groupsState = signal<Array<{ id: string; name: string }>>([]);
  readonly groups = this.groupsState.asReadonly();

  previewUserId = '';
  private readonly previewState = signal<
    Record<
      string,
      {
        resolvedFromScope: TimePolicyScopeLevel | null;
        rules: Array<{ id: string; rule: Record<string, unknown> }>;
      }
    >
  >({});

  form: {
    title: string;
    scopeLevel: TimePolicyScopeLevel;
    targetGroupId: string;
    targetUserId: string;
    daysOfWeekToken: string;
    startTime: string;
    endTime: string;
    date: string;
    holidayName: string;
    startAt: string;
    endAt: string;
    minRestMinutes: number;
    maxDailyMinutes: number;
    maxWeeklyMinutes: number;
  } = {
    date: '',
    daysOfWeekToken: '1,2,3,4,5',
    endAt: '',
    endTime: '17:00',
    holidayName: '',
    maxDailyMinutes: 480,
    maxWeeklyMinutes: 2400,
    minRestMinutes: 720,
    scopeLevel: 'organization',
    startAt: '',
    startTime: '09:00',
    targetGroupId: '',
    targetUserId: '',
    title: 'New policy',
  };

  holidayImport = {
    countryCode: '',
    providerCode: 'calendarific',
    replaceExisting: true,
    scopeLevel: 'organization' as TimePolicyScopeLevel,
    subdivisionCode: '',
    targetGroupId: '',
    targetUserId: '',
    year: new Date().getUTCFullYear(),
  };

  readonly filteredPolicies = computed(() =>
    this.policies().filter((policy) => policy.policyType === this.activeTab()),
  );

  readonly previewRows = computed(() =>
    Object.entries(this.previewState()).map(([category, entry]) => ({
      category,
      ruleCount: entry.rules.length,
      scope: entry.resolvedFromScope ?? 'none',
      summary: this.describePreviewRules(entry.rules),
    })),
  );

  readonly activeTabLabel = computed(
    () => this.tabs.find((tab) => tab.id === this.activeTab())?.label ?? this.activeTab(),
  );
  readonly activeTabDescription = computed(() => this.describeActiveTab(this.activeTab()));
  readonly holidayCountries = computed(() => this.holidayCatalog()?.countries ?? []);
  readonly holidaySubdivisions = computed(() =>
    (this.holidayCatalog()?.subdivisions ?? []).filter(
      (subdivision): subdivision is { code: string; countryCode: string; name: string } =>
        typeof subdivision.code === 'string' && subdivision.code.length > 0,
    ),
  );
  private lastSelectedPolicyIndex: number | null = null;

  formatPolicyCategory(category: string): string {
    return this.tabs.find((tab) => tab.id === category)?.label ?? this.humanizeToken(category);
  }

  formatScopeLabel(scope: string | null): string {
    if (!scope || scope === 'none') {
      return 'No rule';
    }
    return this.humanizeToken(scope);
  }

  formatSourceLabel(source: string): string {
    return this.humanizeToken(source);
  }

  private humanizeToken(value: string): string {
    return value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  constructor() {
    effect(() => {
      const organizationId = this.organizationId();
      void organizationId;
      void this.reload();
    });
    void this.loadHolidayCatalog();
  }

  setActiveTab(tab: TimePolicyCategory) {
    this.activeTab.set(tab);
    this.selectedPolicyIds.set([]);
    this.lastSelectedPolicyIndex = null;
  }

  async createPolicy() {
    if (!this.organizationId()) {
      return;
    }

    if (
      !this.validateScopedTarget(
        this.form.scopeLevel,
        this.form.targetGroupId,
        this.form.targetUserId,
      )
    ) {
      return;
    }

    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);
      if (this.form.scopeLevel === 'group' && !this.form.targetGroupId) {
        throw new Error('Select a target group for a group-scoped rule.');
      }
      if (this.form.scopeLevel === 'user' && !this.form.targetUserId) {
        throw new Error('Select a target user for a user-scoped rule.');
      }
      await this.timeApi.createPolicy(this.buildPolicyPayload());
      this.successMessage.set(`${this.activeTabLabel()} policy saved.`);
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to create policy.');
    }
  }

  async removePolicy(policyId: string) {
    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);
      await this.timeApi.deletePolicy(policyId);
      this.selectedPolicyIds.update((current) => current.filter((id) => id !== policyId));
      this.lastSelectedPolicyIndex = null;
      this.successMessage.set('Policy deleted.');
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to delete policy.');
    }
  }

  isPolicySelected(policyId: string) {
    return this.selectedPolicyIds().includes(policyId);
  }

  togglePolicySelection(policyId: string, index: number, event: Event) {
    event.stopPropagation();
    const mouseEvent = event as MouseEvent;
    const policies = this.filteredPolicies();

    if (mouseEvent.shiftKey && this.lastSelectedPolicyIndex != null) {
      const [start, end] = [this.lastSelectedPolicyIndex, index].sort((left, right) => left - right);
      const rangeIds = policies.slice(start, end + 1).map((policy) => policy.id);
      this.selectedPolicyIds.update((current) => Array.from(new Set([...current, ...rangeIds])));
      return;
    }

    if (mouseEvent.ctrlKey || mouseEvent.metaKey || event.type === 'change') {
      this.selectedPolicyIds.update((current) =>
        current.includes(policyId)
          ? current.filter((id) => id !== policyId)
          : [...current, policyId],
      );
      this.lastSelectedPolicyIndex = index;
      return;
    }

    this.selectedPolicyIds.set([policyId]);
    this.lastSelectedPolicyIndex = index;
  }

  async deleteSelectedPolicies() {
    const policyIds = this.selectedPolicyIds();
    if (
      policyIds.length === 0 ||
      !window.confirm(`Delete ${policyIds.length} selected ${this.activeTabLabel().toLowerCase()} rule(s)?`)
    ) {
      return;
    }

    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);
      await Promise.all(policyIds.map((policyId) => this.timeApi.deletePolicy(policyId)));
      this.selectedPolicyIds.set([]);
      this.lastSelectedPolicyIndex = null;
      this.successMessage.set(`Deleted ${policyIds.length} rule(s).`);
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to delete rules.');
    }
  }

  async deleteAllPoliciesInTab() {
    const policyIds = this.filteredPolicies().map((policy) => policy.id);
    if (
      policyIds.length === 0 ||
      !window.confirm(`Delete all ${policyIds.length} ${this.activeTabLabel().toLowerCase()} rule(s)?`)
    ) {
      return;
    }

    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);
      await Promise.all(policyIds.map((policyId) => this.timeApi.deletePolicy(policyId)));
      this.selectedPolicyIds.set([]);
      this.lastSelectedPolicyIndex = null;
      this.successMessage.set(`Deleted all ${this.activeTabLabel().toLowerCase()} rules.`);
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to delete rules.');
    }
  }

  async importHolidays() {
    if (
      !this.validateScopedTarget(
        this.holidayImport.scopeLevel,
        this.holidayImport.targetGroupId,
        this.holidayImport.targetUserId,
      )
    ) {
      return;
    }

    try {
      this.errorMessage.set(null);
      this.successMessage.set(null);
      this.lastImportMessage.set(null);
      this.holidayCatalogErrorMessage.set(null);
      const locationCode = this.selectedHolidayLocationCode();
      if (!locationCode) {
        this.errorMessage.set('Select a country before importing official holidays.');
        return;
      }
      if (this.holidayImport.scopeLevel === 'group' && !this.holidayImport.targetGroupId) {
        this.errorMessage.set('Select a target group for a group-scoped holiday import.');
        return;
      }
      if (this.holidayImport.scopeLevel === 'user' && !this.holidayImport.targetUserId) {
        this.errorMessage.set('Select a target user for a user-scoped holiday import.');
        return;
      }

      const result = await this.timeApi.importOfficialHolidays({
        locationCode,
        providerCode: this.holidayImport.providerCode,
        replaceExisting: this.holidayImport.replaceExisting,
        scopeLevel: this.holidayImport.scopeLevel,
        targetGroupId:
          this.holidayImport.scopeLevel === 'group'
            ? this.holidayImport.targetGroupId || undefined
            : undefined,
        targetUserId:
          this.holidayImport.scopeLevel === 'user'
            ? this.holidayImport.targetUserId || undefined
            : undefined,
        year: this.holidayImport.year,
      });

      this.activeTab.set('holiday');
      if (this.holidayImport.scopeLevel === 'user' && this.holidayImport.targetUserId) {
        this.previewUserId = this.holidayImport.targetUserId;
      } else {
        this.previewUserId = '';
      }
      this.lastImportMessage.set([
        `${result.imported} official holidays imported for ${this.selectedHolidayLocationLabel()} (${this.importScopeSummary()}).`,
        this.holidayImport.replaceExisting
          ? `Replaced ${result.replaced} previous imported holidays for this scope.`
          : 'Existing imported holidays were preserved.',
      ].join(' '));
      const [policiesReload, previewReload] = await Promise.allSettled([
        this.reloadPolicies(),
        this.loadPreview(),
      ]);
      this.errorMessage.set(null);
      if (policiesReload.status === 'rejected' || previewReload.status === 'rejected') {
        this.successMessage.set('Holidays imported, but the policy view could not be fully refreshed.');
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to import holidays.');
    }
  }

  async loadHolidayCatalog() {
    try {
      this.holidayCatalogErrorMessage.set(null);
      const catalog = await this.timeApi.getHolidayLocationCatalog({
        countryCode: this.holidayImport.countryCode || undefined,
        providerCode: this.holidayImport.providerCode,
      });
      this.holidayCatalog.set(catalog);
    } catch (error) {
      this.holidayCatalog.set(null);
      this.holidayCatalogErrorMessage.set(
        error instanceof Error ? error.message : 'Failed to load holiday locations.',
      );
    }
  }

  async selectHolidayCountry(countryCode: string) {
    this.holidayImport.countryCode = countryCode;
    this.holidayImport.subdivisionCode = '';
    await this.loadHolidayCatalog();
  }

  async loadPreview() {
    try {
      this.previewErrorMessage.set(null);
      const preview = await this.timeApi.previewEffectivePolicies(this.validPreviewUserId());
      this.previewState.set(preview.categories);
    } catch (error) {
      this.previewState.set({});
      this.previewErrorMessage.set(
        error instanceof Error ? error.message : 'Failed to load policy preview.',
      );
    }
  }

  private async reload() {
    if (!this.organizationId()) {
      this.membershipsState.set([]);
      this.groupsState.set([]);
      this.policiesState.set([]);
      this.previewState.set({});
      this.isLoading.set(false);
      return;
    }

    try {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      const [memberships, groups] = await Promise.all([
        this.orgApi.listMemberships(this.organizationId()!),
        this.orgApi.listGroups(this.organizationId()!),
      ]);
      this.membershipsState.set(memberships);
      this.groupsState.set(groups.map((group) => ({ id: group.id, name: group.name })));
      if (this.previewUserId && !memberships.some((user) => user.userId === this.previewUserId)) {
        this.previewUserId = '';
      }

      await this.reloadPolicies();
      await this.loadPreview();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load organization time policies.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  private async reloadPolicies() {
    this.policiesState.set(await this.timeApi.listPolicies({ includeInactive: true }));
    const validPolicyIds = new Set(this.filteredPolicies().map((policy) => policy.id));
    this.selectedPolicyIds.update((current) => current.filter((id) => validPolicyIds.has(id)));
    if (this.selectedPolicyIds().length === 0) {
      this.lastSelectedPolicyIndex = null;
    }
  }

  selectedHolidayLocationCode() {
    if (!this.holidayImport.countryCode) {
      return '';
    }

    if (
      this.holidayImport.subdivisionCode &&
      this.holidaySubdivisions().some(
        (entry) => entry.code === this.holidayImport.subdivisionCode,
      )
    ) {
      return this.holidayImport.subdivisionCode;
    }

    return this.holidayImport.countryCode;
  }

  selectedHolidayLocationLabel() {
    const country =
      this.holidayCatalog()?.countries.find(
        (entry) => entry.code === this.holidayImport.countryCode,
      )?.name ?? this.holidayImport.countryCode;
    const subdivision = this.holidayImport.subdivisionCode
      ? this.holidaySubdivisions().find(
          (entry) => entry.code === this.holidayImport.subdivisionCode,
        )?.name ?? ''
      : '';

    return subdivision ? `${country} / ${subdivision}` : country || 'the selected location';
  }

  importScopeSummary() {
    if (this.holidayImport.scopeLevel === 'organization') {
      return 'organization scope';
    }

    if (this.holidayImport.scopeLevel === 'group') {
      const groupName =
        this.groupsState().find((group) => group.id === this.holidayImport.targetGroupId)?.name ??
        'selected group';
      return `group scope: ${groupName}`;
    }

    const userName =
      this.membershipsState().find((user) => user.userId === this.holidayImport.targetUserId)
        ?.name ?? 'selected user';
    return `user scope: ${userName}`;
  }

  private validPreviewUserId() {
    if (!this.previewUserId) {
      return undefined;
    }

    return this.membershipsState().some((user) => user.userId === this.previewUserId)
      ? this.previewUserId
      : undefined;
  }

  private buildPolicyPayload() {
    const payload: Record<string, unknown> = {
      isActive: true,
      policyType: this.activeTab(),
      scopeLevel: this.form.scopeLevel,
      title: this.form.title,
    };

    if (this.form.scopeLevel === 'group') {
      payload['targetGroupId'] = this.form.targetGroupId;
    }

    if (this.form.scopeLevel === 'user') {
      payload['targetUserId'] = this.form.targetUserId;
    }

    if (
      this.activeTab() === 'working_hours' ||
      this.activeTab() === 'availability' ||
      this.activeTab() === 'unavailability'
    ) {
      payload['daysOfWeek'] = this.form.daysOfWeekToken
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value));
      payload['startTime'] = this.form.startTime;
      payload['endTime'] = this.form.endTime;
    }

    if (this.activeTab() === 'holiday') {
      payload['date'] = this.form.date;
      payload['holidayName'] = this.form.holidayName;
    }

    if (this.activeTab() === 'blackout') {
      payload['startAt'] = new Date(this.form.startAt).toISOString();
      payload['endAt'] = new Date(this.form.endAt).toISOString();
    }

    if (this.activeTab() === 'rest') {
      payload['minRestMinutes'] = this.form.minRestMinutes;
    }

    if (this.activeTab() === 'max_hours') {
      payload['maxDailyMinutes'] = this.form.maxDailyMinutes;
      payload['maxWeeklyMinutes'] = this.form.maxWeeklyMinutes;
    }

    return payload;
  }

  describePolicy(policy: TimePolicySummary) {
    const rule = policy.rule;

    if (
      policy.policyType === 'working_hours' ||
      policy.policyType === 'availability' ||
      policy.policyType === 'unavailability'
    ) {
      const days = Array.isArray(rule['daysOfWeek'])
        ? (rule['daysOfWeek'] as number[]).join(', ')
        : 'custom days';
      return `${days} · ${this.stringRuleValue(rule, 'startTime', '--:--')} to ${this.stringRuleValue(rule, 'endTime', '--:--')}`;
    }

    if (policy.policyType === 'holiday') {
      return `${this.stringRuleValue(rule, 'date', 'No date')} · ${this.stringRuleValue(rule, 'holidayName', 'Holiday')}`;
    }

    if (policy.policyType === 'blackout') {
      return `${this.formatDateTime(rule['startAt'])} to ${this.formatDateTime(rule['endAt'])}`;
    }

    if (policy.policyType === 'rest') {
      return `Minimum rest: ${this.stringRuleValue(rule, 'minRestMinutes', '?')} minutes`;
    }

    if (policy.policyType === 'max_hours') {
      return `Daily: ${this.stringRuleValue(rule, 'maxDailyMinutes', 'n/a')} min · Weekly: ${this.stringRuleValue(rule, 'maxWeeklyMinutes', 'n/a')} min`;
    }

    return '';
  }

  policyTargetLabel(policy: TimePolicySummary) {
    if (policy.scopeLevel === 'organization') {
      return 'Organization scope';
    }

    if (policy.scopeLevel === 'group') {
      const groupName =
        this.groupsState().find((group) => group.id === policy.targetGroupId)?.name ??
        policy.targetGroupId ??
        'Unknown group';
      return `Group: ${groupName}`;
    }

    const userName =
      this.membershipsState().find((user) => user.userId === policy.targetUserId)?.name ??
      policy.targetUserId ??
      'Unknown user';
    return `User: ${userName}`;
  }

  describePreviewRules(rules: Array<{ id: string; rule: Record<string, unknown> }>) {
    const firstRule = rules[0]?.rule ?? {};

    if (rules.length === 0) {
      return 'No effective rule.';
    }

    if (firstRule['holidayName']) {
      return `${this.stringRuleValue(firstRule, 'holidayName')} on ${this.stringRuleValue(firstRule, 'date', 'n/a')}`;
    }

    if (firstRule['startTime'] || firstRule['endTime']) {
      return `${this.stringRuleValue(firstRule, 'startTime', '--:--')} to ${this.stringRuleValue(firstRule, 'endTime', '--:--')}`;
    }

    if (firstRule['startAt'] || firstRule['endAt']) {
      return `${this.formatDateTime(firstRule['startAt'])} to ${this.formatDateTime(firstRule['endAt'])}`;
    }

    if (firstRule['minRestMinutes']) {
      return `Minimum rest ${this.stringRuleValue(firstRule, 'minRestMinutes')} minutes`;
    }

    if (firstRule['maxDailyMinutes'] || firstRule['maxWeeklyMinutes']) {
      return `Daily ${this.stringRuleValue(firstRule, 'maxDailyMinutes', 'n/a')} · Weekly ${this.stringRuleValue(firstRule, 'maxWeeklyMinutes', 'n/a')}`;
    }

    return `${rules.length} rule${rules.length === 1 ? '' : 's'} active.`;
  }

  formatDateTime(value: unknown) {
    if (typeof value !== 'string' || value.length === 0) {
      return 'n/a';
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

  private stringRuleValue(rule: Record<string, unknown>, key: string, fallback = '') {
    const value = rule[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return fallback;
  }

  describeActiveTab(tab: TimePolicyCategory) {
    switch (tab) {
      case 'working_hours':
        return 'Organization hours set the baseline. User rules override group rules, and group rules override organization rules.';
      case 'availability':
        return 'Use availability for extra time when a user or group can be scheduled.';
      case 'unavailability':
        return 'Use unavailability for recurring periods that should raise scheduling warnings.';
      case 'holiday':
        return 'Use manual holidays for named dates, or import official holidays by country and region below.';
      case 'blackout':
        return 'Use blackout periods for hard no-schedule windows with explicit start and end datetimes.';
      case 'rest':
        return 'Use rest rules to warn when a new activity leaves too little recovery time between shifts.';
      case 'max_hours':
        return 'Use maximum-hours rules to warn when workload exceeds daily or weekly limits.';
    }
  }

  private validateScopedTarget(
    scopeLevel: TimePolicyScopeLevel,
    targetGroupId: string,
    targetUserId: string,
  ) {
    if (scopeLevel === 'group' && !targetGroupId) {
      this.errorMessage.set('Select a target group for group-scoped rules or imports.');
      return false;
    }

    if (scopeLevel === 'user' && !targetUserId) {
      this.errorMessage.set('Select a target user for user-scoped rules or imports.');
      return false;
    }

    return true;
  }
}
