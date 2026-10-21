import type { FieldSpec, ModeDefinition } from '../core/types';
import { assemble, validateFields } from './builders';

export interface ForTimeConfig {
  [key: string]: number | boolean;
  capEnabled: boolean;
  capMin: number;
}

const fields: FieldSpec<ForTimeConfig>[] = [
  { key: 'capEnabled', label: 'Time cap', kind: 'toggle' },
  {
    key: 'capMin',
    label: 'Cap',
    unit: 'minutes',
    kind: 'number',
    min: 1,
    max: 120,
    step: 1,
    enabledBy: 'capEnabled',
  },
];

export const forTime: ModeDefinition<ForTimeConfig> = {
  id: 'forTime',
  name: 'For Time',
  description:
    'A stopwatch that counts up until you tap Done, with an optional cap.',
  fields,
  defaults: { capEnabled: false, capMin: 20 },
  validate: (config) => validateFields(fields, config),
  build(config, common) {
    const durationMs = config.capEnabled ? config.capMin * 60_000 : Infinity;
    return assemble({
      modeId: 'forTime',
      common,
      body: (startMs) => [
        { kind: 'work', startMs, durationMs, direction: 'up' },
      ],
      display: { primaryRing: 'minute', overallRing: config.capEnabled },
    });
  },
};
