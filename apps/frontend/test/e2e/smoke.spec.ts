import { expect, test, type Page } from '@playwright/test';

type MockContextKey = 'org:org-1' | 'personal' | 'system';

type MockSessionState = {
  activeContextKey: MockContextKey;
  contextSwitchCalls: number;
};

function buildSessionPayload(state: MockSessionState) {
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
      { code: 'openai', enabled: true, title: 'OpenAI' },
      { code: 'google', enabled: true, title: 'Google' },
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

async function mockShellBootstrapApi(
  page: Page,
  input?: { initialContextKey?: MockContextKey },
): Promise<MockSessionState> {
  const state: MockSessionState = {
    activeContextKey: input?.initialContextKey ?? 'personal',
    contextSwitchCalls: 0,
  };

  await page.route('**/api/platform/bootstrap-status', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        edition: 'community',
        isComplete: true,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildSessionPayload(state)),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api/auth/context', async (route) => {
    state.contextSwitchCalls += 1;
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

    await route.fulfill({
      body: JSON.stringify({
        session: buildSessionPayload(state),
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return state;
}

test('renders the Sprint 0 shell scaffold', async ({ page }) => {
  await mockShellBootstrapApi(page);
  await page.goto('/');

  await expect(page).toHaveTitle(/SmartSchedule/i);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('context-switcher')).toBeVisible();
  await expect(page.getByTestId('quick-create')).toBeVisible();
  await expect(page.getByTestId('nav-organizations')).toBeVisible();
  await expect(page.getByTestId('page-home')).toBeVisible();
});

test('exposes accessible shell landmarks and labeled controls', async ({ page }) => {
  await mockShellBootstrapApi(page);
  await page.goto('/');

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Global search' })).toBeVisible();
  await expect(page.getByLabel('Active context')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
});

test('preserves the current route when switching contexts and the destination is allowed', async ({
  page,
}) => {
  const state = await mockShellBootstrapApi(page);
  await page.goto('/calendar');

  await expect(page.getByTestId('page-calendar')).toBeVisible();
  await page.getByTestId('context-switcher').selectOption('org:org-1');

  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByTestId('context-switcher')).toHaveValue('org:org-1');
  expect(state.activeContextKey).toBe('org:org-1');
  expect(state.contextSwitchCalls).toBe(1);
});

test('falls back to the nearest valid landing route when the current route is not allowed', async ({
  page,
}) => {
  const state = await mockShellBootstrapApi(page, { initialContextKey: 'system' });
  await page.goto('/admin/users');

  await expect(page.getByTestId('page-admin-users')).toBeVisible();
  await page.getByTestId('context-switcher').selectOption('personal');

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('page-home')).toBeVisible();
  await expect(page.getByTestId('context-switcher')).toHaveValue('personal');
  expect(state.activeContextKey).toBe('personal');
  expect(state.contextSwitchCalls).toBe(1);
});

test('prompts before switching context away from a guarded dirty route', async ({ page }) => {
  const state = await mockShellBootstrapApi(page, { initialContextKey: 'org:org-1' });
  await page.goto('/org/assignments');

  await expect(page.getByTestId('page-org-assignments')).toBeVisible();
  await page.getByTestId('mark-dirty').click();
  await expect(page.getByTestId('dirty-indicator')).toContainText('Unsaved changes active');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('You have unsaved changes in Organization: Atlas Ops.');
    expect(dialog.message()).toContain('switch to Personal');
    await dialog.dismiss();
  });
  await page.getByTestId('context-switcher').selectOption('personal');

  await expect(page).toHaveURL(/\/org\/assignments$/);
  await expect(page.getByTestId('context-switcher')).toHaveValue('org:org-1');
  expect(state.contextSwitchCalls).toBe(0);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('You have unsaved changes in Organization: Atlas Ops.');
    expect(dialog.message()).toContain('switch to Personal');
    await dialog.accept();
  });
  await page.getByTestId('context-switcher').selectOption('personal');

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('context-switcher')).toHaveValue('personal');
  expect(state.activeContextKey).toBe('personal');
  expect(state.contextSwitchCalls).toBe(1);
});
