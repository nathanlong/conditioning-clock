import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { modes } from '../modes/index';
import { mount } from '../test/browserSetup';
import { createSettingsForm } from './settingsForm';

function tabataForm(initial = modes.tabata.defaults) {
  const form = createSettingsForm(
    modes.tabata.fields,
    { ...initial },
    { idPrefix: 'tabata' },
  );
  mount(form.el);
  return form;
}

describe('settings form', () => {
  test('every field has a label that includes its unit', async () => {
    tabataForm();
    await expect
      .element(page.getByRole('spinbutton', { name: 'Work (seconds)' }))
      .toHaveValue(20);
    await expect
      .element(page.getByRole('spinbutton', { name: 'Rest (seconds)' }))
      .toHaveValue(10);
    await expect
      .element(page.getByRole('spinbutton', { name: 'Rounds' }))
      .toHaveValue(8);
  });

  test('number inputs are numeric with native limits', async () => {
    tabataForm();
    const input = page.getByRole('spinbutton', { name: 'Work (seconds)' });
    await expect.element(input).toHaveAttribute('inputmode', 'numeric');
    await expect.element(input).toHaveAttribute('min', '5');
    await expect.element(input).toHaveAttribute('max', '300');
  });

  test('steppers have descriptive names and step the value', async () => {
    const form = tabataForm();
    await userEvent.click(
      page.getByRole('button', { name: 'Increase rounds' }),
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Increase rounds' }),
    );
    await userEvent.click(page.getByRole('button', { name: 'Decrease work' }));
    expect(form.values()).toEqual({ workSec: 19, restSec: 10, rounds: 10 });
  });

  test('steppers clamp at min and max', async () => {
    const form = tabataForm({ workSec: 5, restSec: 300, rounds: 8 });
    await userEvent.click(page.getByRole('button', { name: 'Decrease work' }));
    await userEvent.click(page.getByRole('button', { name: 'Increase rest' }));
    expect(form.values()).toMatchObject({ workSec: 5, restSec: 300 });
  });

  test('an empty number reads as NaN', async () => {
    const form = tabataForm();
    await userEvent.clear(page.getByRole('spinbutton', { name: 'Rounds' }));
    expect(form.values().rounds).toBeNaN();
  });

  test('errors set aria-invalid and are linked with aria-describedby', async () => {
    const form = tabataForm();
    form.setErrors([
      { field: 'rounds', message: 'Rounds must be between 1 and 50.' },
    ]);
    const rounds = page.getByRole('spinbutton', { name: 'Rounds' });
    await expect.element(rounds).toHaveAttribute('aria-invalid', 'true');
    await expect
      .element(rounds)
      .toHaveAccessibleDescription('Rounds must be between 1 and 50.');
    await expect
      .element(page.getByRole('spinbutton', { name: 'Work (seconds)' }))
      .not.toHaveAttribute('aria-invalid');
    expect(form.focusFirstInvalid()).toBe(true);
    await expect.element(rounds).toHaveFocus();
  });

  test('editing a field clears its error', async () => {
    const form = tabataForm();
    form.setErrors([{ field: 'rounds', message: 'Bad' }]);
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Rounds' }), '4');
    await expect
      .element(page.getByRole('spinbutton', { name: 'Rounds' }))
      .not.toHaveAttribute('aria-invalid');
  });

  test('a toggle reveals the field it enables', async () => {
    const form = createSettingsForm(
      modes.forTime.fields,
      { ...modes.forTime.defaults },
      { idPrefix: 'ft' },
    );
    mount(form.el);
    await expect
      .element(page.getByRole('spinbutton', { name: 'Cap (minutes)' }))
      .not.toBeInTheDocument();
    await userEvent.click(page.getByRole('checkbox', { name: 'Time cap' }));
    await expect
      .element(page.getByRole('spinbutton', { name: 'Cap (minutes)' }))
      .toBeVisible();
    expect(form.values()).toEqual({ capEnabled: true, capMin: 20 });
  });
});
