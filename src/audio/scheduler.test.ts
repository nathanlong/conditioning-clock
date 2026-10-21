import { describe, expect, test } from 'vitest';
import { Runner } from '../core/runner';
import type { Program } from '../core/types';
import { FakeAudioPort, FakeClock } from '../test/fakes';
import { buildProgram } from '../test/helpers';
import { AudioScheduler } from './scheduler';

function setup(program: Program = buildProgram('tabata')) {
  const clock = new FakeClock();
  const port = new FakeAudioPort(clock);
  port.time = 100;
  const runner = new Runner(program, clock);
  const scheduler = new AudioScheduler(program, runner, port, clock);
  scheduler.attach();
  const advance = (ms: number) => clock.advance(ms);
  return { clock, port, runner, scheduler, program, advance };
}

describe('AudioScheduler', () => {
  test('schedules nothing until the run starts', () => {
    const { port, advance } = setup();
    advance(10_000);
    expect(port.played).toEqual([]);
  });

  test('schedules cues within a 5s window, on the audio clock', () => {
    // Lead-in ticks at 5s–9s: only the first is inside the first window.
    const { port, runner, advance } = setup();
    runner.start();
    expect(port.played).toEqual([{ sound: 'tick', at: 105, stopped: false }]);
    advance(250);
    expect(port.played.map((p) => p.sound)).toEqual(['tick']);
    advance(750);
    expect(port.played.map((p) => [p.sound, p.at])).toEqual([
      ['tick', 105],
      ['tick', 106],
    ]);
  });

  test('never schedules a cue twice', () => {
    const { port, runner, program, advance } = setup();
    runner.start();
    for (let t = 0; t < program.totalMs; t += 250) advance(250);
    expect(port.played).toHaveLength(program.cues.length);
    expect(port.played.map((p) => p.sound)).toEqual(
      program.cues.map((c) => c.sound),
    );
  });

  test('plays a cue exactly at elapsed', () => {
    const { port, runner } = setup(
      buildProgram('tabata', {}, { leadInSec: 0 }),
    );
    runner.start();
    expect(port.played[0]).toEqual({ sound: 'go', at: 100, stopped: false });
  });

  test.each([
    [20_000, ['rest']],
    [20_001, []],
  ])('joining at %ims, the rest cue at 20s plays: %j', (atMs, sounds) => {
    // Tabata without a lead-in: rest starts at 20s, the next ticks at 27s.
    const { port, runner, scheduler, advance } = setup(
      buildProgram('tabata', {}, { leadInSec: 0 }),
    );
    runner.start();
    scheduler.detach();
    port.played = [];
    advance(atMs);
    scheduler.attach();
    expect(port.played.map((p) => p.sound)).toEqual(sounds);
  });

  test('stops every scheduled sound on pause, and reschedules mid-segment on resume', () => {
    const { port, runner, advance } = setup();
    runner.start();
    advance(6_500);
    expect(port.audible.map((p) => p.at)).toEqual([
      105, 106, 107, 108, 109, 110,
    ]);
    runner.pause();
    expect(port.audible).toEqual([]);
    advance(30_000);
    runner.resume();
    // Elapsed 6.5s, so the 7s tick is 0.5s away on the audio clock.
    expect(port.audible.map((p) => [p.sound, p.at])).toEqual([
      ['tick', 137],
      ['tick', 138],
      ['tick', 139],
      ['go', 140],
    ]);
  });

  test('stops everything on reset and schedules nothing more', () => {
    const { port, runner, advance } = setup();
    runner.start();
    advance(5_000);
    runner.reset();
    expect(port.audible).toEqual([]);
    advance(20_000);
    expect(port.audible).toEqual([]);
  });

  test('schedules the rest of the program when hidden', () => {
    const { port, runner, scheduler, program } = setup();
    runner.start();
    scheduler.setHidden(true);
    expect(port.played).toHaveLength(program.cues.length);
    expect(port.played.at(-1)).toEqual({
      sound: 'finish',
      at: 100 + program.totalMs / 1000,
      stopped: false,
    });
  });

  test('lets the finish sound ring out when the run ends', () => {
    const { port, runner, program, advance } = setup();
    runner.start();
    for (let t = 0; t < program.totalMs; t += 250) advance(250);
    expect(runner.state).toBe('finished');
    expect(port.played.at(-1)).toMatchObject({
      sound: 'finish',
      stopped: false,
    });
  });

  test('silences cues after an early Done', () => {
    const { port, runner, advance } = setup(
      buildProgram(
        'forTime',
        { capEnabled: true, capMin: 1 },
        { leadInSec: 0 },
      ),
    );
    runner.start();
    advance(56_000);
    expect(port.audible.map((p) => p.sound)).toEqual([
      'go',
      'tick',
      'tick',
      'tick',
      'finish',
    ]);
    runner.done();
    expect(port.audible.map((p) => p.sound)).toEqual(['go']);
  });

  test('resync drops and reschedules from the current position', () => {
    const { port, runner, scheduler, advance } = setup();
    runner.start();
    advance(6_000);
    // The audio clock jumped ahead, as after an interruption.
    port.time += 394;
    scheduler.resync();
    // The 6s tick is exactly at elapsed, so it still plays.
    expect(port.audible.map((p) => p.at)).toEqual([500, 501, 502, 503, 504]);
  });

  test('detach stops the loop', () => {
    const { clock, runner, scheduler } = setup(buildProgram('forTime'));
    runner.start();
    scheduler.detach();
    expect(clock.pendingTimers).toBe(0);
  });
});
