import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContextService } from './context.service';
import {
  TimeApiService,
  type HolidayLocationCatalog,
  type TimePolicyCategory,
  type TimePolicySummary,
} from './time-api.service';

type TimeTab = {
  id: TimePolicyCategory;
  label: string;
};

type PolicyFormState = {
  date: string;
  daysOfWeekToken: string;
  endAt: string;
  endTime: string;
  holidayName: string;
  maxDailyMinutes: number | null;
  maxWeeklyMinutes: number | null;
  minRestMinutes: number | null;
  startAt: string;
  startTime: string;
  title: string;
};

function createFormState(): PolicyFormState {
  return {
    date: '',
    daysOfWeekToken: '1,2,3,4,5',
    endAt: '',
    endTime: '17:00',
    holidayName: '',
    maxDailyMinutes: 480,
    maxWeeklyMinutes: 2400,
    minRestMinutes: 60,
    startAt: '',
    startTime: '09:00',
    title: '',
  };
}

@Component({
  selector: 'app-personal-time-policies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
      <h2>Personal Time Policies</h2>
      <p class="text-sm leading-6 text-base-content/65">
        Define personal working hours, availability, holidays, blackout periods, rest rules, and
        maximum-hour warnings used by scheduling assistance.
      </p>

      <ng-container *ngIf="isPersonalContext(); else wrongContext">
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

        <p class="alert alert-warning" *ngIf="errorMessage()">{{ errorMessage() }}</p>
        <p class="alert alert-info" *ngIf="message()">{{ message() }}</p>

        <div class="two-column">
          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
            <h3>Create rule</h3>
            <label class="form-control gap-2">
              <span>Title</span>
              <input class="input input-bordered w-full" [(ngModel)]="form.title" [ngModelOptions]="{ standalone: true }" />
            </label>

            <ng-container [ngSwitch]="activeTab()">
              <ng-container *ngSwitchCase="'working_hours'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Days (0-6 comma separated)</span>
                    <input class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input class="input input-bordered w-full"
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
                    <span>Days</span>
                    <input class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input class="input input-bordered w-full"
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
                    <span>Days</span>
                    <input class="input input-bordered w-full"
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input class="input input-bordered w-full"
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input class="input input-bordered w-full"
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
                    <input class="input input-bordered w-full"
                      type="date"
                      [(ngModel)]="form.date"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Holiday name</span>
                    <input class="input input-bordered w-full" [(ngModel)]="form.holidayName" [ngModelOptions]="{ standalone: true }" />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'blackout'">
                <div class="inline-fields">
                  <label class="form-control gap-2">
                    <span>Start</span>
                    <input class="input input-bordered w-full"
                      type="datetime-local"
                      [(ngModel)]="form.startAt"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>End</span>
                    <input class="input input-bordered w-full"
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
                  <input class="input input-bordered w-full"
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
                    <input class="input input-bordered w-full"
                      type="number"
                      min="1"
                      max="1440"
                      [(ngModel)]="form.maxDailyMinutes"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="form-control gap-2">
                    <span>Max weekly minutes</span>
                    <input class="input input-bordered w-full"
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

            <button class="btn btn-neutral" type="button" (click)="createPolicy()">
              Save personal rule
            </button>
          </section>

          <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
            <div class="space-y-2">
              <h3>Holiday Import Integration</h3>
              <p class="text-sm leading-6 text-base-content/65">
                Import official holidays from the configured provider. Country and region selectors
                are tied directly to this holiday import integration.
              </p>
            </div>

            <div
              class="alert alert-warning"
              *ngIf="holidayCatalog() && (!holidayCatalog()!.enabled || !holidayCatalog()!.configured)"
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
                <span>Country search</span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="holidayImport.countrySearch"
                  [ngModelOptions]="{ standalone: true }"
                  placeholder="Search countries"
                />
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
                  <option *ngFor="let country of filteredHolidayCountries()" [value]="country.code">
                    {{ country.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>Region search</span>
                <input
                  class="input input-bordered w-full"
                  [(ngModel)]="holidayImport.subdivisionSearch"
                  [ngModelOptions]="{ standalone: true }"
                  [disabled]="!holidayImport.countryCode"
                  placeholder="Search regions or leave blank for country-wide holidays"
                />
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
                  <option *ngFor="let subdivision of filteredHolidaySubdivisions()" [value]="subdivision.code ?? ''">
                    {{ subdivision.name }}
                  </option>
                </select>
              </label>
              <label class="form-control gap-2">
                <span>Year</span>
                <input class="input input-bordered w-full"
                  type="number"
                  [(ngModel)]="holidayYear"
                  [ngModelOptions]="{ standalone: true }"
                />
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
            <p class="text-sm text-base-content/60" *ngIf="holidayImport.countrySearch.trim().length > 0">
              Country matches: {{ filteredHolidayCountries().length }}
            </p>
            <p class="text-sm text-base-content/60" *ngIf="holidayImport.subdivisionSearch.trim().length > 0">
              Region matches: {{ filteredHolidaySubdivisions().length }}
            </p>
            <p class="text-sm text-base-content/60" *ngIf="selectedHolidayLocationCode()">
              Import target: {{ selectedHolidayLocationLabel() }}
            </p>
            <p class="alert alert-warning" *ngIf="holidayCatalogErrorMessage()">
              {{ holidayCatalogErrorMessage() }}
            </p>

            <h3>Effective preview</h3>
            <p class="alert alert-warning" *ngIf="previewErrorMessage()">{{ previewErrorMessage() }}</p>
            <ul class="simple-list">
              <li *ngFor="let row of previewRows()">
                <strong>{{ formatPolicyCategory(row.category) }}</strong>
                <span class="badge badge-outline">{{ formatScopeLabel(row.scope || 'none') }}</span>
                <span class="text-sm text-base-content/60">rules: {{ row.ruleCount }}</span>
                <span class="text-sm text-base-content/60">{{ row.summary }}</span>
              </li>
            </ul>
          </section>
        </div>

        <section class="rounded-box border border-base-300 bg-base-100 p-4 stack-tight">
          <h3>Current {{ activeTabLabel() }} rules</h3>
          <ul class="simple-list">
            <li *ngFor="let policy of filteredPolicies()">
              <div>
                <strong>{{ policy.title }}</strong>
                <p class="text-sm leading-6 text-base-content/65">{{ describePolicy(policy) }}</p>
                <p class="text-sm leading-6 text-base-content/55">{{ formatSourceLabel(policy.sourceType) }} · updated {{ formatDateTime(policy.updatedAt) }}</p>
              </div>
              <button class="btn btn-outline" type="button" (click)="removePolicy(policy.id)">
                Delete
              </button>
            </li>
            <li *ngIf="filteredPolicies().length === 0" class="ui-copy">
              No rules in this tab yet.
            </li>
          </ul>
        </section>
      </ng-container>

      <ng-template #wrongContext>
        <p class="text-sm leading-6 text-base-content/65">Switch into personal context to manage personal time policies.</p>
      </ng-template>
    </section>
  `,
  styles: [
    `
      .stack-tight {
        display: grid;
        gap: var(--spacing-3);
      }

      .tabs {
        display: flex;
        gap: var(--spacing-2);
        flex-wrap: wrap;
      }

      .two-column {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-4);
      }

      .inline-fields {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--spacing-3);
      }

      .ui-copy {
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .two-column,
        .inline-fields {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class PersonalTimePoliciesComponent {
  private readonly contextService = inject(ContextService);
  private readonly timeApi = inject(TimeApiService);

  readonly tabs: TimeTab[] = [
    { id: 'working_hours', label: 'Working Hours' },
    { id: 'availability', label: 'Availability' },
    { id: 'unavailability', label: 'Unavailability' },
    { id: 'holiday', label: 'Holidays' },
    { id: 'blackout', label: 'Blackouts' },
    { id: 'rest', label: 'Rest Rules' },
    { id: 'max_hours', label: 'Maximum Hours' },
  ];

  readonly activeTab = signal<TimePolicyCategory>('working_hours');
  readonly errorMessage = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly previewErrorMessage = signal<string | null>(null);
  readonly holidayCatalogErrorMessage = signal<string | null>(null);
  readonly holidayCatalog = signal<HolidayLocationCatalog | null>(null);
  readonly isPersonalContext = computed(
    () => this.contextService.activeContext().contextType === 'personal',
  );
  readonly policiesState = signal<TimePolicySummary[]>([]);
  readonly previewState = signal<
    Record<string, { resolvedFromScope: string | null; rules: unknown[] }>
  >({});

  readonly policies = this.policiesState.asReadonly();
  readonly filteredPolicies = computed(() =>
    this.policies().filter((policy) => policy.policyType === this.activeTab()),
  );
  readonly previewRows = computed(() =>
    Object.entries(this.previewState()).map(([category, details]) => ({
      category,
      ruleCount: details.rules.length,
      scope: details.resolvedFromScope,
      summary: this.describePreviewRules(details.rules),
    })),
  );
  readonly activeTabLabel = computed(
    () => this.tabs.find((tab) => tab.id === this.activeTab())?.label ?? 'Policies',
  );
  readonly activeTabDescription = computed(() => this.describeActiveTab(this.activeTab()));

  form = createFormState();
  holidayYear = new Date().getUTCFullYear();
  holidayImport = {
    countryCode: '',
    countrySearch: '',
    providerCode: 'calendarific',
    subdivisionCode: '',
    subdivisionSearch: '',
  };

  readonly filteredHolidayCountries = computed(() => {
    const catalog = this.holidayCatalog();
    const search = this.holidayImport.countrySearch.trim().toLowerCase();
    const countries = catalog?.countries ?? [];
    if (!search) {
      return countries;
    }

    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(search) ||
        country.code.toLowerCase().includes(search),
    );
  });
  readonly filteredHolidaySubdivisions = computed(() => {
    const catalog = this.holidayCatalog();
    const search = this.holidayImport.subdivisionSearch.trim().toLowerCase();
    const subdivisions = catalog?.subdivisions ?? [];
    if (!search) {
      return subdivisions;
    }

    return subdivisions.filter(
      (subdivision) =>
        subdivision.name.toLowerCase().includes(search) ||
        (subdivision.code ?? '').toLowerCase().includes(search),
    );
  });

  formatPolicyCategory(category: string): string {
    return this.tabs.find((tab) => tab.id === category)?.label ?? this.humanizeToken(category);
  }

  formatScopeLabel(scope: string): string {
    return scope === 'none' ? 'No rule' : this.humanizeToken(scope);
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
      const contextKey = this.contextService.activeContext().id;
      void contextKey;
      if (this.isPersonalContext()) {
        void this.reload();
      } else {
        this.policiesState.set([]);
        this.previewState.set({});
      }
    });
    void this.loadHolidayCatalog();
  }

  setActiveTab(tab: TimePolicyCategory) {
    this.activeTab.set(tab);
  }

  async createPolicy() {
    if (!this.isPersonalContext()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      this.message.set(null);
      await this.timeApi.createPolicy({
        date: this.form.date || undefined,
        daysOfWeek: this.parseDaysOfWeek(),
        endAt: this.form.endAt ? new Date(this.form.endAt).toISOString() : undefined,
        endTime: this.form.endTime || undefined,
        holidayName: this.form.holidayName || undefined,
        isActive: true,
        maxDailyMinutes: this.form.maxDailyMinutes ?? undefined,
        maxWeeklyMinutes: this.form.maxWeeklyMinutes ?? undefined,
        minRestMinutes: this.form.minRestMinutes ?? undefined,
        policyType: this.activeTab(),
        scopeLevel: 'user',
        startAt: this.form.startAt ? new Date(this.form.startAt).toISOString() : undefined,
        startTime: this.form.startTime || undefined,
        title: this.form.title.trim() || `${this.activeTabLabel()} Rule`,
      });
      this.form = createFormState();
      this.message.set('Personal time rule saved.');
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to save rule.');
    }
  }

  async removePolicy(policyId: string) {
    try {
      this.errorMessage.set(null);
      this.message.set(null);
      await this.timeApi.deletePolicy(policyId);
      this.message.set('Policy deleted.');
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to delete rule.');
    }
  }

  async importHolidays() {
    try {
      this.errorMessage.set(null);
      this.message.set(null);
      this.holidayCatalogErrorMessage.set(null);
      const locationCode = this.selectedHolidayLocationCode();
      if (!locationCode) {
        this.errorMessage.set('Select a country before importing official holidays.');
        return;
      }

      const result = await this.timeApi.importOfficialHolidays({
        locationCode,
        providerCode: this.holidayImport.providerCode.trim(),
        scopeLevel: 'user',
        year: this.holidayYear,
      });
      this.activeTab.set('holiday');
      this.message.set(
        `Imported ${result.imported} official holidays for ${this.selectedHolidayLocationLabel()}. Replaced ${result.replaced} previous imported holidays.`,
      );
      await this.reload();
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
    this.holidayImport.subdivisionSearch = '';
    await this.loadHolidayCatalog();
  }

  private async reload() {
    const policies = await this.timeApi.listPolicies();
    this.policiesState.set(policies);
    await this.loadPreview();
  }

  private async loadPreview() {
    try {
      this.previewErrorMessage.set(null);
      const preview = await this.timeApi.previewEffectivePolicies();
      this.previewState.set(preview.categories);
    } catch (error) {
      this.previewState.set({});
      this.previewErrorMessage.set(
        error instanceof Error ? error.message : 'Failed to load policy preview.',
      );
    }
  }

  private parseDaysOfWeek() {
    const values = this.form.daysOfWeekToken
      .split(',')
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    return values.length > 0 ? Array.from(new Set(values)) : undefined;
  }

  selectedHolidayLocationCode() {
    if (!this.holidayImport.countryCode) {
      return '';
    }

    return this.holidayImport.subdivisionCode || this.holidayImport.countryCode;
  }

  selectedHolidayLocationLabel() {
    const country =
      this.holidayCatalog()
        ?.countries.find((entry) => entry.code === this.holidayImport.countryCode)
        ?.name ?? this.holidayImport.countryCode;
    const subdivision =
      this.holidayCatalog()
        ?.subdivisions.find(
          (entry) => (entry.code ?? '') === this.holidayImport.subdivisionCode,
        )
        ?.name ?? '';

    return subdivision ? `${country} / ${subdivision}` : country || 'the selected location';
  }

  describePolicy(policy: TimePolicySummary) {
    const rule = policy.rule;

    if (
      policy.policyType === 'working_hours' ||
      policy.policyType === 'availability' ||
      policy.policyType === 'unavailability'
    ) {
      const days = Array.isArray(rule['daysOfWeek']) ? (rule['daysOfWeek'] as number[]).join(', ') : 'custom days';
      return `${days} · ${rule['startTime'] ?? '--:--'} to ${rule['endTime'] ?? '--:--'}`;
    }

    if (policy.policyType === 'holiday') {
      return `${rule['date'] ?? 'No date'} · ${rule['holidayName'] ?? 'Holiday'}`;
    }

    if (policy.policyType === 'blackout') {
      return `${this.formatDateTime(rule['startAt'])} to ${this.formatDateTime(rule['endAt'])}`;
    }

    if (policy.policyType === 'rest') {
      return `Minimum rest: ${rule['minRestMinutes'] ?? '?'} minutes`;
    }

    if (policy.policyType === 'max_hours') {
      return `Daily: ${rule['maxDailyMinutes'] ?? 'n/a'} min · Weekly: ${rule['maxWeeklyMinutes'] ?? 'n/a'} min`;
    }

    return '';
  }

  describePreviewRules(rules: unknown[]) {
    const firstRule =
      Array.isArray(rules) && rules.length > 0 && typeof rules[0] === 'object' && rules[0] != null
        ? (rules[0] as { rule?: Record<string, unknown> }).rule ?? {}
        : {};

    if (rules.length === 0) {
      return 'No effective rule.';
    }

    if (firstRule['holidayName']) {
      return `${firstRule['holidayName']} on ${firstRule['date'] ?? 'n/a'}`;
    }

    if (firstRule['startTime'] || firstRule['endTime']) {
      return `${firstRule['startTime'] ?? '--:--'} to ${firstRule['endTime'] ?? '--:--'}`;
    }

    if (firstRule['startAt'] || firstRule['endAt']) {
      return `${this.formatDateTime(firstRule['startAt'])} to ${this.formatDateTime(firstRule['endAt'])}`;
    }

    if (firstRule['minRestMinutes']) {
      return `Minimum rest ${firstRule['minRestMinutes']} minutes`;
    }

    if (firstRule['maxDailyMinutes'] || firstRule['maxWeeklyMinutes']) {
      return `Daily ${firstRule['maxDailyMinutes'] ?? 'n/a'} · Weekly ${firstRule['maxWeeklyMinutes'] ?? 'n/a'}`;
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

  describeActiveTab(tab: TimePolicyCategory) {
    switch (tab) {
      case 'working_hours':
        return 'Use this for your standard working window. It is the default schedule baseline.';
      case 'availability':
        return 'Use this for extra time you are available beyond the standard working window.';
      case 'unavailability':
        return 'Use this for planned periods when scheduling should warn that you are unavailable.';
      case 'holiday':
        return 'Use this for named non-working dates, either manual or imported from the holiday provider.';
      case 'blackout':
        return 'Use this for absolute no-schedule periods with explicit start and end datetimes.';
      case 'rest':
        return 'Use this to warn when new work leaves too little rest between activities.';
      case 'max_hours':
        return 'Use this to warn when daily or weekly workload exceeds your preferred limit.';
    }
  }
}
