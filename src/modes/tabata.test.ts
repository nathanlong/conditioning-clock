import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';

test('alternates work and rest with sounds at every change', () => {
  expect(describeProgram(buildProgram('tabata', { rounds: 2 })))
    .toMatchInlineSnapshot(`
      "0:00 leadIn 10s
      0:10 work R1/2 20s
      0:30 rest R1/2 10s
      0:40 work R2/2 20s
      cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go, 0:25 tick, 0:26 tick, 0:27 tick, 0:28 tick, 0:29 tick, 0:30 rest, 0:35 tick, 0:36 tick, 0:37 tick, 0:38 tick, 0:39 tick, 0:40 go, 0:55 tick, 0:56 tick, 0:57 tick, 0:58 tick, 0:59 tick, 1:00 finish"
    `);
});

test('defaults run 3:50 after the lead-in, ending on work (no final rest)', () => {
  const program = buildProgram('tabata');
  expect(program.totalMs - program.leadInMs).toBe(230_000);
  expect(program.segments.at(-1)!.kind).toBe('work');
  expect(program.segments.filter((s) => s.kind === 'rest')).toHaveLength(7);
});

test('ticks the overall ring at the start of every round', () => {
  const program = buildProgram('tabata', { rounds: 3 });
  // 3 rounds of 20s work + 10s rest, no final rest: 80s of work time.
  expect(program.display.ticks).toEqual({
    ring: 'overall',
    at: [0, 30 / 80, 60 / 80],
  });
});

test('has no ticks with a single round', () => {
  expect(buildProgram('tabata', { rounds: 1 }).display.ticks).toBeUndefined();
});

test('a 5s rest is all countdown, without doubling up on its start', () => {
  const program = buildProgram(
    'tabata',
    { workSec: 20, restSec: 5, rounds: 2 },
    { leadInSec: 0 },
  );
  // Rest runs 20–25s. The 5s-out tick would land on the rest cue at 20s.
  const rest = program.cues.filter((c) => c.atMs >= 20_000 && c.atMs <= 25_000);
  expect(rest.map((c) => [c.atMs, c.sound])).toEqual([
    [20_000, 'rest'],
    [21_000, 'tick'],
    [22_000, 'tick'],
    [23_000, 'tick'],
    [24_000, 'tick'],
    [25_000, 'go'],
  ]);
});
