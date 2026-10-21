import { expect, type Page } from '@playwright/test';

/** Installs the fake clock, records console errors and failed requests, and loads the app. */
export async function openApp(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`failed: ${req.url()}`));
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`${res.status()}: ${res.url()}`);
  });
  await page.clock.install();
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'Conditioning Clock' }),
  ).toBeVisible();
  return { problems };
}

export async function chooseMode(page: Page, name: string) {
  await page.getByRole('radio', { name }).check();
}

/** Setup's Start, which opens the run view idle. */
export async function openRun(page: Page) {
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(status(page)).toHaveText('Ready');
}

/**
 * Moves the fake clock forward by exactly `ms`. Running every animation
 * frame through the fake clock is slow, so most of the time is jumped
 * (firing due timers once) and only the end is run frame by frame.
 */
export async function advance(page: Page, ms: number) {
  const rendered = Math.min(ms, 50);
  if (ms > rendered) await page.clock.fastForward(ms - rendered);
  await page.clock.runFor(rendered);
}

/** The visible state label: Ready, Get Ready, Work, Rest, Paused, Done. */
export const status = (page: Page) => page.locator('.status');

export const dial = (page: Page) => page.locator('.dial');
export const timer = (page: Page) => page.getByRole('timer');
