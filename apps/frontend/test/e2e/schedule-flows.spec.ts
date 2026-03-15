import { expect, test, type Page, type Route } from '@playwright/test';

type MockState = {
  activeContextKey: 'personal';
  schedules: Array<{
    assignmentCount: number;
    boundaryEndDate: string | null;
    boundaryStartDate: string | null;
    description: string | null;
    exceptionCount: number;
    id: string;
    itemSummary: { eventCount: number; taskCount: number; total: number };
    name: string;
    nextOccurrences: Array<{
      date: string;
      items: Array<{ itemType: 'event' | 'task'; title: string }>;
      occurrenceDate: string;
      versionId: string | null;
    }>;
    recurrenceSummary: string;
    state: 'active' | 'template';
    timezone: string;
    timezoneMode: 'utc_constant' | 'wall_clock';
    timezoneModeLabel: string;
    validation: Array<{ field: string; level: 'error' | 'warning'; message: string }>;
    versionCount: number;
  }>;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

function buildSession() {
  return {
    activeContext: { id: 'demo-user', tenantId: null, type: 'personal' as const },
    authenticated: true,
    availableContexts: [
      {
        key: 'personal',
        label: 'Personal',
        membershipRole: null,
        context: { id: 'demo-user', tenantId: null, type: 'personal' as const },
      },
    ],
    configuredIntegrations: [],
    configuredSocialProviders: [],
    csrfToken: 'playwright-csrf-token',
    requireEmailVerification: false,
    user: {
      adminTier: null,
      authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
      email: 'demo.user@example.com',
      emailVerified: true,
      id: 'demo-user',
      name: 'Demo User',
      recoverUntil: null,
      roles: ['user'],
      state: 'active',
    },
  };
}

function makeScheduleDetail(state: MockState, scheduleId: string) {
  const schedule = state.schedules.find((entry) => entry.id === scheduleId)!;
  return {
    schedule: {
      boundaryEndDate: schedule.boundaryEndDate,
      boundaryStartDate: schedule.boundaryStartDate,
      description: schedule.description,
      id: schedule.id,
      name: schedule.name,
      state: schedule.state,
      versions: [
        {
          effectiveFromDate: '2026-03-16',
          id: `${schedule.id}-version-1`,
          items: [
            {
              dayOffset: 0,
              dueTime: null,
              durationMinutes: 60,
              id: `${schedule.id}-event-1`,
              itemType: 'event',
              repetitionMode: 'grouped',
              startTime: '09:00',
              title: schedule.nextOccurrences[0]?.items[0]?.title ?? 'Shift start',
              workRelated: true,
            },
            {
              dayOffset: 0,
              dueTime: '11:00',
              durationMinutes: null,
              id: `${schedule.id}-task-1`,
              itemType: 'task',
              repetitionMode: 'individual',
              startTime: null,
              title: schedule.nextOccurrences[0]?.items[1]?.title ?? 'Checklist',
              workRelated: true,
            },
          ],
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            pauses: [],
            weekdays: [1],
          },
          timezone: schedule.timezone,
          timezoneMode: schedule.timezoneMode,
        },
      ],
    },
    summary: {
      itemSummary: schedule.itemSummary,
      recurrenceSummary: schedule.recurrenceSummary,
      timezoneModeLabel: schedule.timezoneModeLabel,
    },
    upcomingOccurrences: schedule.nextOccurrences,
    validation: [],
  };
}

