import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { COMMON_DEFAULTS } from '../modes/common';
import { modeList, modes } from '../modes/index';
import { mount } from '../test/browserSetup';
import { createSetupView } from './setupView';

function setup(
  initialModeId: 'emom' | 'tabata' | 'amrap' | 'forTime' = 'tabata',
) {
  const onStart = vi.fn();
  const view = createSetupView({
    modes: modeList,
    initialModeId,
    loadConfig: (id) => ({ ...modes[id].defaults }),
    common: COMMON_DEFAULTS,
    onStart,
  });
  mount(view.el);
  return { view, onStart };
}

describe('setup view', () => {
  test('the mode picker is a radio group with descriptions', async () => {
    setup();
    await expect
      .element(page.getByRole('group', { name: 'Mode' }))
      .toBeVisible();
    const tabata = page.getByRole('radio', { name: 'Tabata' });
    await expect.element(tabata).toBeChecked();
    await expect
      .element(tabata)
      .toHaveAccessibleDescription(modes.tabata.description);
  });

  test('focus() focuses the checked mode', async () => {
    const { view } = setup();
    view.focus();
    await expect
      .element(page.getByRole('radio', { name: 'Tabata' }))
      .toHaveFocus();
  });

  test('shows the derived workout time', async () => {
    setup();
    await expect
      .element(page.getByText('3:50 (+0:10 get ready)'))
      .toBeVisible();
    await userEvent.click(page.getByRole('radio', { name: 'ETOT' }));
    await expect
      .element(page.getByText('10:00 (+0:10 get ready)'))
      .toBeVisible();
    await userEvent.click(page.getByRole('radio', { name: 'For Time' }));
    await expect
      .element(page.getByText('Open-ended (+0:10 get ready)'))
      .toBeVisible();
  });

  test('switching modes swaps the settings form and keeps edits', async () => {
    setup();
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Rounds' }), '3');
    await userEvent.click(page.getByRole('radio', { name: 'AMRAP' }));
    await expect
      .element(page.getByRole('spinbutton', { name: 'Duration (minutes)' }))
      .toBeVisible();
    await userEvent.click(page.getByRole('radio', { name: 'Tabata' }));
    await expect
      .element(page.getByRole('spinbutton', { name: 'Rounds' }))
      .toHaveValue(3);
  });

  test('Start passes the mode, config and common settings', async () => {
    const { onStart } = setup();
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledWith(
      'tabata',
      { workSec: 20, restSec: 10, rounds: 8 },
      COMMON_DEFAULTS,
    );
  });

  test('Start with errors focuses the first invalid field and does not start', async () => {
    const { onStart } = setup();
    await userEvent.fill(
      page.getByRole('spinbutton', { name: 'Rest (seconds)' }),
      '1',
    );
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Rounds' }), '');
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(onStart).not.toHaveBeenCalled();
    const rest = page.getByRole('spinbutton', { name: 'Rest (seconds)' });
    await expect.element(rest).toHaveFocus();
    await expect
      .element(rest)
      .toHaveAccessibleDescription('Rest must be between 5 and 300.');
    await expect
      .element(page.getByRole('spinbutton', { name: 'Rounds' }))
      .toHaveAttribute('aria-invalid', 'true');
  });

  test('an invalid common setting opens Settings and focuses it', async () => {
    const { onStart } = setup();
    await userEvent.click(page.getByText('Settings', { exact: true }));
    await userEvent.fill(
      page.getByRole('spinbutton', { name: 'Get ready (seconds)' }),
      '99',
    );
    await userEvent.click(page.getByText('Settings', { exact: true }));
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(onStart).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole('spinbutton', { name: 'Get ready (seconds)' }))
      .toHaveFocus();
  });

  test('common settings include volume and mute', async () => {
    const { onStart } = setup();
    await userEvent.click(page.getByText('Settings', { exact: true }));
    await expect
      .element(page.getByRole('slider', { name: 'Volume' }))
      .toHaveAttribute('aria-valuetext', '80%');
    await userEvent.click(page.getByRole('checkbox', { name: 'Mute sound' }));
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(onStart.mock.calls[0]![2]).toEqual({
      ...COMMON_DEFAULTS,
      muted: true,
    });
  });
});
