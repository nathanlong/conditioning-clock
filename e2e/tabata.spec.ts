import { expect, test } from '@playwright/test';
import {
  advance,
  chooseMode,
  dial,
  openApp,
  openRun,
  status,
  timer,
} from './helpers';

test('a full Tabata run, from Ready to Done', async ({ page }) => {
  const { problems } = await openApp(page);
  await chooseMode(page, 'Tabata');
  await openRun(page);
  await expect(dial(page)).toHaveAttribute('data-tone', 'idle');
  await expect(timer(page)).toHaveText('0:20');

  await page.getByRole('button', { name: 'Start' }).click();
  await expect(status(page)).toHaveText('Get Ready');

  await advance(page, 10_000);
  await expect(status(page)).toHaveText('Work');
  await expect(dial(page)).toHaveAttribute('data-tone', 'work');
  await expect(page.getByText('Round 1 / 8')).toBeVisible();

  await advance(page, 20_000);
  await expect(status(page)).toHaveText('Rest');
  await expect(dial(page)).toHaveAttribute('data-tone', 'rest');

  await advance(page, 10_000);
  await expect(dial(page)).toHaveAttribute('data-tone', 'work');
  await expect(page.getByText('Round 2 / 8')).toBeVisible();

  // 3:50 of work and rest (no final rest), plus the 10s lead-in.
  await advance(page, 240_000 - 40_000 - 1_000);
  await expect(page.getByText('Round 8 / 8')).toBeVisible();
  await expect(timer(page)).toHaveText('0:01');
  await advance(page, 1_000);
  await expect(status(page)).toHaveText('Done');
  await expect(timer(page)).toHaveText('0:00');
  expect(problems).toEqual([]);
});
