import type { FieldSpec, ModeConfig, ValidationError } from '../core/types';
import { isFieldEnabled } from '../modes/builders';
import { h } from './h';

export interface SettingsForm<C extends ModeConfig> {
  el: HTMLElement;
  /** Current values; an empty or unparsable number is NaN. */
  values(): C;
  /** The ids of every input, for an <output for="…">. */
  inputIds: string[];
  setErrors(errors: ValidationError<C>[]): void;
  /** Focuses the first field with an error; false if there is none. */
  focusFirstInvalid(): boolean;
}

interface FieldControl {
  field: FieldSpec<ModeConfig>;
  wrapper: HTMLElement;
  input: HTMLInputElement;
  error: HTMLElement | null;
  read(): number | boolean;
}

export function fieldLabel(field: FieldSpec<ModeConfig>): string {
  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

function numberField(
  field: FieldSpec<ModeConfig>,
  id: string,
  value: number,
  onChange: () => void,
): FieldControl {
  const errorId = `${id}-error`;
  const input = h('input', {
    id,
    type: 'number',
    inputmode: 'numeric',
    min: field.min,
    max: field.max,
    step: field.step ?? 1,
    value,
    'aria-describedby': errorId,
    oninput: onChange,
  });
  const read = () => (input.value.trim() === '' ? NaN : Number(input.value));
  const { min = -Infinity, max = Infinity, step = 1 } = field;
  const stepBy = (delta: number) => {
    const current = read();
    const next = Number.isFinite(current)
      ? Math.round(current) + delta
      : delta > 0
        ? min
        : max;
    input.value = String(Math.min(max, Math.max(min, next)));
    onChange();
  };
  const name = field.label.toLowerCase();
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const wrapper = h(
    'div',
    { class: 'field number-field' },
    h('label', { for: id }, fieldLabel(field)),
    h(
      'div',
      { class: 'stepper' },
      h(
        'button',
        {
          type: 'button',
          class: 'step',
          'aria-label': `Decrease ${name}`,
          onclick: () => stepBy(-step),
        },
        '−',
      ),
      input,
      h(
        'button',
        {
          type: 'button',
          class: 'step',
          'aria-label': `Increase ${name}`,
          onclick: () => stepBy(step),
        },
        '+',
      ),
    ),
    error,
  );
  return { field, wrapper, input, error, read };
}

function toggleField(
  field: FieldSpec<ModeConfig>,
  id: string,
  value: boolean,
  onChange: () => void,
): FieldControl {
  const input = h('input', {
    id,
    type: 'checkbox',
    checked: value,
    onchange: onChange,
  });
  input.checked = value;
  const wrapper = h(
    'div',
    { class: 'field toggle-field' },
    input,
    h('label', { for: id }, fieldLabel(field)),
  );
  return { field, wrapper, input, error: null, read: () => input.checked };
}

function rangeField(
  field: FieldSpec<ModeConfig>,
  id: string,
  value: number,
  onChange: () => void,
): FieldControl {
  const percent = () => `${Math.round(Number(input.value) * 100)}%`;
  const shown = h('span', { class: 'range-value', 'aria-hidden': 'true' });
  const input = h('input', {
    id,
    type: 'range',
    min: field.min,
    max: field.max,
    step: field.step,
    value,
    oninput: () => {
      update();
      onChange();
    },
  });
  const update = () => {
    shown.textContent = percent();
    input.setAttribute('aria-valuetext', percent());
  };
  update();
  const wrapper = h(
    'div',
    { class: 'field range-field' },
    h('label', { for: id }, fieldLabel(field)),
    h('div', { class: 'range-row' }, input, shown),
  );
  return {
    field,
    wrapper,
    input,
    error: null,
    read: () => Number(input.value),
  };
}

/** One generic form for every mode, driven by its FieldSpecs. */
export function createSettingsForm<C extends ModeConfig>(
  fields: FieldSpec<C>[],
  initial: C,
  {
    idPrefix,
    onChange = () => {},
  }: { idPrefix: string; onChange?: () => void },
): SettingsForm<C> {
  const controls: FieldControl[] = [];
  const changed = () => {
    syncEnabled();
    onChange();
  };
  for (const spec of fields as FieldSpec<ModeConfig>[]) {
    const id = `${idPrefix}-${spec.key}`;
    const value = initial[spec.key]!;
    const control =
      spec.kind === 'toggle'
        ? toggleField(spec, id, value === true, changed)
        : spec.kind === 'range'
          ? rangeField(spec, id, Number(value), changed)
          : numberField(spec, id, Number(value), changed);
    // Editing a field clears its stale error.
    control.input.addEventListener('input', () => clearError(control));
    controls.push(control);
  }

  const values = () =>
    Object.fromEntries(controls.map((c) => [c.field.key, c.read()])) as C;

  const syncEnabled = () => {
    const current = values();
    for (const c of controls)
      c.wrapper.hidden = !isFieldEnabled(c.field, current);
  };
  syncEnabled();

  function clearError(c: FieldControl) {
    if (!c.error) return;
    c.error.hidden = true;
    c.error.textContent = '';
    c.input.removeAttribute('aria-invalid');
  }

  return {
    el: h(
      'div',
      { class: 'settings-fields' },
      ...controls.map((c) => c.wrapper),
    ),
    values,
    inputIds: controls.map((c) => c.input.id),
    setErrors(errors) {
      for (const c of controls) {
        const error = errors.find((e) => e.field === c.field.key);
        if (!error || !c.error) {
          clearError(c);
          continue;
        }
        c.error.textContent = error.message;
        c.error.hidden = false;
        c.input.setAttribute('aria-invalid', 'true');
      }
    },
    focusFirstInvalid() {
      const first = controls.find(
        (c) => c.input.getAttribute('aria-invalid') === 'true',
      );
      first?.input.focus();
      return Boolean(first);
    },
  };
}
