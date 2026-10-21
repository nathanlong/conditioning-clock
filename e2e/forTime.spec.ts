import { expect, test } from '@playwright/test';
import {
  advance,
  chooseMode,
  openApp,
  openRun,
  status,
  timer,
} from './helpers';

test('For Time counts up past a minute, wrapping the ring, and Done shows the final time', async ({
  page,
}) => {
  await openApp(page);
  await chooseMode(page, 'For Time');
  await openRun(page);
  await expect(timer(page)).toHaveText('0:00');
  await page.getByRole('button', { name: 'Start' }).click();

  await advance(page, 10_000 + 45_000);
  await expect(timer(page)).toHaveText('0:45');
  const fill = page.locator('.ring.main .fill');
  const offset = async () =>
    Number(await fill.getAttribute('stroke-dashoffset'));
  expect(await offset()).toBeLessThan(0.3);

  await advance(page, 30_000);
  await expect(timer(page)).toHaveText('1:15');
  // Wrapped: a quarter of the way around again.
  expect(await offset()).toBeGreaterThan(0.7);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(status(page)).toHaveText('Done');
  await advance(page, 10_000);
  await expect(timer(page)).toHaveText('1:15');
});

test('For Time with a goal plays on past it, and Done shows how far over', async ({
  page,
}) => {
  await openApp(page);
  await chooseMode(page, 'For Time');
  await page.getByRole('checkbox', { name: 'Time goal' }).check();
  await page.getByRole('spinbutton', { name: 'Goal (minutes)' }).fill('1');
  await openRun(page);
  await expect(page.getByText('Goal 1:00')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await advance(page, 10_000 + 75_000);
  await expect(timer(page)).toHaveText('1:15');
  await expect(page.getByText('Goal 1:00 · +0:15')).toBeVisible();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(status(page)).toHaveText('Done');
  await expect(timer(page)).toHaveText('1:15');
});
