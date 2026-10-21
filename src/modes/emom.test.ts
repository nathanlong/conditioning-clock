import { expect, test } from 'vitest';
import { buildProgram, describeProgram } from '../test/helpers';

test('3 one-minute rounds after a 10s lead-in', () => {
  expect(describeProgram(buildProgram('emom', { rounds: 3 })))
    .toMatchInlineSnapshot(`
      "0:00 leadIn 10s
      0:10 work R1/3 60s
      1:10 work R2/3 60s
      2:10 work R3/3 60s
      cues: 0:05 tick, 0:06 tick, 0:07 tick, 0:08 tick, 0:09 tick, 0:10 go, 1:05 tick, 1:06 tick, 1:07 tick, 1:08 tick, 1:09 tick, 1:10 go, 2:05 tick, 2:06 tick, 2:07 tick, 2:08 tick, 2:09 tick, 2:10 go, 3:05 tick, 3:06 tick, 3:07 tick, 3:08 tick, 3:09 tick, 3:10 finish"
    `);
});

test('runs 10:00 plus the lead-in by default', () => {
  const program = buildProgram('emom');
  expect(program.totalMs).toBe(610_000);
  expect(program.segments.filter((s) => s.kind === 'work')).toHaveLength(10);
  expect(program.display).toEqual({
    primaryRing: 'segment',
    overallRing: true,
  });
});
