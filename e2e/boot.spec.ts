import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('loads under the base path with no errors', async ({ page }) => {
  const { problems } = await openApp(page);
  expect(page.url()).toContain('/conditioning-clock/');
  await expect(page).toHaveTitle('Conditioning Clock');
  await expect(page.getByRole('group', { name: 'Mode' })).toBeVisible();
  expect(problems).toEqual([]);
});
