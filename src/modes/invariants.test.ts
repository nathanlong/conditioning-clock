import { describe, expect, test } from 'vitest';
import type { ModeConfig, ModeDefinition, Program } from '../core/types';
import { COMMON_DEFAULTS } from './common';
import { modeList } from './index';

/** Every number field at its min (or max), every toggle on. */
function extreme(
  mode: ModeDefinition<ModeConfig>,
  end: 'min' | 'max',
): ModeConfig {
  const config: ModeConfig = { ...mode.defaults };
  for (const field of mode.fields) {
    config[field.key] = field.kind === 'toggle' ? true : field[end]!;
  }
  return config;
}

function checkInvariants(program: Program) {
  const { segments, cues } = program;
  expect(segments[0]!.startMs).toBe(0);
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    expect(prev.startMs + prev.durationMs).toBe(segments[i]!.startMs);
  }
  const last = segments.at(-1)!;
  expect(program.totalMs).toBe(last.startMs + last.durationMs);
  expect(program.leadInMs).toBe(
    segments[0]!.kind === 'leadIn' ? segments[0]!.durationMs : 0,
  );

  for (let i = 1; i < cues.length; i++) {
    expect(cues[i]!.atMs - cues[i - 1]!.atMs).toBeGreaterThanOrEqual(250);
  }
  for (const cue of cues) {
    expect(cue.atMs).toBeGreaterThanOrEqual(0);
    expect(cue.atMs).toBeLessThanOrEqual(program.totalMs);
  }
  if (Number.isFinite(program.totalMs)) {
    expect(cues.at(-1)).toEqual({ atMs: program.totalMs, sound: 'finish' });
    expect(cues.filter((c) => c.sound === 'finish')).toHaveLength(1);
  } else {
    expect(cues.some((c) => c.sound === 'finish')).toBe(false);
  }
  // Every work/rest segment after the first is announced by its own sound.
  for (const segment of segments.slice(1)) {
    const sound = segment.kind === 'work' ? 'go' : 'rest';
    expect(cues).toContainEqual({ atMs: segment.startMs, sound });
  }
}

const cases = modeList.flatMap((mode) =>
  (['defaults', 'min', 'max'] as const).flatMap((variant) =>
    [0, 3, 10, 30].map((leadInSec) => ({
      mode,
      variant,
      leadInSec,
      config: variant === 'defaults' ? mode.defaults : extreme(mode, variant),
    })),
  ),
);

describe.each(cases)(
  '$mode.id with $variant config and a $leadInSec s lead-in',
  ({ mode, config, leadInSec }) => {
    test('is valid', () => {
      expect(mode.validate(config)).toEqual([]);
    });

    test('builds a program that holds every invariant', () => {
      checkInvariants(mode.build(config, { ...COMMON_DEFAULTS, leadInSec }));
    });
  },
);

test.each(modeList)('$id plays go at time 0 with the lead-in off', (mode) => {
  const program = mode.build(mode.defaults, {
    ...COMMON_DEFAULTS,
    leadInSec: 0,
  });
  expect(program.cues[0]).toEqual({ atMs: 0, sound: 'go' });
  expect(program.segments[0]!.kind).toBe('work');
});

test.each(modeList)('$id rejects values outside its field ranges', (mode) => {
  const number =
    mode.fields.find((f) => f.kind === 'number' && !f.enabledBy) ??
    mode.fields.find((f) => f.kind === 'number')!;
  const config = { ...extreme(mode, 'max'), [number.key]: number.max! + 1 };
  expect(mode.validate(config)).toContainEqual({
    field: number.key,
    message: expect.stringContaining('between'),
  });
});
