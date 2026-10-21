import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { mount } from '../test/browserSetup';
import { createAnnouncer } from './announcer';

test('is a polite, visually hidden status region', async () => {
  const announcer = mount(createAnnouncer().el);
  await expect.element(page.getByRole('status')).toBeInTheDocument();
  expect(announcer.getAttribute('aria-live')).toBe('polite');
  expect(announcer.getBoundingClientRect().width).toBeLessThanOrEqual(1);
});

test('announces text, and a repeat still changes the region', () => {
  const announcer = createAnnouncer();
  mount(announcer.el);
  announcer.announce('Resumed');
  const first = announcer.el.textContent;
  announcer.announce('Resumed');
  expect(announcer.el.textContent!.trim()).toBe('Resumed');
  expect(announcer.el.textContent).not.toBe(first);
});
