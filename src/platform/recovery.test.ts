import { describe, expect, test } from 'vitest';
import { Runner } from '../core/runner';
import type { ModeConfig, ModeId } from '../core/types';
import { COMMON_DEFAULTS } from '../modes/common';
import { modes } from '../modes/index';
import { FakeClock, MemoryStorage, ThrowingStorage } from '../test/fakes';
import {
  attachPersistence,
  recover,
  STALE_AFTER_FINISH_MS,
  STALE_OPEN_ENDED_MS,
} from './recovery';
import { keys, readJson } from './storage';

/** Starts a run with persistence attached, as the app does. */
function startRun(modeId: ModeId = 'emom', config?: ModeConfig) {
  const clock = new FakeClock();
  const store = new MemoryStorage();
  const mode = modes[modeId];
  const meta = {
    modeId,
    config: config ?? { ...mode.defaults },
    common: COMMON_DEFAULTS,
  };
  const program = mode.build(meta.config as never, meta.common);
  const runner = new Runner(program, clock);
  attachPersistence(runner, store, meta);
  return { clock, store, runner, program };
}

describe('persistence', () => {
  test('writes the active run on start, pause and resume', () => {
    const { clock, store, runner } = startRun();
    const startedAtWall = clock.wallNow();
    runner.start();
    expect(readJson(store, keys.activeRun)).toMatchObject({
      version: 1,
      modeId: 'emom',
      config: { rounds: 10 },
      state: 'running',
      startedAtWall,
      pausedTotalMs: 0,
    });
    clock.advance(1_000);
    runner.pause();
    expect(readJson(store, keys.activeRun)).toMatchObject({
      state: 'paused',
      pausedAtWall: startedAtWall + 1_000,
    });
  });

  test('clears the active run on finish and on reset', () => {
    const { clock, store, runner, program } = startRun();
    runner.start();
    clock.advance(program.totalMs);
    expect(store.getItem(keys.activeRun)).toBeNull();
    runner.reset();
    runner.start();
    runner.reset();
    expect(store.getItem(keys.activeRun)).toBeNull();
  });

  test('does not write per frame', () => {
    const { clock, store, runner } = startRun();
    runner.start();
    let writes = 0;
    const setItem = store.setItem.bind(store);
    store.setItem = (k, v) => (writes++, setItem(k, v));
    for (let i = 0; i < 100; i++) {
      clock.advance(16);
      runner.elapsedMs();
    }
    expect(writes).toBe(0);
  });
});

describe('recover', () => {
  test('restores a running run where the workout would be now', () => {
    const { clock, store, runner } = startRun();
    runner.start();
    clock.advance(90_000);
    // The reload: monotonic time restarts, the wall clock keeps going.
    const reloaded = new FakeClock();
    reloaded.wall = clock.wallNow() + 3_000;
    const recovered = recover(store, reloaded)!;
    expect(recovered.modeId).toBe('emom');
    expect(recovered.runner.state).toBe('running');
    expect(recovered.runner.elapsedMs()).toBe(93_000);
  });

  test('restores a paused run at the same position', () => {
    const { clock, store, runner } = startRun();
    runner.start();
    clock.advance(20_000);
    runner.pause();
    clock.advance(5_000);
    runner.resume();
    clock.advance(10_000);
    runner.pause();
    clock.jump(60_000);
    const recovered = recover(store, clock)!;
    expect(recovered.runner.state).toBe('paused');
    expect(recovered.runner.elapsedMs()).toBe(30_000);
  });

  test('shows an overdue run as finished, and clears it', () => {
    const { clock, store, runner, program } = startRun();
    runner.start();
    clock.jump(program.totalMs + 60_000);
    const recovered = recover(store, clock)!;
    expect(recovered.runner.state).toBe('finished');
    expect(recovered.runner.elapsedMs()).toBe(program.totalMs);
    expect(store.getItem(keys.activeRun)).toBeNull();
  });

  test.each([
    [-1, true],
    [0, true],
    [1, false],
  ])('a finite run %ims past the 1 hour grace is kept: %s', (overMs, kept) => {
    const { clock, store, runner, program } = startRun();
    runner.start();
    clock.jump(program.totalMs + STALE_AFTER_FINISH_MS + overMs);
    expect(recover(store, clock) !== null).toBe(kept);
  });

  test('counts pauses toward the expected finish', () => {
    const { clock, store, runner, program } = startRun();
    runner.start();
    runner.pause();
    clock.advance(30 * 60_000);
    runner.resume();
    clock.jump(program.totalMs + STALE_AFTER_FINISH_MS);
    expect(recover(store, clock)).not.toBeNull();
  });

  test.each([
    [-1, true],
    [1, false],
  ])(
    'an uncapped For Time run %ims past 6 hours is kept: %s',
    (overMs, kept) => {
      const { clock, store, runner } = startRun('forTime');
      runner.start();
      clock.jump(STALE_OPEN_ENDED_MS + overMs);
      const recovered = recover(store, clock);
      expect(recovered !== null).toBe(kept);
      if (!kept) expect(store.getItem(keys.activeRun)).toBeNull();
    },
  );

  test.each([
    ['nothing stored', null],
    ['corrupt JSON', '{oops'],
    [
      'the wrong version',
      JSON.stringify({
        version: 2,
        modeId: 'emom',
        state: 'running',
        startedAtWall: 1,
        pausedTotalMs: 0,
      }),
    ],
    [
      'an unknown mode',
      JSON.stringify({
        version: 1,
        modeId: 'zumba',
        state: 'running',
        startedAtWall: 1,
        pausedTotalMs: 0,
      }),
    ],
    [
      'a missing start',
      JSON.stringify({
        version: 1,
        modeId: 'emom',
        state: 'running',
        pausedTotalMs: 0,
      }),
    ],
    [
      'a paused run without a pause time',
      JSON.stringify({
        version: 1,
        modeId: 'emom',
        state: 'paused',
        startedAtWall: 1,
        pausedTotalMs: 0,
      }),
    ],
    [
      'an idle state',
      JSON.stringify({
        version: 1,
        modeId: 'emom',
        state: 'idle',
        startedAtWall: 1,
        pausedTotalMs: 0,
      }),
    ],
  ])('discards %s', (_, raw) => {
    const clock = new FakeClock();
    const store = new MemoryStorage();
    if (raw !== null) store.setItem(keys.activeRun, raw);
    expect(recover(store, clock)).toBeNull();
    expect(store.getItem(keys.activeRun)).toBeNull();
  });

  test('sanitizes the stored config before rebuilding', () => {
    const clock = new FakeClock();
    const store = new MemoryStorage();
    store.setItem(
      keys.activeRun,
      JSON.stringify({
        version: 1,
        modeId: 'emom',
        config: { rounds: 999 },
        common: {},
        state: 'running',
        startedAtWall: clock.wallNow(),
        pausedTotalMs: 0,
      }),
    );
    const recovered = recover(store, clock)!;
    expect(recovered.config).toEqual({ rounds: 60 });
    expect(recovered.common).toEqual(COMMON_DEFAULTS);
  });

  test('survives a throwing store', () => {
    expect(recover(new ThrowingStorage(), new FakeClock())).toBeNull();
    const clock = new FakeClock();
    const runner = new Runner(
      modes.emom.build({ rounds: 1 }, COMMON_DEFAULTS),
      clock,
    );
    attachPersistence(runner, new ThrowingStorage(), {
      modeId: 'emom',
      config: { rounds: 1 },
      common: COMMON_DEFAULTS,
    });
    expect(() => runner.start()).not.toThrow();
  });
});
