import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { CalApiService } from './cal-api.service';
import { ContextService } from './context.service';

type HomeCalendarEntry = {
  dueAt?: string | null;
  startAt?: string | null;
  title: string;
};

type HomeTaskSummary = {
  dueAt: string | null;
  id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  title: string;
};

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="grid gap-6" data-testid="page-home">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm grid gap-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="ui-kicker">End-User Workspace</p>
            <h1 class="mt-3 text-3xl font-semibold tracking-tight">Home</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-base-content/65">
              Upcoming work and calendar activity for {{ contextLabel() }}.
            </p>
          </div>
          <div class="badge badge-outline h-10 px-4 text-sm">
            {{ upcomingEntries().length }} upcoming items
          </div>
        </div>

        <p *ngIf="errorMessage()" class="alert alert-warning">{{ errorMessage() }}</p>
        <p *ngIf="isLoading()" class="alert alert-info">Loading home summary…</p>

        <div
          class="stats stats-vertical border border-base-300 bg-base-100 shadow-none lg:stats-horizontal"
        >
          <div class="stat">
            <div class="stat-title">Upcoming calendar items</div>
            <div class="stat-value text-3xl">{{ upcomingEntries().length }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">Open tasks</div>
            <div class="stat-value text-3xl">{{ openTaskCount() }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">Overdue tasks</div>
            <div class="stat-value text-3xl">{{ overdueTaskCount() }}</div>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <div class="mb-4">
              <h2 class="text-lg font-semibold">Upcoming items</h2>
              <p class="mt-1 text-sm text-base-content/60">
                The next dated entries across your active calendars.
              </p>
            </div>
            <ul class="menu w-full gap-1 rounded-box bg-base-100 p-0">
              <li *ngFor="let entry of upcomingEntries()">
                <div
                  class="flex items-start justify-between rounded-box border border-base-300 px-4 py-3"
                >
                  <strong class="font-medium">{{ entry.title }}</strong>
                  <span class="text-sm text-base-content/55">{{
                    formatMoment(entry.startAt || entry.dueAt)
                  }}</span>
                </div>
              </li>
              <li
                *ngIf="upcomingEntries().length === 0"
                class="rounded-box border border-dashed border-base-300 px-4 py-6 text-sm text-base-content/55"
              >
                No upcoming items in the next 7 days.
              </li>
            </ul>
          </article>

          <article class="rounded-box border border-base-300 bg-base-100 p-4">
            <div class="mb-4">
              <h2 class="text-lg font-semibold">Task focus</h2>
              <p class="mt-1 text-sm text-base-content/60">
                Highest-priority unfinished work for the current context.
              </p>
            </div>
            <ul class="menu w-full gap-1 rounded-box bg-base-100 p-0">
              <li *ngFor="let task of prioritizedTasks()">
                <div
                  class="flex items-start justify-between rounded-box border border-base-300 px-4 py-3"
                >
                  <strong class="font-medium">{{ task.title }}</strong>
                  <span class="text-sm text-base-content/55"
                    >{{ task.status }} · {{ task.priority }}</span
                  >
                </div>
              </li>
              <li
                *ngIf="prioritizedTasks().length === 0"
                class="rounded-box border border-dashed border-base-300 px-4 py-6 text-sm text-base-content/55"
              >
                No task focus items right now.
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  `,
})
export class HomeComponent {
  private readonly calApi = inject(CalApiService);
  private readonly contextService = inject(ContextService);

  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly upcomingEntries = signal<HomeCalendarEntry[]>([]);
  readonly taskSummaries = signal<HomeTaskSummary[]>([]);
  readonly openTaskCount = computed(
    () => this.taskSummaries().filter((task) => task.status !== 'completed').length,
  );
  readonly overdueTaskCount = computed(
    () =>
      this.taskSummaries().filter(
        (task) => task.dueAt && task.status !== 'completed' && new Date(task.dueAt) < new Date(),
      ).length,
  );
  readonly prioritizedTasks = computed(() =>
    [...this.taskSummaries()]
      .filter((task) => task.status !== 'completed')
      .sort((left, right) => {
        const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (
          priorityRank[left.priority] - priorityRank[right.priority] ||
          (left.dueAt ?? '').localeCompare(right.dueAt ?? '')
        );
      })
      .slice(0, 5),
  );

  constructor() {
    effect(() => {
      const contextKey = this.contextService.activeContext().id;
      void contextKey;
      void this.load();
    });
  }

  private async load() {
    try {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const [calendarView, tasks] = await Promise.all([
        this.calApi.listCalendarView({ from, to }),
        this.calApi.listTasks({ deadlinePeriod: 'all', priority: 'all', status: 'all' }),
      ]);
      this.upcomingEntries.set((calendarView.entries as HomeCalendarEntry[]).slice(0, 6));
      this.taskSummaries.set(tasks as HomeTaskSummary[]);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to load home summary.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  formatMoment(value: string | null | undefined) {
    if (!value) {
      return 'No date';
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
}