async function mockScheduleApis(page: Page) {
  const state: MockState = {
    activeContextKey: 'personal',
    schedules: [
      {
        assignmentCount: 0,
        boundaryEndDate: null,
        boundaryStartDate: '2026-03-16',
        description: 'Reusable team handoff pattern',
        exceptionCount: 0,
        id: 'template-1',
        itemSummary: { eventCount: 1, taskCount: 1, total: 2 },
        name: 'Handoff template',
        nextOccurrences: [
          {
            date: '2026-03-16',
            items: [
              { itemType: 'event', title: 'Shift start' },
              { itemType: 'task', title: 'Checklist' },
            ],
            occurrenceDate: '2026-03-16',
            versionId: 'template-1-version-1',
          },
        ],
        recurrenceSummary: 'Every week on Mon',
        state: 'template',
        timezone: 'Europe/Madrid',
        timezoneMode: 'wall_clock',
        timezoneModeLabel: 'Keep local wall-clock time constant',
        validation: [],
        versionCount: 1,
      },
      {
        assignmentCount: 0,
        boundaryEndDate: null,
        boundaryStartDate: '2026-03-16',
        description: 'Live rota',
        exceptionCount: 1,
        id: 'active-1',
        itemSummary: { eventCount: 1, taskCount: 1, total: 2 },
        name: 'Weekday rota',
        nextOccurrences: [
          {
            date: '2026-03-23',
            items: [
              { itemType: 'event', title: 'Morning coverage' },
              { itemType: 'task', title: 'Checklist' },
            ],
            occurrenceDate: '2026-03-23',
            versionId: 'active-1-version-1',
          },
        ],
        recurrenceSummary: 'Every week on Mon',
        state: 'active',
        timezone: 'Europe/Madrid',
        timezoneMode: 'wall_clock',
        timezoneModeLabel: 'Keep local wall-clock time constant',
        validation: [],
        versionCount: 1,
      },
    ],
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/platform/bootstrap-status') {
      return fulfillJson(route, { edition: 'community', isComplete: true });
    }
    if (path === '/api/auth/session') {
      return fulfillJson(route, buildSession());
    }
    if (path === '/api/auth/context') {
      return fulfillJson(route, { session: buildSession() });
    }

    if (path === '/api/sched') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          name: string;
          state: 'active' | 'template';
        };
        const schedule = {
          ...state.schedules[0],
          id: `schedule-${state.schedules.length + 1}`,
          name: body.name,
          state: body.state,
        };
        state.schedules.unshift(schedule);
        return fulfillJson(route, makeScheduleDetail(state, schedule.id), 201);
      }

      const currentState = url.searchParams.get('state');
      return fulfillJson(route, {
        schedules: state.schedules.filter((schedule) =>
          currentState ? schedule.state === currentState : true,
        ),
      });
    }

    if (path === '/api/sched/preview') {
      return fulfillJson(route, {
        recurrenceSummary: 'Every week on Mon',
        timezoneModeLabel: 'Keep local wall-clock time constant',
        upcomingOccurrences: [
          {
            date: '2026-03-16',
            items: [{ itemType: 'event', title: 'Shift start' }],
            occurrenceDate: '2026-03-16',
            versionId: 'preview-version-1',
          },
        ],
        validation: [],
      });
    }

    const scheduleDetailMatch = /^\/api\/sched\/([^/]+)$/.exec(path);
    if (scheduleDetailMatch) {
      const scheduleId = scheduleDetailMatch[1];
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as {
          definition: { state: 'active' | 'archived' | 'template'; name: string };
        };
        const schedule = state.schedules.find((entry) => entry.id === scheduleId)!;
        schedule.name = body.definition.name;
        schedule.state = body.definition.state === 'archived' ? 'active' : body.definition.state;
        return fulfillJson(route, makeScheduleDetail(state, scheduleId));
      }
      return fulfillJson(route, makeScheduleDetail(state, scheduleId));
    }

    const mutationMatch = /^\/api\/sched\/([^/]+)\/occurrences\/([^/]+)\/mutate$/.exec(path);
    if (mutationMatch) {
      const scheduleId = mutationMatch[1];
      const schedule = state.schedules.find((entry) => entry.id === scheduleId)!;
      const body = route.request().postDataJSON() as {
        overwriteExceptions?: boolean;
        overrideItem?: { title?: string };
      };

      if (!body.overwriteExceptions && schedule.exceptionCount > 0) {
        return fulfillJson(
          route,
          {
            dates: ['2026-03-23'],
            message: 'This recurrence update would overwrite existing exceptions.',
          },
          409,
        );
      }

      schedule.nextOccurrences[0].items[1].title = body.overrideItem?.title ?? 'Updated checklist';
      schedule.exceptionCount = 0;
      return fulfillJson(route, {
        occurrences: [],
      });
    }

    const occurrenceMatch = /^\/api\/sched\/([^/]+)\/occurrences$/.exec(path);
    if (occurrenceMatch) {
      return fulfillJson(route, {
        occurrences: [
          {
            detached: false,
            dueAt: null,
            endsAt: '2026-03-23T10:00:00.000Z',
            itemDefinitionId: `${occurrenceMatch[1]}-item-1`,
            itemType: 'event',
            localDate: '2026-03-23',
            occurrenceDate: '2026-03-23',
            scheduleId: occurrenceMatch[1],
            scheduleVersionId: `${occurrenceMatch[1]}-version-1`,
            startsAt: '2026-03-23T09:00:00.000Z',
            timezone: 'Europe/Madrid',
            timezoneMode: 'wall_clock',
            title: 'Morning coverage',
          },
        ],
      });
    }

    return fulfillJson(route, {});
  });
}

test('creates schedules in the dedicated builder and resolves occurrence overwrite conflicts', async ({
  page,
}) => {
  await mockScheduleApis(page);
  await page.goto('/schedules');

  await expect(page.getByTestId('page-schedules')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Handoff template' })).toBeVisible();
  await expect(page.getByText('Occurrence calendar')).toBeVisible();

  await page.getByRole('link', { name: 'New schedule' }).click();
  await expect(page).toHaveURL(/\/schedules\/builder$/);

  await page.getByLabel('Name').fill('Field rota');
  await page.getByLabel('State').selectOption('active');
  await page.getByRole('button', { name: 'Create schedule' }).click();

  await expect(page).toHaveURL(/\/schedules\?tab=active$/);
  await expect(page.getByRole('heading', { name: 'Field rota' })).toBeVisible();
  await expect(
    page
      .locator('article.card')
      .filter({ has: page.getByRole('heading', { name: 'Field rota' }) })
      .getByText('Shift start'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Active schedules' }).click();
  await expect(page.getByRole('heading', { name: 'Weekday rota' })).toBeVisible();

  await page
    .locator('article.card')
    .filter({ has: page.getByRole('heading', { name: 'Weekday rota' }) })
    .getByRole('button', { name: 'Replace item' })
    .click();
  await page.getByLabel('Replacement title').fill('Checklist replacement');
  await page.getByRole('button', { name: 'Apply update' }).click();
  await expect(page.getByText(/conflicts with existing exceptions/i)).toBeVisible();
  await page.getByLabel('Overwrite conflicting exceptions if the API reports a conflict').check();
  await page.getByRole('button', { name: 'Apply update' }).click();
  await expect(page.getByText('Occurrence update applied.')).toBeVisible();
});
