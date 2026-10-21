import { h } from './h';

export interface ConfirmDialog {
  el: HTMLDialogElement;
  /** Resolves true on confirm; false on cancel or Esc. */
  open(returnFocusTo: HTMLElement): Promise<boolean>;
}

/** A native modal dialog: it traps focus and closes on Esc. */
export function createConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}): ConfirmDialog {
  const id = `dialog-${Math.random().toString(36).slice(2, 8)}`;
  const cancel = h(
    'button',
    { type: 'submit', value: 'cancel', class: 'button' },
    cancelLabel,
  );
  const el = h(
    'dialog',
    {
      class: 'dialog',
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-message`,
    },
    h(
      'form',
      { method: 'dialog' },
      h('h2', { id: `${id}-title` }, title),
      h('p', { id: `${id}-message` }, message),
      h(
        'div',
        { class: 'dialog-actions' },
        cancel,
        h(
          'button',
          { type: 'submit', value: 'confirm', class: 'button danger' },
          confirmLabel,
        ),
      ),
    ),
  );

  return {
    el,
    open(returnFocusTo) {
      el.returnValue = '';
      el.showModal();
      cancel.focus();
      return new Promise((resolve) => {
        el.addEventListener(
          'close',
          () => {
            const confirmed = el.returnValue === 'confirm';
            if (!confirmed) returnFocusTo.focus();
            resolve(confirmed);
          },
          { once: true },
        );
      });
    },
  };
}
