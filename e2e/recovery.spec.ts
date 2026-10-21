import { expect, test } from '@playwright/test';
import { advance, chooseMode, openApp, openRun, timer } from './helpers';

test('a reload mid-run comes back at the right round and time', async ({
  page,
}) => {
  await openApp(page);
  await chooseMode(page, 'EMOM');
  await openRun(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await advance(page, 90_000);
  await expect(page.getByText('Round 2 / 10')).toBeVisible();

  await page.reload();
  const overlay = page.getByRole('button', { name: 'Tap to resume sound' });
  await expect(overlay).toBeVisible();
  await expect(overlay).toBeFocused();
  await overlay.click();
  await expect(overlay).toBeHidden();
  // 90s in, after a 10s lead-in: 20s into round 2.
  await expect(page.getByText('Round 2 / 10')).toBeVisible();
  await expect(timer(page)).toHaveText(/^0:(40|39)$/);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
