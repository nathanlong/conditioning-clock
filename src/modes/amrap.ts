import type { Cue, FieldSpec, ModeDefinition } from '../core/types';
import { assemble, validateFields } from './builders';

export interface AmrapConfig {
  [key: string]: number | boolean;
  durationMin: number;
  repGoalEnabled: boolean;
  repGoal: number;
}

/** Pace cues need room to be heard as separate beats. */
export const MIN_PACE_INTERVAL_MS = 3000;

/** Past this many divisions, ticks would blur into a solid band. */
export const MAX_PACE_TICKS = 60;

const fields: FieldSpec<AmrapConfig>[] = [
  {
    key: 'durationMin',
    label: 'Duration',
    unit: 'minutes',
    kind: 'number',
    min: 1,
    max: 90,
    step: 1,
  },
  { key: 'repGoalEnabled', label: 'Rounds (reps) goal', kind: 'toggle' },
  {
    key: 'repGoal',
    label: 'Target rounds (reps)',
    kind: 'number',
    min: 1,
    max: 500,
    step: 1,
    enabledBy: 'repGoalEnabled',
  },
];

export const amrap: ModeDefinition<AmrapConfig> = {
  id: 'amrap',
  name: 'AMRAP',
  description:
    'As many rounds as possible, with an optional pace cue per round (rep).',
  fields,
  defaults: { durationMin: 12, repGoalEnabled: false, repGoal: 4 },
  validate(config) {
    const errors = validateFields(fields, config);
    if (errors.length === 0 && config.repGoalEnabled) {
      const intervalMs = (config.durationMin * 60_000) / config.repGoal;
      if (intervalMs < MIN_PACE_INTERVAL_MS) {
        const max = Math.floor(
          (config.durationMin * 60_000) / MIN_PACE_INTERVAL_MS,
        );
        errors.push({
          field: 'repGoal',
          message: `Target rounds (reps) can be at most ${max} for ${config.durationMin} minutes (one every 3 seconds).`,
        });
      }
    }
    return errors;
  },
  build(config, common) {
    const durationMs = config.durationMin * 60_000;
    const pace = config.repGoalEnabled
      ? { intervalMs: durationMs / config.repGoal, repGoal: config.repGoal }
      : undefined;
    return assemble({
      modeId: 'amrap',
      common,
      body: (startMs) => [
        { kind: 'work', startMs, durationMs, direction: 'down' },
      ],
      extraCues: (boundary, leadInMs) => {
        if (!pace) return [];
        const cues: Cue[] = [];
        for (let rep = 1; rep <= pace.repGoal; rep++) {
          const atMs = leadInMs + rep * pace.intervalMs;
          // Keep the 3-2-1 and finish clear of pace blips.
          const crowded = boundary.some((b) => Math.abs(b.atMs - atMs) < 1000);
          if (!crowded) cues.push({ atMs, sound: 'pace' });
        }
        return cues;
      },
      pace,
      display: {
        primaryRing: 'segment',
        overallRing: false,
        // Each pace division on the main ring.
        ...(pace && pace.repGoal <= MAX_PACE_TICKS
          ? {
              ticks: {
                ring: 'main' as const,
                atMs: Array.from(
                  { length: pace.repGoal - 1 },
                  (_, i) => (i + 1) * pace.intervalMs,
                ),
              },
            }
          : {}),
      },
    });
  },
};
