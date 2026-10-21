import { expect, test } from '@playwright/test';
import { advance, openApp, status } from './helpers';

test('keyboard only: pick a mode, set a value, start, pause', async ({
  page,
  browserName,
}) => {
  await openApp(page);
  const kb = page.keyboard;
  // Safari only tabs to every control with Option+Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  // First stop is the mode group; arrows move between modes.
  await kb.press(tab);
  await expect(page.getByRole('radio', { name: 'EMOM' })).toBeFocused();
  await kb.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'ETOT' })).toBeChecked();

  // Into the Rounds field: past the − stepper.
  await kb.press(tab);
  await kb.press(tab);
  const rounds = page.getByRole('spinbutton', { name: 'Rounds' });
  await expect(rounds).toBeFocused();
  await kb.press('ControlOrMeta+A');
  await kb.type('6');
  await kb.press('Enter');

  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByText('Round 1 / 6')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
  await kb.press('Space');
  await expect(status(page)).toHaveText('Get Ready');
  await advance(page, 2_000);
  await kb.press('Space');
  await expect(status(page)).toHaveText('Paused');
  await kb.press('r');
  await expect(
    page.getByRole('dialog', { name: 'Reset the workout?' }),
  ).toBeVisible();
  await kb.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reset' })).toBeFocused();
});
