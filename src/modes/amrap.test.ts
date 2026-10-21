import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';
import { amrap } from './amrap';
import { MAX_TICK_DIVISIONS } from './builders';

test('defaults: one 12-minute work segment, no pace cues', () => {
  expect(describeProgram(buildProgram('amrap'))).toMatchInlineSnapshot(`
    "0:00 leadIn 10s
    0:10 work 720s
    cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go, 12:07 tick, 12:08 tick, 12:09 tick, 12:10 finish"
  `);
});

test('with a rep goal, plays one pace cue per target rep', () => {
  expect(
    describeProgram(
      buildProgram('amrap', {
        durationMin: 1,
        repGoalEnabled: true,
        repGoal: 4,
      }),
    ),
  ).toMatchInlineSnapshot(`
    "0:00 leadIn 10s
    0:10 work 60s
    cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go, 0:25 pace, 0:40 pace, 0:55 pace, 1:07 tick, 1:08 tick, 1:09 tick, 1:10 finish"
  `);
});

test('pace interval is duration / rep goal', () => {
  const program = buildProgram('amrap', { repGoalEnabled: true, repGoal: 60 });
  expect(program.pace).toEqual({ intervalMs: 12_000, repGoal: 60 });
  const pace = program.cues.filter((c) => c.sound === 'pace');
  expect(pace[0]!.atMs).toBe(10_000 + 12_000);
  expect(pace[1]!.atMs - pace[0]!.atMs).toBe(12_000);
});

test('drops pace cues within 1s of the 3-2-1 or finish', () => {
  // One rep every 3s over a minute: reps 19 (57s) and 20 (60s) land on the final countdown.
  const program = buildProgram(
    'amrap',
    { durationMin: 1, repGoalEnabled: true, repGoal: 20 },
    { leadInSec: 0 },
  );
  const pace = program.cues
    .filter((c) => c.sound === 'pace')
    .map((c) => c.atMs);
  expect(pace).toHaveLength(18);
  expect(pace.at(-1)).toBe(54_000);
  const late = program.cues.filter((c) => c.atMs >= 56_000);
  expect(late.map((c) => c.sound)).toEqual(['tick', 'tick', 'tick', 'finish']);
});

test('has no overall ring', () => {
  expect(buildProgram('amrap').display.overallRing).toBe(false);
});

test('the goal is off by default, at 4 rounds (reps)', () => {
  expect(amrap.defaults).toMatchObject({ repGoalEnabled: false, repGoal: 4 });
});

test('ticks the main ring at the start and each pace division', () => {
  const program = buildProgram('amrap', { repGoalEnabled: true, repGoal: 4 });
  expect(program.display.ticks).toEqual({
    ring: 'main',
    at: [0, 0.25, 0.5, 0.75],
  });
});

test.each([
  ['the goal is off', { repGoalEnabled: false }],
  ['the goal is 1', { repGoalEnabled: true, repGoal: 1 }],
  [
    `there are more than ${MAX_TICK_DIVISIONS} divisions`,
    { repGoalEnabled: true, repGoal: MAX_TICK_DIVISIONS + 1 },
  ],
])('has no ticks when %s', (_, overrides) => {
  expect(buildProgram('amrap', overrides).display.ticks).toBeUndefined();
});

test.each([
  [12, 240, true],
  [12, 241, false],
  [1, 20, true],
  [1, 21, false],
])('%i minutes with %i reps is valid: %s', (durationMin, repGoal, valid) => {
  const errors = amrap.validate({ durationMin, repGoalEnabled: true, repGoal });
  expect(errors.length === 0).toBe(valid);
  if (!valid) expect(errors[0]!.field).toBe('repGoal');
});

test('ignores an out-of-range rep goal when the goal is off', () => {
  expect(
    amrap.validate({ durationMin: 1, repGoalEnabled: false, repGoal: 9999 }),
  ).toEqual([]);
});
