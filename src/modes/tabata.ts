import type { FieldSpec, ModeDefinition } from '../core/types';
import { assemble, intervals, validateFields } from './builders';

export interface TabataConfig {
  [key: string]: number | boolean;
  workSec: number;
  restSec: number;
  rounds: number;
}

// A 5s minimum keeps the 3-2-1 countdowns from overlapping.
const fields: FieldSpec<TabataConfig>[] = [
  {
    key: 'workSec',
    label: 'Work',
    unit: 'seconds',
    kind: 'number',
    min: 5,
    max: 300,
    step: 1,
  },
  {
    key: 'restSec',
    label: 'Rest',
    unit: 'seconds',
    kind: 'number',
    min: 5,
    max: 300,
    step: 1,
  },
  { key: 'rounds', label: 'Rounds', kind: 'number', min: 1, max: 50, step: 1 },
];

export const tabata: ModeDefinition<TabataConfig> = {
  id: 'tabata',
  name: 'Tabata',
  description:
    'Alternating work and rest intervals, 20 on and 10 off by default.',
  fields,
  defaults: { workSec: 20, restSec: 10, rounds: 8 },
  validate: (config) => validateFields(fields, config),
  build: (config, common) =>
    assemble({
      modeId: 'tabata',
      common,
      body: (startMs) =>
        intervals({
          count: config.rounds,
          workMs: config.workSec * 1000,
          restMs: config.restSec * 1000,
          startMs,
        }),
      display: {
        primaryRing: 'segment',
        overallRing: true,
        // Each new round's start on the overall ring.
        ticks: {
          ring: 'overall',
          atMs: Array.from(
            { length: config.rounds - 1 },
            (_, i) => (i + 1) * (config.workSec + config.restSec) * 1000,
          ),
        },
      },
    }),
};
