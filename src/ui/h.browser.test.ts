import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../test/browserSetup';
import { h, setText } from './h';

test('builds real DOM that is found by role and name', async () => {
  let clicks = 0;
  mount(h('button', { type: 'button', onclick: () => clicks++ }, 'Go'));
  await userEvent.click(page.getByRole('button', { name: 'Go' }));
  expect(clicks).toBe(1);
});

test('skips false and null attributes and children', () => {
  const el = h(
    'p',
    { hidden: false, title: null, 'data-x': 1 },
    'a',
    null,
    false,
    'b',
  );
  expect(el.hasAttribute('hidden')).toBe(false);
  expect(el.hasAttribute('title')).toBe(false);
  expect(el.dataset.x).toBe('1');
  expect(el.textContent).toBe('ab');
});

test('setText writes only on change', () => {
  const el = h('p', null, 'same');
  const node = el.firstChild;
  setText(el, 'same');
  expect(el.firstChild).toBe(node);
  setText(el, 'new');
  expect(el.textContent).toBe('new');
});
