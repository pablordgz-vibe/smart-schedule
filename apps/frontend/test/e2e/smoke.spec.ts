import { test, expect } from '@playwright/test';

test('renders the Sprint 0 shell scaffold', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/SmartSchedule/i);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('context-switcher')).toBeVisible();
  await expect(page.getByTestId('quick-create')).toBeVisible();
  await expect(page.getByTestId('nav-schedules')).toBeVisible();
  await expect(page.getByTestId('page-home')).toBeVisible();
});
