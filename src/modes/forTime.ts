import type { FieldSpec, ModeDefinition } from '../core/types';
import { assemble, validateFields } from './builders';

export interface ForTimeConfig {
  [key: string]: number | boolean;
  goalEnabled: boolean;
  goalMin: number;
}

const fields: FieldSpec<ForTimeConfig>[] = [
  { key: 'goalEnabled', label: 'Time goal', kind: 'toggle' },
  {
    key: 'goalMin',
    label: 'Goal',
    unit: 'minutes',
    kind: 'number',
    min: 1,
    max: 120,
    step: 1,
    enabledBy: 'goalEnabled',
  },
];

export const forTime: ModeDefinition<ForTimeConfig> = {
  id: 'forTime',
  name: 'For Time',
  description:
    'A stopwatch that counts up until you tap Done, with an optional time goal.',
  fields,
  defaults: { goalEnabled: false, goalMin: 20 },
  validate: (config) => validateFields(fields, config),
  build(config, common) {
    // A goal is something to beat, not an end: the clock runs until Done.
    const goalMs = config.goalEnabled ? config.goalMin * 60_000 : undefined;
    const program = assemble({
      modeId: 'forTime',
      common,
      body: (startMs) => [
        { kind: 'work', startMs, durationMs: Infinity, direction: 'up' },
      ],
      extraCues: (_, leadInMs) =>
        goalMs === undefined
          ? []
          : [{ atMs: leadInMs + goalMs, sound: 'pace' }],
      display: { primaryRing: 'minute', overallRing: goalMs !== undefined },
    });
    return goalMs === undefined ? program : { ...program, goalMs };
  },
};
