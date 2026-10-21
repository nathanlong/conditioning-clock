import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advance, chooseMode, openApp, openRun, status } from './helpers';

async function scan(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations in ${state}`).toEqual([]);
}

test('setup view', async ({ page }) => {
  await openApp(page);
  await scan(page, 'setup');
  await page.getByText('Settings', { exact: true }).click();
  await chooseMode(page, 'AMRAP');
  await page.getByRole('checkbox', { name: 'Rounds (reps) goal' }).check();
  await scan(page, 'setup with everything open');
  await page
    .getByRole('spinbutton', { name: 'Target rounds (reps)' })
    .fill('9999');
  await page.getByRole('button', { name: 'Start' }).click();
  await scan(page, 'setup with an error');
});

test('run view in every state', async ({ page }) => {
  await openApp(page);
  await chooseMode(page, 'Tabata');
  await openRun(page);
  await scan(page, 'idle');
  await page.getByRole('button', { name: 'Start' }).click();
  await advance(page, 15_000);
  await scan(page, 'work');
  await advance(page, 20_000);
  await expect(page.locator('.dial')).toHaveAttribute('data-tone', 'rest');
  await scan(page, 'rest');
  await page.getByRole('button', { name: 'Pause' }).click();
  await scan(page, 'paused');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan(page, 'reset dialog');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await advance(page, 240_000);
  await expect(status(page)).toHaveText('Done');
  await scan(page, 'finished');
});

test('recovery overlay', async ({ page }) => {
  await openApp(page);
  await chooseMode(page, 'EMOM');
  await openRun(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await advance(page, 20_000);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Tap to resume sound' }),
  ).toBeVisible();
  await scan(page, 'recovery overlay');
});
