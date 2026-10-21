export interface ShortcutHandlers {
  space?: () => void;
  r?: () => void;
  escape?: () => void;
}

const TEXT_ENTRY = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Whether a global shortcut should leave this event alone. Form fields own
 * every key. A focused button owns Space and Enter, or Space would fire
 * twice. An open dialog owns the keyboard.
 */
export function ignoresShortcuts(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  if (target instanceof Element) {
    if (TEXT_ENTRY.has(target.tagName) || target.closest('dialog')) return true;
    if (
      target.tagName === 'BUTTON' &&
      (event.key === ' ' || event.key === 'Enter')
    )
      return true;
    if (target instanceof HTMLElement && target.isContentEditable) return true;
  }
  return document.querySelector('dialog[open]') !== null;
}

/** Single-key shortcuts: Space, R and Esc. Returns an unbind function. */
export function bindShortcuts(
  handlers: ShortcutHandlers,
  target: Document = document,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (ignoresShortcuts(event)) return;
    const handler =
      event.key === ' '
        ? handlers.space
        : event.key === 'r' || event.key === 'R'
          ? handlers.r
          : event.key === 'Escape'
            ? handlers.escape
            : undefined;
    if (!handler) return;
    event.preventDefault();
    handler();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
