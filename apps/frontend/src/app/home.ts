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
    <section class="ui-page" data-testid="page-home">
      <div class="ui-card stack">
        <p class="ui-kicker">End-User Workspace</p>
        <h1>Home</h1>
        <p class="ui-copy">
          Upcoming work and calendar activity for {{ contextLabel() }}.
        </p>

        <p *ngIf="errorMessage()" class="ui-banner ui-banner-warning">{{ errorMessage() }}</p>

        <div class="summary-grid">
          <article class="ui-panel">
            <h2>Upcoming calendar items</h2>
            <p class="summary-value">{{ upcomingEntries().length }}</p>
          </article>
          <article class="ui-panel">
            <h2>Open tasks</h2>
            <p class="summary-value">{{ openTaskCount() }}</p>
          </article>
          <article class="ui-panel">
            <h2>Overdue tasks</h2>
            <p class="summary-value">{{ overdueTaskCount() }}</p>
          </article>
        </div>

        <div class="summary-grid">
          <article class="ui-panel">
            <h2>Upcoming items</h2>
            <ul class="simple-list">
              <li *ngFor="let entry of upcomingEntries()">
                <strong>{{ entry.title }}</strong>
                <span class="ui-copy">{{ entry.startAt || entry.dueAt || 'No date' }}</span>
              </li>
              <li *ngIf="upcomingEntries().length === 0" class="ui-copy">
                No upcoming items in the next 7 days.
              </li>
            </ul>
          </article>

          <article class="ui-panel">
            <h2>Task focus</h2>
            <ul class="simple-list">
              <li *ngFor="let task of prioritizedTasks()">
                <strong>{{ task.title }}</strong>
                <span class="ui-copy">{{ task.status }} · {{ task.priority }}</span>
              </li>
              <li *ngIf="prioritizedTasks().length === 0" class="ui-copy">
                No task focus items right now.
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .stack {
        display: grid;
        gap: var(--spacing-4);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--spacing-4);
      }

      .summary-value {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
      }

      .ui-copy {
        color: var(--text-secondary);
      }

      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class HomeComponent {
  private readonly calApi = inject(CalApiService);
  private readonly contextService = inject(ContextService);

  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly errorMessage = signal<string | null>(null);
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
    }
  }
}
