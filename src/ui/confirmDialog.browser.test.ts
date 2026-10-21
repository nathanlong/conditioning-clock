import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../test/browserSetup';
import { createConfirmDialog } from './confirmDialog';
import { h } from './h';

function setup() {
  const dialog = createConfirmDialog({
    title: 'Delete it?',
    message: 'For real.',
    confirmLabel: 'Delete',
  });
  const opener = h('button', { type: 'button' }, 'Open');
  mount(h('div', null, opener, dialog.el));
  return { dialog, opener };
}

test('is a modal dialog named by its title and described by its message', async () => {
  const { dialog, opener } = setup();
  void dialog.open(opener);
  const el = page.getByRole('dialog', { name: 'Delete it?' });
  await expect.element(el).toBeVisible();
  await expect.element(el).toHaveAccessibleDescription('For real.');
  expect(dialog.el.matches(':modal')).toBe(true);
});

test('resolves true on confirm', async () => {
  const { dialog, opener } = setup();
  const result = dialog.open(opener);
  await userEvent.click(page.getByRole('button', { name: 'Delete' }));
  await expect(result).resolves.toBe(true);
});

test('resolves false on cancel and returns focus', async () => {
  const { dialog, opener } = setup();
  const result = dialog.open(opener);
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  await expect(result).resolves.toBe(false);
  await expect
    .element(page.getByRole('button', { name: 'Open' }))
    .toHaveFocus();
});

test('Esc cancels', async () => {
  const { dialog, opener } = setup();
  const result = dialog.open(opener);
  await userEvent.keyboard('{Escape}');
  await expect(result).resolves.toBe(false);
});
