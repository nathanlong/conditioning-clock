import type {
  CommonConfig,
  ModeConfig,
  ModeDefinition,
  ModeId,
  SoundId,
} from '../core/types';
import { validateFields } from '../modes/builders';
import { COMMON_FIELDS, type CommonFormConfig } from '../modes/common';
import { h } from './h';
import { APP_TITLE, workoutLength } from './labels';
import { createSettingsForm, type SettingsForm } from './settingsForm';

export interface SetupViewOptions {
  modes: ModeDefinition<any>[];
  initialModeId: ModeId;
  loadConfig(modeId: ModeId): ModeConfig;
  common: CommonConfig;
  onStart(modeId: ModeId, config: ModeConfig, common: CommonConfig): void;
  /** Dev only: plays each sound for tuning. */
  soundCheck?: (sound: SoundId, common: CommonConfig) => void;
}

export interface SetupView {
  el: HTMLElement;
  focus(): void;
  destroy(): void;
}

export function createSetupView(options: SetupViewOptions): SetupView {
  const { modes, common } = options;
  const byId = new Map(modes.map((m) => [m.id, m]));
  // Edits survive switching back and forth between modes.
  const drafts = new Map<ModeId, ModeConfig>();
  let modeId = byId.has(options.initialModeId)
    ? options.initialModeId
    : modes[0]!.id;
  let modeForm: SettingsForm<ModeConfig>;

  const radios = modes.map((mode) =>
    h('input', {
      type: 'radio',
      name: 'mode',
      value: mode.id,
      id: `mode-${mode.id}`,
      'aria-labelledby': `mode-${mode.id}-name`,
      'aria-describedby': `mode-${mode.id}-desc`,
      onchange: () => selectMode(mode.id),
    }),
  );
  const picker = h(
    'fieldset',
    { class: 'modes' },
    h('legend', null, 'Mode'),
    ...modes.map((mode, i) =>
      h(
        'label',
        { class: 'mode-option' },
        radios[i]!,
        h(
          'span',
          { class: 'mode-name', id: `mode-${mode.id}-name` },
          mode.name,
        ),
        h(
          'span',
          { class: 'mode-desc', id: `mode-${mode.id}-desc` },
          mode.description,
        ),
      ),
    ),
  );

  const modeHeading = h('h2', { id: 'mode-settings-title' });
  const modeFields = h('div');
  const length = h('output', { name: 'length', 'aria-live': 'polite' });
  const commonForm = createSettingsForm<CommonFormConfig>(
    COMMON_FIELDS,
    { ...common },
    {
      idPrefix: 'common',
      onChange: () => updateLength(),
    },
  );
  const details = h(
    'details',
    { class: 'common' },
    h('summary', null, 'Settings'),
    commonForm.el,
  );

  const form = h(
    'form',
    {
      class: 'setup-form',
      novalidate: true,
      onsubmit: (e: Event) => submit(e),
    },
    picker,
    h(
      'section',
      { class: 'mode-settings', 'aria-labelledby': 'mode-settings-title' },
      modeHeading,
      modeFields,
      h('p', { class: 'length' }, h('span', null, 'Workout: '), length),
    ),
    details,
    h('button', { type: 'submit', class: 'button primary start' }, 'Start'),
  );

  const soundCheck = options.soundCheck
    ? h(
        'details',
        { class: 'sound-check' },
        h('summary', null, 'Sound check (dev)'),
        ...(['tick', 'go', 'rest', 'pace', 'finish'] as const).map((sound) =>
          h(
            'button',
            {
              type: 'button',
              class: 'button',
              onclick: () => options.soundCheck!(sound, commonForm.values()),
            },
            `Play ${sound}`,
          ),
        ),
      )
    : null;

  const el = h(
    'main',
    { class: 'setup' },
    h('h1', null, APP_TITLE),
    form,
    soundCheck,
  );

  function selectMode(id: ModeId) {
    if (modeForm) drafts.set(modeId, modeForm.values());
    modeId = id;
    const mode = byId.get(id)!;
    radios.forEach((r) => (r.checked = r.value === id));
    modeHeading.textContent = `${mode.name} settings`;
    modeForm = createSettingsForm(
      mode.fields,
      drafts.get(id) ?? options.loadConfig(id),
      {
        idPrefix: id,
        onChange: () => updateLength(),
      },
    );
    modeFields.replaceChildren(modeForm.el);
    updateLength();
  }

  function updateLength() {
    const mode = byId.get(modeId)!;
    const config = modeForm.values();
    const commonValues = commonForm.values();
    const valid =
      mode.validate(config).length === 0 &&
      validateFields(COMMON_FIELDS, commonValues).length === 0;
    length.textContent = valid
      ? workoutLength(mode.build(config, commonValues))
      : '—';
    length.htmlFor.value = [...modeForm.inputIds, ...commonForm.inputIds].join(
      ' ',
    );
  }

  function submit(event: Event) {
    event.preventDefault();
    const mode = byId.get(modeId)!;
    const config = modeForm.values();
    const commonValues = commonForm.values();
    const modeErrors = mode.validate(config);
    const commonErrors = validateFields(COMMON_FIELDS, commonValues);
    modeForm.setErrors(modeErrors);
    commonForm.setErrors(commonErrors);
    if (modeErrors.length > 0) {
      modeForm.focusFirstInvalid();
      return;
    }
    if (commonErrors.length > 0) {
      details.open = true;
      commonForm.focusFirstInvalid();
      return;
    }
    options.onStart(modeId, config, commonValues);
  }

  selectMode(modeId);

  return {
    el,
    focus: () => radios.find((r) => r.checked)?.focus(),
    destroy: () => el.remove(),
  };
}
