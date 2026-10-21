import { describe, expect, test } from 'vitest';
import { FakeClock } from '../test/fakes';
import { buildProgram } from '../test/helpers';
import { Runner } from './runner';
import type { RunState } from './types';

function setup(
  modeId: Parameters<typeof buildProgram>[0] = 'tabata',
  overrides = {},
) {
  const clock = new FakeClock();
  const program = buildProgram(modeId, overrides);
  const runner = new Runner(program, clock);
  const changes: [RunState, RunState][] = [];
  runner.on((state, prev) => changes.push([prev, state]));
  return { clock, program, runner, changes };
}

describe('transitions', () => {
  test('idle → running → paused → running → finished', () => {
    const { clock, program, runner, changes } = setup();
    runner.start();
    runner.pause();
    runner.resume();
    clock.advance(program.totalMs);
    expect(changes).toEqual([
      ['idle', 'running'],
      ['running', 'paused'],
      ['paused', 'running'],
      ['running', 'finished'],
    ]);
  });

  test.each<[RunState, 'start' | 'pause' | 'resume' | 'done' | 'reset']>([
    ['idle', 'pause'],
    ['idle', 'resume'],
    ['idle', 'done'],
    ['idle', 'reset'],
    ['running', 'start'],
    ['running', 'resume'],
    ['paused', 'start'],
    ['paused', 'pause'],
    ['finished', 'start'],
    ['finished', 'pause'],
    ['finished', 'resume'],
    ['finished', 'done'],
  ])('ignores %s → %s', (from, action) => {
    const { clock, program, runner, changes } = setup();
    if (from !== 'idle') runner.start();
    if (from === 'paused') runner.pause();
    if (from === 'finished') clock.advance(program.totalMs);
    changes.length = 0;
    expect(runner[action]()).toBe(false);
    expect(runner.state).toBe(from);
    expect(changes).toEqual([]);
  });

  test.each<RunState>(['running', 'paused', 'finished'])(
    'reset from %s goes to idle at 0',
    (from) => {
      const { clock, program, runner } = setup();
      runner.start();
      clock.advance(5_000);
      if (from === 'paused') runner.pause();
      if (from === 'finished') clock.advance(program.totalMs);
      expect(runner.reset()).toBe(true);
      expect(runner.state).toBe('idle');
      expect(runner.elapsedMs()).toBe(0);
    },
  );

  test('can start again after a reset', () => {
    const { clock, runner } = setup();
    runner.start();
    clock.advance(30_000);
    runner.reset();
    clock.advance(10_000);
    runner.start();
    clock.advance(1_000);
    expect(runner.elapsedMs()).toBe(1_000);
  });
});

describe('elapsed time', () => {
  test('is derived from the clock while running', () => {
    const { clock, runner } = setup();
    runner.start();
    clock.advance(12_345);
    expect(runner.elapsedMs()).toBe(12_345);
  });

  test('freezes while paused', () => {
    const { clock, runner } = setup();
    runner.start();
    clock.advance(5_000);
    runner.pause();
    clock.advance(60_000);
    expect(runner.elapsedMs()).toBe(5_000);
  });

  test('accounts for several pauses', () => {
    const { clock, runner } = setup();
    runner.start();
    for (let i = 0; i < 3; i++) {
      clock.advance(2_000);
      runner.pause();
      clock.advance(7_000);
      runner.resume();
    }
    clock.advance(500);
    expect(runner.elapsedMs()).toBe(6_500);
  });

  test('a reset during a pause leaves no pause behind for the next run', () => {
    const { clock, runner } = setup();
    runner.start();
    runner.pause();
    clock.advance(9_000);
    runner.reset();
    runner.start();
    clock.advance(1_000);
    expect(runner.elapsedMs()).toBe(1_000);
  });
});

