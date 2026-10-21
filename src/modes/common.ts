import type { CommonConfig, FieldSpec, ModeConfig } from '../core/types';

export const COMMON_DEFAULTS: CommonConfig = {
  leadInSec: 10,
  volume: 0.8,
  muted: false,
};

/** CommonConfig as the generic settings form sees it. */
export type CommonFormConfig = CommonConfig & ModeConfig;

export const COMMON_FIELDS: FieldSpec<CommonFormConfig>[] = [
  {
    key: 'leadInSec',
    label: 'Get ready',
    unit: 'seconds',
    kind: 'number',
    min: 0,
    max: 30,
    step: 1,
  },
  { key: 'volume', label: 'Volume', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'muted', label: 'Mute sound', kind: 'toggle' },
];
