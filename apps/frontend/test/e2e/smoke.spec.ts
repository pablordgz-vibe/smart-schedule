import { test, expect, type Page } from '@playwright/test';

async function mockShellBootstrapApi(page: Page) {
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
      body: JSON.stringify({
        activeContext: {
          id: 'demo-user',
          tenantId: null,
          type: 'personal',
        },
        authenticated: true,
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
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test('renders the Sprint 0 shell scaffold', async ({ page }) => {
  await mockShellBootstrapApi(page);
  await page.goto('/');

  await expect(page).toHaveTitle(/SmartSchedule/i);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('context-switcher')).toBeVisible();
  await expect(page.getByTestId('quick-create')).toBeVisible();
  await expect(page.getByTestId('nav-schedules')).toBeVisible();
  await expect(page.getByTestId('page-home')).toBeVisible();
});

test('exposes accessible shell landmarks and labeled controls', async ({ page }) => {
  await mockShellBootstrapApi(page);
  await page.goto('/');

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Global search' })).toBeVisible();
  await expect(page.getByLabel('Active context')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
});
