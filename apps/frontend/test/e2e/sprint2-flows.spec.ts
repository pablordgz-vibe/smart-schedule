import { expect, test, type Page, type Route } from '@playwright/test';

type ContextKey = 'org:org-1' | 'personal' | 'system';

type MockState = {
  activeContextKey: ContextKey;
  calendars: Array<{
    id: string;
    name: string;
    ownerUserId: string | null;
    type?: 'organization' | 'personal';
  }>;
  groups: Array<{
    id: string;
    members: Array<{ userId: string; name: string; email: string }>;
    name: string;
  }>;
  memberships: Array<{ userId: string; name: string; email: string; role: 'admin' | 'member' }>;
  orgInvitations: Array<{
    id: string;
    invitedEmail: string;
    role: 'admin' | 'member';
    previewInviteCode?: string;
  }>;
  outbox: Array<{
    createdAt: string;
    expiresAt: string;
    id: string;
    kind: string;
    recipientEmail: string;
    subject: string;
    transport: string;
  }>;
  integrationConfig: Array<{
    code: string;
    enabled: boolean;
    hasCredentials: boolean;
    mode: 'api-key' | 'provider-login';
    updatedAt: string;
  }>;
  tasks: Array<{
    allocation: {
      allocatedMinutes: number;
      estimateMinutes: number | null;
      overAllocated: boolean;
      remainingMinutes: number | null;
    };
    dueAt: string | null;
    estimatedDurationMinutes: number | null;
    id: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    status: 'todo' | 'in_progress' | 'blocked' | 'completed';
    subtaskSummary: { completed: number; total: number };
    taskDependencyCount: number;
    title: string;
    workRelated: boolean;
  }>;
};

