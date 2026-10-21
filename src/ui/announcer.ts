import { h } from './h';

export interface Announcer {
  el: HTMLElement;
  announce(text: string): void;
}

/** A visually hidden, polite live region. */
export function createAnnouncer(): Announcer {
  const el = h('div', {
    role: 'status',
    'aria-live': 'polite',
    class: 'visually-hidden',
  });
  let toggle = false;
  return {
    el,
    announce(text) {
      // A trailing non-breaking space makes repeats count as a change.
      toggle = !toggle;
      el.textContent = toggle ? text : `${text} `;
    },
  };
}
