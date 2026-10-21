type Child = Node | string | null | undefined | false;
type Attrs = Record<
  string,
  string | number | boolean | null | undefined | EventListener
>;

function apply(
  el: Element,
  attrs: Attrs | null | undefined,
  children: Child[],
) {
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (value !== false && value !== null && value !== undefined) {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false)
      el.append(child);
  }
}

/** Builds an element: attributes, `on*` listeners, then children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs, children);
  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  apply(el, attrs, children);
  return el;
}

/** Writes text only when it changed. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