function buildSessionPayload(state: MockState) {
  const activeContext =
    state.activeContextKey === 'system'
      ? { id: 'demo-user', tenantId: null, type: 'system' as const }
      : state.activeContextKey === 'org:org-1'
        ? { id: 'org-1', tenantId: 'org-1', type: 'organization' as const }
        : { id: 'demo-user', tenantId: null, type: 'personal' as const };

  return {
    activeContext,
    authenticated: true,
    availableContexts: [
      {
        key: 'personal',
        label: 'Personal',
        membershipRole: null,
        context: { id: 'demo-user', tenantId: null, type: 'personal' as const },
      },
      {
        key: 'org:org-1',
        label: 'Organization: Atlas Ops',
        membershipRole: 'admin' as const,
        context: { id: 'org-1', tenantId: 'org-1', type: 'organization' as const },
      },
      {
        key: 'system',
        label: 'System Administration',
        membershipRole: null,
        context: { id: 'demo-user', tenantId: null, type: 'system' as const },
      },
    ],
    configuredIntegrations: [
      { code: 'smtp', enabled: true, title: 'SMTP / transactional email' },
      { code: 'openai', enabled: true, title: 'OpenAI' },
    ],
    configuredSocialProviders: [
      { code: 'google', displayName: 'Google' },
      { code: 'github', displayName: 'GitHub' },
    ],
    csrfToken: 'playwright-csrf-token',
    requireEmailVerification: false,
    user: {
      adminTier: 0,
      authMethods: [{ kind: 'password', linkedAt: '2026-03-11T00:00:00.000Z' }],
      email: 'demo.user@example.com',
      emailVerified: true,
      id: 'demo-user',
      name: 'Demo User',
      recoverUntil: null,
      roles: ['user', 'system-admin', 'system-admin:tier:0'],
      state: 'active',
    },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function mockSprint2Apis(page: Page, initialContextKey: ContextKey) {
  const state: MockState = {
    activeContextKey: initialContextKey,
    calendars: [
      { id: 'cal-org-1', name: 'Operations', ownerUserId: 'user-2', type: 'organization' },
      { id: 'cal-org-2', name: 'Shared', ownerUserId: null, type: 'organization' },
    ],
    groups: [{ id: 'grp-1', members: [], name: 'Support' }],
    memberships: [
      { userId: 'user-1', name: 'Alex Admin', email: 'alex@example.com', role: 'admin' },
      { userId: 'user-2', name: 'Mina Member', email: 'mina@example.com', role: 'member' },
    ],
    orgInvitations: [
      {
        id: 'inv-1',
        invitedEmail: 'new.person@example.com',
        role: 'member',
        previewInviteCode: 'preview-1',
      },
    ],
    outbox: [
      {
        createdAt: '2026-03-13T10:00:00.000Z',
        expiresAt: '2026-03-20T10:00:00.000Z',
        id: 'mail-1',
        kind: 'organization-invitation',
        recipientEmail: 'new.person@example.com',
        subject: 'Invitation to join Atlas Ops',
        transport: 'outbox',
      },
    ],
    integrationConfig: [
      {
        code: 'smtp',
        enabled: true,
        hasCredentials: true,
        mode: 'api-key',
        updatedAt: '2026-03-13T09:00:00.000Z',
      },
    ],
    tasks: [
      {
        allocation: {
          allocatedMinutes: 0,
          estimateMinutes: 60,
          overAllocated: false,
          remainingMinutes: 60,
        },
        dueAt: '2026-03-14T09:00:00.000Z',
        estimatedDurationMinutes: 60,
        id: 'task-1',
        priority: 'medium',
        status: 'todo',
        subtaskSummary: { completed: 0, total: 0 },
        taskDependencyCount: 0,
        title: 'Prepare rota',
        workRelated: true,
      },
      {
        allocation: {
          allocatedMinutes: 0,
          estimateMinutes: 30,
          overAllocated: false,
          remainingMinutes: 30,
        },
        dueAt: null,
        estimatedDurationMinutes: 30,
        id: 'task-2',
        priority: 'high',
        status: 'in_progress',
        subtaskSummary: { completed: 0, total: 0 },
        taskDependencyCount: 0,
        title: 'Confirm staffing',
        workRelated: true,
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
      return fulfillJson(route, buildSessionPayload(state));
    }
    if (path === '/api/auth/context') {
      const body = route.request().postDataJSON() as {
        contextType?: 'organization' | 'personal' | 'system';
        organizationId?: string;
      };
      state.activeContextKey =
        body.contextType === 'organization' && body.organizationId === 'org-1'
          ? 'org:org-1'
          : body.contextType === 'system'
            ? 'system'
            : 'personal';
      return fulfillJson(route, { session: buildSessionPayload(state) });
    }
    if (path === '/api/org/organizations/mine') {
      return fulfillJson(route, {
        organizations: [{ id: 'org-1', membershipRole: 'admin', name: 'Atlas Ops' }],
      });
    }
    if (path === '/api/org/invitations/mine') {
      return fulfillJson(route, { invitations: [] });
    }
    if (path === '/api/org/organizations/org-1/memberships') {
      return fulfillJson(route, { memberships: state.memberships });
    }
    if (path === '/api/org/organizations/org-1/invitations') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { email: string; role: 'admin' | 'member' };
        state.orgInvitations.unshift({
          id: `inv-${state.orgInvitations.length + 1}`,
          invitedEmail: body.email,
          role: body.role,
          previewInviteCode: 'preview-new',
        });
        return fulfillJson(route, { invitation: state.orgInvitations[0] }, 201);
      }
      return fulfillJson(route, { invitations: state.orgInvitations });
    }
    if (path === '/api/org/organizations/org-1/groups') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string };
        state.groups.push({ id: `grp-${state.groups.length + 1}`, members: [], name: body.name });
        return fulfillJson(route, { group: state.groups[state.groups.length - 1] }, 201);
      }
      return fulfillJson(route, { groups: state.groups });
    }
    if (
      path === '/api/org/organizations/org-1/groups/grp-1/members' &&
      route.request().method() === 'POST'
    ) {
      const body = route.request().postDataJSON() as { userId: string };
      const member = state.memberships.find((entry) => entry.userId === body.userId);
      if (member) {
        state.groups[0].members.push({
          email: member.email,
          name: member.name,
          userId: member.userId,
        });
      }
      return fulfillJson(route, { result: { ok: true } });
    }
    if (path === '/api/org/organizations/org-1/calendars') {
      return fulfillJson(route, {
        calendars: state.calendars.map(({ id, name, ownerUserId }) => ({
          defaultVisibility: ownerUserId ? 'owner-and-grants' : 'all-members',
          id,
          name,
          ownerUserId,
          visibilityGrants: [],
        })),
      });
    }
    if (
      path.startsWith('/api/org/organizations/org-1/calendars/') &&
      route.request().method() === 'POST'
    ) {
      return fulfillJson(route, { result: { ok: true } });
    }
    if (
      path.startsWith('/api/org/organizations/org-1/calendars/') &&
      route.request().method() === 'DELETE'
    ) {
      return fulfillJson(route, { result: { ok: true } });
    }
    if (path === '/api/cal/calendars') {
      return fulfillJson(route, {
        calendars:
          state.activeContextKey === 'personal'
            ? [
                {
                  id: 'cal-personal-1',
                  name: 'Personal',
                  ownerUserId: 'demo-user',
                  type: 'personal',
                },
              ]
            : state.calendars,
      });
    }
    if (path === '/api/cal/contacts/imported') {
      return fulfillJson(route, { contacts: [] });
    }
    if (path === '/api/cal/tasks') {
      return fulfillJson(route, { tasks: state.tasks });
    }
    if (path === '/api/cal/calendar-view') {
      return fulfillJson(route, {
        view: {
          entries: [
            {
              calendarEntryType: 'event',
              calendarIds: ['cal-org-1'],
              id: 'event-1',
              itemType: 'event',
              startAt: '2026-03-14T09:00:00.000Z',
              title: 'Team briefing',
            },
          ],
          selectedCalendarIds: ['cal-org-1'],
        },
      });
    }
    if (path === '/api/cal/events/event-1') {
      return fulfillJson(route, {
        event: {
          allDay: false,
          allDayEndDate: null,
          allDayStartDate: null,
          allocation: {
            allocatedMinutes: 0,
            estimateMinutes: null,
            overAllocated: false,
            remainingMinutes: null,
          },
          attachments: [],
          calendars: [{ calendarId: 'cal-org-1', calendarName: 'Operations' }],
          contacts: [],
          durationMinutes: 60,
          endAt: '2026-03-14T10:00:00.000Z',
          id: 'event-1',
          linkedTaskId: null,
          location: null,
          notes: null,
          provenance: null,
          startAt: '2026-03-14T09:00:00.000Z',
          title: 'Team briefing',
          workRelated: true,
        },
      });
    }
    if (path === '/api/auth/logout' || path === '/api/auth/account/delete') {
      return fulfillJson(route, { loggedOut: true, user: null });
    }
    if (path === '/api/admin/global-integrations') {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as {
          integrations: Array<{
            code: string;
            enabled: boolean;
            mode: 'api-key' | 'provider-login';
            credentials: Record<string, string>;
          }>;
        };
        state.integrationConfig = body.integrations
          .filter((entry) => entry.enabled)
          .map((entry) => ({
            code: entry.code,
            enabled: entry.enabled,
            hasCredentials: Object.keys(entry.credentials).length > 0 || entry.code === 'smtp',
            mode: entry.mode,
            updatedAt: '2026-03-13T12:00:00.000Z',
          }));
      }
      return fulfillJson(route, {
        configuredIntegrations: state.integrationConfig,
        edition: 'community',
        providers: [
          {
            category: 'email',
            code: 'smtp',
            credentialModes: ['api-key'],
            description: 'Outbound email delivery',
            displayName: 'SMTP / transactional email',
          },
          {
            category: 'ai',
            code: 'openai',
            credentialModes: ['api-key'],
            description: 'AI assistance',
            displayName: 'OpenAI',
          },
        ],
      });
    }
    if (path === '/api/admin/mail-outbox') {
      return fulfillJson(route, { messages: state.outbox });
    }

    return fulfillJson(route, {});
  });

  return state;
}

