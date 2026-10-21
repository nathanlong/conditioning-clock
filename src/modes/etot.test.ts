import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';
import { MAX_TICK_DIVISIONS } from './builders';

test('rounds are 30s each', () => {
  expect(describeProgram(buildProgram('etot', { rounds: 3 })))
    .toMatchInlineSnapshot(`
      "0:00 leadIn 10s
      0:10 work R1/3 30s
      0:40 work R2/3 30s
      1:10 work R3/3 30s
      cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go, 0:35 tick, 0:36 tick, 0:37 tick, 0:38 tick, 0:39 tick, 0:40 go, 1:05 tick, 1:06 tick, 1:07 tick, 1:08 tick, 1:09 tick, 1:10 go, 1:35 tick, 1:36 tick, 1:37 tick, 1:38 tick, 1:39 tick, 1:40 finish"
    `);
});

test('20 rounds = 10:00 by default', () => {
  const program = buildProgram('etot');
  expect(program.totalMs - program.leadInMs).toBe(600_000);
});

test('ticks the overall ring at the start of every round', () => {
  expect(buildProgram('etot', { rounds: 4 }).display.ticks).toEqual({
    ring: 'overall',
    at: [0, 0.25, 0.5, 0.75],
  });
});

test.each([1, MAX_TICK_DIVISIONS + 1].filter((r) => r <= 120))(
  'has no ticks with %i rounds',
  (rounds) => {
    expect(buildProgram('etot', { rounds }).display.ticks).toBeUndefined();
  },
);
