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

test('pause freezes the clock in red; resume continues from the same point', async ({
  page,
}) => {
  await openApp(page);
  await chooseMode(page, 'EMOM');
  await openRun(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await advance(page, 25_000);
  await expect(timer(page)).toHaveText('0:45');

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(status(page)).toHaveText('Paused');
  await expect(dial(page)).toHaveAttribute('data-tone', 'paused');
  await advance(page, 30_000);
  await expect(timer(page)).toHaveText('0:45');

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(dial(page)).toHaveAttribute('data-tone', 'work');
  await advance(page, 5_000);
  await expect(timer(page)).toHaveText('0:40');
});
