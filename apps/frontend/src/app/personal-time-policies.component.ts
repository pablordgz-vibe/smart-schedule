import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContextService } from './context.service';
import {
  TimeApiService,
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
  locationCode: string;
  maxDailyMinutes: number | null;
  maxWeeklyMinutes: number | null;
  minRestMinutes: number | null;
  providerCode: string;
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
    locationCode: 'ES-M',
    maxDailyMinutes: 480,
    maxWeeklyMinutes: 2400,
    minRestMinutes: 60,
    providerCode: 'public-holidays',
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
            <h3>Official holiday import</h3>
            <div class="inline-fields">
              <label class="form-control gap-2">
                <span>Provider</span>
                <input class="input input-bordered w-full" [(ngModel)]="form.providerCode" [ngModelOptions]="{ standalone: true }" />
              </label>
              <label class="form-control gap-2">
                <span>Location</span>
                <input class="input input-bordered w-full" [(ngModel)]="form.locationCode" [ngModelOptions]="{ standalone: true }" />
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
            <button class="btn btn-outline" type="button" (click)="importHolidays()">
              Import official holidays
            </button>

            <h3>Effective preview</h3>
            <ul class="simple-list">
              <li *ngFor="let row of previewRows()">
                <strong>{{ formatPolicyCategory(row.category) }}</strong>
                <span class="badge badge-outline">{{ formatScopeLabel(row.scope || 'none') }}</span>
                <span class="text-sm text-base-content/60">rules: {{ row.ruleCount }}</span>
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
                <p class="text-sm leading-6 text-base-content/65">{{ formatSourceLabel(policy.sourceType) }} · {{ policy.updatedAt }}</p>
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
    })),
  );
  readonly activeTabLabel = computed(
    () => this.tabs.find((tab) => tab.id === this.activeTab())?.label ?? 'Policies',
  );

  form = createFormState();
  holidayYear = new Date().getUTCFullYear();


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
        locationCode: this.form.locationCode || undefined,
        maxDailyMinutes: this.form.maxDailyMinutes ?? undefined,
        maxWeeklyMinutes: this.form.maxWeeklyMinutes ?? undefined,
        minRestMinutes: this.form.minRestMinutes ?? undefined,
        policyType: this.activeTab(),
        providerCode: this.form.providerCode || undefined,
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
      const result = await this.timeApi.importOfficialHolidays({
        locationCode: this.form.locationCode.trim(),
        providerCode: this.form.providerCode.trim(),
        scopeLevel: 'user',
        year: this.holidayYear,
      });
      this.message.set(`Imported ${result.imported} official holidays.`);
      await this.reload();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to import holidays.');
    }
  }

  private async reload() {
    const [policies, preview] = await Promise.all([
      this.timeApi.listPolicies(),
      this.timeApi.previewEffectivePolicies(),
    ]);
    this.policiesState.set(policies);
    this.previewState.set(preview.categories);
  }

  private parseDaysOfWeek() {
    const values = this.form.daysOfWeekToken
      .split(',')
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    return values.length > 0 ? Array.from(new Set(values)) : undefined;
  }
}
