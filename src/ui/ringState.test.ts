import { describe, expect, test } from 'vitest';
import { snapshot } from '../core/snapshot';
import type { RunState } from '../core/types';
import { buildProgram } from '../test/helpers';
import { ringState } from './ringState';

const at = (
  program: ReturnType<typeof buildProgram>,
  ms: number,
  state: RunState = 'running',
) => ringState(program, snapshot(program, ms), state);

describe('run states', () => {
  const tabata = buildProgram('tabata');

  test('idle: gray and empty, overall too', () => {
    expect(at(tabata, 0, 'idle')).toEqual({
      main: { progress: 0, tone: 'idle' },
      overall: { progress: 0, tone: 'idle' },
    });
  });

  test('finished: blue and full, overall orange and full', () => {
    expect(at(tabata, tabata.totalMs, 'finished')).toEqual({
      main: { progress: 1, tone: 'work' },
      overall: { progress: 1, tone: 'overall' },
    });
  });

  test.each<[string, number, RunState, string]>([
    ['lead-in', 5_000, 'running', 'rest'],
    ['work', 15_000, 'running', 'work'],
    ['rest', 35_000, 'running', 'rest'],
    ['lead-in', 5_000, 'paused', 'paused'],
    ['work', 15_000, 'paused', 'paused'],
    ['rest', 35_000, 'paused', 'paused'],
  ])(
    '%s while %s: main ring is %s, overall stays orange',
    (_, ms, state, tone) => {
      const ring = at(tabata, ms, state);
      expect(ring.main.tone).toBe(tone);
      expect(ring.overall!.tone).toBe('overall');
    },
  );

  test('paused holds its position', () => {
    expect(at(tabata, 15_000, 'paused')).toEqual(
      at(tabata, 15_000, 'running') && {
        main: { progress: 0.25, tone: 'paused' },
        overall: { progress: 5_000 / 230_000, tone: 'overall' },
      },
    );
  });
});

describe('per mode', () => {
  test.each(['emom', 'etot'] as const)(
    '%s: main fills once per interval, overall across the workout',
    (modeId) => {
      const program = buildProgram(modeId);
      const interval = program.segments[1]!.durationMs;
      const mid = program.leadInMs + interval + interval / 2;
      expect(at(program, mid)).toEqual({
        main: { progress: 0.5, tone: 'work' },
        overall: {
          progress: (interval * 1.5) / (program.totalMs - program.leadInMs),
          tone: 'overall',
        },
      });
    },
  );

  test('tabata: main fills once per work or rest segment', () => {
    const tabata = buildProgram('tabata');
    expect(at(tabata, 10_000).main.progress).toBe(0);
    expect(at(tabata, 20_000).main.progress).toBe(0.5);
    expect(at(tabata, 29_999).main.progress).toBeCloseTo(1, 3);
    expect(at(tabata, 30_000).main).toEqual({ progress: 0, tone: 'rest' });
    expect(at(tabata, 35_000).main.progress).toBe(0.5);
  });

  test('amrap: main fills across the whole duration, no overall ring', () => {
    const amrap = buildProgram('amrap');
    expect(at(amrap, 10_000 + 360_000)).toEqual({
      main: { progress: 0.5, tone: 'work' },
    });
  });

  test.each([
    [10_000, 0],
    [10_000 + 30_000, 0.5],
    [10_000 + 59_999, 59_999 / 60_000],
    [10_000 + 60_000, 0],
    [10_000 + 90_000, 0.5],
  ])('for time: main wraps every 60s (at %ims, %d)', (ms, progress) => {
    const forTime = buildProgram('forTime');
    expect(at(forTime, ms)).toEqual({ main: { progress, tone: 'work' } });
  });

  describe('for time with a goal', () => {
    const goal = buildProgram('forTime', { goalEnabled: true, goalMin: 20 });

    test('overall fills toward the goal, and stays full past it', () => {
      expect(at(goal, 10_000 + 600_000).overall).toEqual({
        progress: 0.5,
        tone: 'overall',
      });
      expect(at(goal, 10_000 + 1_500_000).overall!.progress).toBe(1);
    });

    test('finished under the goal, overall shows how close it came', () => {
      expect(at(goal, 10_000 + 900_000, 'finished').overall).toEqual({
        progress: 0.75,
        tone: 'overall',
      });
    });
  });

  test.each(['emom', 'etot', 'amrap', 'forTime', 'tabata'] as const)(
    '%s lead-in: main fills green across the lead-in, overall empty',
    (modeId) => {
      const program = buildProgram(modeId, { goalEnabled: true });
      const ring = at(program, 2_500);
      expect(ring.main).toEqual({ progress: 0.25, tone: 'rest' });
      if (ring.overall) expect(ring.overall.progress).toBe(0);
    },
  );
});
