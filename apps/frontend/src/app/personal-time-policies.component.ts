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
    <section class="ui-panel stack-tight">
      <h2>Personal Time Policies</h2>
      <p class="ui-copy">
        Define personal working hours, availability, holidays, blackout periods, rest rules, and
        maximum-hour warnings used by scheduling assistance.
      </p>

      <ng-container *ngIf="isPersonalContext(); else wrongContext">
        <div class="tabs">
          <button
            *ngFor="let tab of tabs"
            class="ui-button"
            type="button"
            [class.ui-button-primary]="activeTab() === tab.id"
            (click)="setActiveTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <p class="ui-banner ui-banner-warning" *ngIf="errorMessage()">{{ errorMessage() }}</p>
        <p class="ui-banner ui-banner-info" *ngIf="message()">{{ message() }}</p>

        <div class="two-column">
          <section class="ui-panel stack-tight">
            <h3>Create rule</h3>
            <label class="ui-field">
              <span>Title</span>
              <input [(ngModel)]="form.title" [ngModelOptions]="{ standalone: true }" />
            </label>

            <ng-container [ngSwitch]="activeTab()">
              <ng-container *ngSwitchCase="'working_hours'">
                <div class="inline-fields">
                  <label class="ui-field">
                    <span>Days (0-6 comma separated)</span>
                    <input
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>Start</span>
                    <input
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>End</span>
                    <input
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'availability'">
                <div class="inline-fields">
                  <label class="ui-field">
                    <span>Days</span>
                    <input
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>Start</span>
                    <input
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>End</span>
                    <input
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'unavailability'">
                <div class="inline-fields">
                  <label class="ui-field">
                    <span>Days</span>
                    <input
                      [(ngModel)]="form.daysOfWeekToken"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>Start</span>
                    <input
                      type="time"
                      [(ngModel)]="form.startTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>End</span>
                    <input
                      type="time"
                      [(ngModel)]="form.endTime"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'holiday'">
                <div class="inline-fields">
                  <label class="ui-field">
                    <span>Date</span>
                    <input
                      type="date"
                      [(ngModel)]="form.date"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>Holiday name</span>
                    <input [(ngModel)]="form.holidayName" [ngModelOptions]="{ standalone: true }" />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'blackout'">
                <div class="inline-fields">
                  <label class="ui-field">
                    <span>Start</span>
                    <input
                      type="datetime-local"
                      [(ngModel)]="form.startAt"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>End</span>
                    <input
                      type="datetime-local"
                      [(ngModel)]="form.endAt"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'rest'">
                <label class="ui-field">
                  <span>Minimum rest minutes</span>
                  <input
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
                  <label class="ui-field">
                    <span>Max daily minutes</span>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      [(ngModel)]="form.maxDailyMinutes"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                  <label class="ui-field">
                    <span>Max weekly minutes</span>
                    <input
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

            <button class="ui-button ui-button-primary" type="button" (click)="createPolicy()">
              Save personal rule
            </button>
          </section>

          <section class="ui-panel stack-tight">
            <h3>Official holiday import</h3>
            <div class="inline-fields">
              <label class="ui-field">
                <span>Provider</span>
                <input [(ngModel)]="form.providerCode" [ngModelOptions]="{ standalone: true }" />
              </label>
              <label class="ui-field">
                <span>Location</span>
                <input [(ngModel)]="form.locationCode" [ngModelOptions]="{ standalone: true }" />
              </label>
              <label class="ui-field">
                <span>Year</span>
                <input
                  type="number"
                  [(ngModel)]="holidayYear"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
            </div>
            <button class="ui-button ui-button-secondary" type="button" (click)="importHolidays()">
              Import official holidays
            </button>

            <h3>Effective preview</h3>
            <ul class="simple-list">
              <li *ngFor="let row of previewRows()">
                <strong>{{ row.category }}</strong>
                <span class="ui-chip">{{ row.scope || 'none' }}</span>
                <span class="ui-copy">rules: {{ row.ruleCount }}</span>
              </li>
            </ul>
          </section>
        </div>

        <section class="ui-panel stack-tight">
          <h3>Current {{ activeTabLabel() }} rules</h3>
          <ul class="simple-list">
            <li *ngFor="let policy of filteredPolicies()">
              <div>
                <strong>{{ policy.title }}</strong>
                <p class="ui-copy">{{ policy.sourceType }} · {{ policy.updatedAt }}</p>
              </div>
              <button class="ui-button" type="button" (click)="removePolicy(policy.id)">
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
        <p class="ui-copy">Switch into personal context to manage personal time policies.</p>
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