describe('finishing', () => {
  test('finishes by timeout with no reads', () => {
    const { clock, program, runner } = setup();
    runner.start();
    clock.advance(program.totalMs - 1);
    expect(runner.state).toBe('running');
    clock.advance(1);
    expect(runner.state).toBe('finished');
  });

  test('finishes on time after pauses', () => {
    const { clock, program, runner } = setup();
    runner.start();
    clock.advance(10_000);
    runner.pause();
    clock.advance(30_000);
    runner.resume();
    clock.advance(program.totalMs - 10_000 - 1);
    expect(runner.state).toBe('running');
    clock.advance(1);
    expect(runner.state).toBe('finished');
  });

  test('clamps elapsed to the total on finish', () => {
    const { clock, program, runner } = setup();
    runner.start();
    clock.advance(program.totalMs + 10_000);
    expect(runner.elapsedMs()).toBe(program.totalMs);
  });

  test('a read past the end finishes the run, even before the timeout fires', () => {
    const { clock, program, runner } = setup();
    runner.start();
    clock.mono += program.totalMs + 50;
    expect(runner.elapsedMs()).toBe(program.totalMs);
    expect(runner.state).toBe('finished');
  });

  test('pausing past the end finishes instead', () => {
    const { clock, program, runner } = setup();
    runner.start();
    clock.mono += program.totalMs;
    expect(runner.pause()).toBe(false);
    expect(runner.state).toBe('finished');
  });

  test('an open-ended run never finishes on its own', () => {
    const { clock, runner } = setup('forTime');
    runner.start();
    expect(clock.pendingTimers).toBe(0);
    clock.advance(10 * 60 * 60_000);
    expect(runner.state).toBe('running');
  });

  test.each(['running', 'paused'] as const)(
    'Done from %s freezes elapsed time',
    (from) => {
      const { clock, runner } = setup('forTime');
      runner.start();
      clock.advance(95_000);
      if (from === 'paused') {
        runner.pause();
        clock.advance(20_000);
      }
      expect(runner.done()).toBe(true);
      clock.advance(60_000);
      expect(runner.state).toBe('finished');
      expect(runner.elapsedMs()).toBe(95_000);
    },
  );

  test('clears its timeout when finished early or reset', () => {
    const { clock, runner } = setup();
    runner.start();
    runner.done();
    expect(clock.pendingTimers).toBe(0);
    runner.reset();
    runner.start();
    runner.reset();
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('wall timing', () => {
  test('is null unless running or paused', () => {
    const { runner } = setup();
    expect(runner.wallTiming()).toBeNull();
  });

  test('tracks wall-clock start and pauses', () => {
    const { clock, runner } = setup();
    const startedAtWall = clock.wallNow();
    runner.start();
    clock.advance(1_000);
    runner.pause();
    clock.advance(4_000);
    runner.resume();
    clock.advance(1_000);
    runner.pause();
    expect(runner.wallTiming()).toEqual({
      state: 'paused',
      startedAtWall,
      pausedAtWall: startedAtWall + 6_000,
      pausedTotalMs: 4_000,
    });
  });
});

describe('restore', () => {
  test('restores running at a position, and keeps running', () => {
    const clock = new FakeClock();
    const program = buildProgram('tabata');
    const runner = Runner.restore(program, clock, {
      state: 'running',
      elapsedMs: 90_000,
      startedAtWall: 1,
      pausedTotalMs: 0,
    });
    expect(runner.state).toBe('running');
    expect(runner.elapsedMs()).toBe(90_000);
    clock.advance(program.totalMs - 90_000);
    expect(runner.state).toBe('finished');
  });

  test('restores paused at a position', () => {
    const clock = new FakeClock();
    const runner = Runner.restore(buildProgram('tabata'), clock, {
      state: 'paused',
      elapsedMs: 42_000,
      startedAtWall: 1,
      pausedAtWall: 43_001,
      pausedTotalMs: 0,
    });
    clock.advance(10_000);
    expect(runner.state).toBe('paused');
    expect(runner.elapsedMs()).toBe(42_000);
    runner.resume();
    clock.advance(1_000);
    expect(runner.elapsedMs()).toBe(43_000);
  });

  test('restores past the end as finished', () => {
    const clock = new FakeClock();
    const program = buildProgram('tabata');
    const runner = Runner.restore(program, clock, {
      state: 'running',
      elapsedMs: program.totalMs + 1,
      startedAtWall: 1,
      pausedTotalMs: 0,
    });
    expect(runner.state).toBe('finished');
    expect(runner.elapsedMs()).toBe(program.totalMs);
  });
});
