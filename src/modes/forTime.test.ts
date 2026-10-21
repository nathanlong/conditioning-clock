import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';

test('defaults: no goal, counting up, no cues after the lead-in', () => {
  expect(describeProgram(buildProgram('forTime'))).toMatchInlineSnapshot(`
    "0:00 leadIn 10s
    0:10 work ∞ up
    cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go"
  `);
});

test('is open-ended without a goal', () => {
  const program = buildProgram('forTime');
  expect(program.totalMs).toBe(Infinity);
  expect(program.goalMs).toBeUndefined();
  expect(program.cues.every((c) => c.atMs <= program.leadInMs)).toBe(true);
  expect(program.display).toEqual({
    primaryRing: 'minute',
    overallRing: false,
  });
});

test('with a goal: still open-ended, with a pace cue at the goal and an overall ring', () => {
  const program = buildProgram('forTime', { goalEnabled: true, goalMin: 20 });
  expect(program.totalMs).toBe(Infinity);
  expect(program.goalMs).toBe(1_200_000);
  expect(program.cues.at(-1)).toEqual({ atMs: 1_210_000, sound: 'pace' });
  expect(program.cues.some((c) => c.sound === 'finish')).toBe(false);
  expect(program.display.overallRing).toBe(true);
});
