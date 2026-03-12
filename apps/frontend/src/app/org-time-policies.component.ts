import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrgApiService } from './org-api.service';
import {
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
    <section class="ui-page" data-testid="page-org-time-policies">
      <article class="ui-card stack">
        <p class="ui-kicker">Organization Administration</p>
        <h1>Time Policies</h1>
        <p class="ui-copy">
          Configure working hours, availability, unavailability, holidays, blackout periods, rest
          rules, and maximum hours.
        </p>

        <div class="ui-panel precedence-panel">
          <h2>Precedence</h2>
          <p class="ui-copy">User overrides group overrides organization.</p>
        </div>

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

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-denied">{{ errorMessage() }}</p>

        <div class="grid two" *ngIf="organizationId(); else noContext">
          <section class="ui-panel stack-tight">
            <h2>Rule editor</h2>
            <label class="ui-field">
              <span>Scope</span>
              <select [(ngModel)]="form.scopeLevel" [ngModelOptions]="{ standalone: true }">
                <option value="organization">organization</option>
                <option value="group">group</option>
                <option value="user">user</option>
              </select>
            </label>

            <label class="ui-field" *ngIf="form.scopeLevel === 'group'">
              <span>Target group</span>
              <select [(ngModel)]="form.targetGroupId" [ngModelOptions]="{ standalone: true }">
                <option value="">Select group</option>
                <option *ngFor="let group of groups()" [value]="group.id">{{ group.name }}</option>
              </select>
            </label>

            <label class="ui-field" *ngIf="form.scopeLevel === 'user'">
              <span>Target user</span>
              <select [(ngModel)]="form.targetUserId" [ngModelOptions]="{ standalone: true }">
                <option value="">Select user</option>
                <option *ngFor="let user of memberships()" [value]="user.userId">
                  {{ user.name }}
                </option>
              </select>
            </label>

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

              <ng-container *ngSwitchCase="'unavailability'">
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
              Save policy
            </button>
          </section>

          <section class="ui-panel stack-tight">
            <h2>Official holiday import selector</h2>
            <div class="inline-fields">
              <label class="ui-field">
                <span>Provider</span>
                <input
                  [(ngModel)]="holidayImport.providerCode"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
              <label class="ui-field">
                <span>Location</span>
                <input
                  [(ngModel)]="holidayImport.locationCode"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
              <label class="ui-field">
                <span>Year</span>
                <input
                  type="number"
                  [(ngModel)]="holidayImport.year"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
            </div>
            <button class="ui-button ui-button-secondary" type="button" (click)="importHolidays()">
              Import official holidays
            </button>
            <p class="ui-copy" *ngIf="lastImportMessage()">{{ lastImportMessage() }}</p>

            <h2>Effective policy preview</h2>
            <label class="ui-field">
              <span>Preview user</span>
              <select
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
                <strong>{{ item.category }}</strong>
                <span class="ui-chip">{{ item.scope }}</span>
                <span class="ui-copy">rules: {{ item.ruleCount }}</span>
              </li>
            </ul>
          </section>
        </div>

        <article class="ui-panel" *ngIf="organizationId()">
          <h2>Current {{ activeTabLabel() }} rules</h2>
          <ul class="simple-list">
            <li *ngFor="let policy of filteredPolicies()" data-testid="time-policy-row">
              <div>
                <strong>{{ policy.title }}</strong>
                <p class="ui-copy">
                  {{ policy.scopeLevel }} · {{ policy.sourceType }} · {{ policy.updatedAt }}
                </p>
              </div>
              <button class="ui-button" type="button" (click)="removePolicy(policy.id)">
                Delete
              </button>
            </li>
            <li *ngIf="filteredPolicies().length === 0" class="ui-copy">
              No rules in this tab yet.
            </li>
          </ul>
        </article>

        <ng-template #noContext>
          <article class="ui-panel">
            <h2>Organization context required</h2>
            <p class="ui-copy">
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

      @media (max-width: 1100px) {
        .inline-fields {
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
  readonly lastImportMessage = signal<string | null>(null);

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
    Record<string, { resolvedFromScope: TimePolicyScopeLevel | null; rules: Array<{ id: string }> }>
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
    locationCode: 'US',
    providerCode: 'public-holidays',
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
    })),
  );

  readonly activeTabLabel = computed(
    () => this.tabs.find((tab) => tab.id === this.activeTab())?.label ?? this.activeTab(),
  );

  constructor() {
    void this.reload();
  }

  setActiveTab(tab: TimePolicyCategory) {
    this.activeTab.set(tab);
  }

  async createPolicy() {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      await this.timeApi.createPolicy(this.buildPolicyPayload());
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to create policy.');
    }
  }

  async removePolicy(policyId: string) {
    try {
      this.errorMessage.set(null);
      await this.timeApi.deletePolicy(policyId);
      await this.reloadPolicies();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to delete policy.');
    }
  }

  async importHolidays() {
    try {
      this.errorMessage.set(null);
      this.lastImportMessage.set(null);

      const result = await this.timeApi.importOfficialHolidays({
        locationCode: this.holidayImport.locationCode,
        providerCode: this.holidayImport.providerCode,
        scopeLevel: this.form.scopeLevel,
        targetGroupId:
          this.form.scopeLevel === 'group' ? this.form.targetGroupId || undefined : undefined,
        targetUserId:
          this.form.scopeLevel === 'user' ? this.form.targetUserId || undefined : undefined,
        year: this.holidayImport.year,
      });

      this.lastImportMessage.set(`${result.imported} official holidays imported.`);
      await this.reloadPolicies();
      await this.loadPreview();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to import holidays.');
    }
  }

  async loadPreview() {
    try {
      const preview = await this.timeApi.previewEffectivePolicies(this.previewUserId || undefined);
      this.previewState.set(preview.categories);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load policy preview.',
      );
    }
  }

  private async reload() {
    if (!this.organizationId()) {
      return;
    }

    try {
      this.errorMessage.set(null);
      const [memberships, groups] = await Promise.all([
        this.orgApi.listMemberships(this.organizationId()!),
        this.orgApi.listGroups(this.organizationId()!),
      ]);
      this.membershipsState.set(memberships);
      this.groupsState.set(groups.map((group) => ({ id: group.id, name: group.name })));

      await this.reloadPolicies();
      await this.loadPreview();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load organization time policies.',
      );
    }
  }

  private async reloadPolicies() {
    this.policiesState.set(await this.timeApi.listPolicies());
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
}
