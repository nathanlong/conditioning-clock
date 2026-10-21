import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';

test('defaults: uncapped, counting up, no cues after the lead-in', () => {
  expect(describeProgram(buildProgram('forTime'))).toMatchInlineSnapshot(`
    "0:00 leadIn 10s
    0:10 work ∞ up
    cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go"
  `);
});

test('uncapped is open-ended', () => {
  const program = buildProgram('forTime');
  expect(program.totalMs).toBe(Infinity);
  expect(program.cues.every((c) => c.atMs <= program.leadInMs)).toBe(true);
  expect(program.display).toEqual({
    primaryRing: 'minute',
    overallRing: false,
  });
});

test('capped: 3-2-1 and finish at the cap, with an overall ring', () => {
  const program = buildProgram('forTime', { capEnabled: true, capMin: 20 });
  expect(program.totalMs).toBe(10_000 + 1_200_000);
  expect(program.cues.slice(-4)).toEqual([
    { atMs: 1_207_000, sound: 'tick' },
    { atMs: 1_208_000, sound: 'tick' },
    { atMs: 1_209_000, sound: 'tick' },
    { atMs: 1_210_000, sound: 'finish' },
  ]);
  expect(program.display.overallRing).toBe(true);
});
