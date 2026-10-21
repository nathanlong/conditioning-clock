import { expect, test } from '@playwright/test';
import { chooseMode, openApp, openRun } from './helpers';

test('changed Tabata settings persist across a reload', async ({ page }) => {
  await openApp(page);
  await chooseMode(page, 'Tabata');
  await page.getByRole('spinbutton', { name: 'Work (seconds)' }).fill('40');
  await page.getByRole('button', { name: 'Increase rounds' }).click();
  await openRun(page);

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Tabata' })).toBeChecked();
  await expect(
    page.getByRole('spinbutton', { name: 'Work (seconds)' }),
  ).toHaveValue('40');
  await expect(page.getByRole('spinbutton', { name: 'Rounds' })).toHaveValue(
    '9',
  );
});