test('organization overview shows members and invitation delivery messaging without context errors', async ({
  page,
}) => {
  await mockSprint2Apis(page, 'org:org-1');
  await page.goto('/org/overview');

  await expect(page.getByTestId('page-org-overview')).toBeVisible();
  await expect(page.getByText('Organization members')).toBeVisible();
  await expect(
    page.getByText('Invitations are issued to the recipient email address.'),
  ).toBeVisible();
  await expect(page.getByText('Alex Admin')).toBeVisible();
  await expect(page.getByText('The active context is not permitted for this route.')).toHaveCount(
    0,
  );
});

test('group and calendar admin flows use searchable/selectable members instead of raw ids', async ({
  page,
}) => {
  await mockSprint2Apis(page, 'org:org-1');
  await page.goto('/org/groups');

  await page.getByLabel('Search members by name or email').fill('mina');
  await page.getByRole('button', { name: 'Add to group' }).click();
  await expect(page.getByText('Mina Member')).toBeVisible();

  await page.goto('/org/calendars');
  await expect(page.getByTestId('page-org-calendars').getByLabel('Owner')).toBeVisible();
  await expect(page.getByTestId('page-org-calendars').getByLabel('User')).toBeVisible();
});

test('calendar page renders the day grid without calendarIds validation noise', async ({
  page,
}) => {
  await mockSprint2Apis(page, 'org:org-1');
  await page.goto('/calendar');

  await expect(page.getByTestId('page-calendar')).toBeVisible();
  await expect(page.getByText('Calendar grid')).toBeVisible();
  await expect(page.getByTestId('page-calendar').getByText('Team briefing').first()).toBeVisible();
  await expect(page.getByText('calendarIds must be an array')).toHaveCount(0);
});

test('settings actions submit without empty-body parser errors', async ({ page }) => {
  await mockSprint2Apis(page, 'personal');
  await page.goto('/settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  await page.goto('/settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo User' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByLabel('Confirmation text')).toBeVisible();
  await page.getByLabel('Confirmation text').fill('DELETE');
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page).toHaveURL(/\/auth\/recover-account$/);
});

test('system admin can review email provider configuration and mail queue', async ({ page }) => {
  await mockSprint2Apis(page, 'system');
  await page.goto('/admin/global-integrations');

  await expect(page.getByTestId('page-admin-global-integrations')).toBeVisible();
  await expect(page.getByText('SMTP / transactional email')).toBeVisible();
  await expect(page.getByText('Email delivery queue')).toBeVisible();
  await expect(page.getByText('new.person@example.com')).toBeVisible();
});

test('task dependencies can be selected from task search instead of typing ids', async ({
  page,
}) => {
  await mockSprint2Apis(page, 'personal');
  await page.goto('/tasks');

  await page.getByLabel('Dependencies').fill('staff');
  await page.getByRole('button', { name: 'Add Confirm staffing' }).click();
  await expect(page.getByRole('button', { name: 'Confirm staffing ×' })).toBeVisible();
});
