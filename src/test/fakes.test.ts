import { describe, expect, test } from 'vitest';
import { FakeClock } from './fakes';

describe('FakeClock', () => {
  test('advance moves monotonic and wall time together', () => {
    const clock = new FakeClock();
    const [mono, wall] = [clock.now(), clock.wallNow()];
    clock.advance(1500);
    expect(clock.now() - mono).toBe(1500);
    expect(clock.wallNow() - wall).toBe(1500);
  });

  test('fires due timeouts in order, at their own time', () => {
    const clock = new FakeClock();
    const start = clock.now();
    const fired: [string, number][] = [];
    clock.setTimeout(() => fired.push(['b', clock.now() - start]), 200);
    clock.setTimeout(() => fired.push(['a', clock.now() - start]), 100);
    clock.setTimeout(() => fired.push(['c', clock.now() - start]), 200);
    clock.advance(250);
    expect(fired).toEqual([
      ['a', 100],
      ['b', 200],
      ['c', 200],
    ]);
  });

  test('does not fire timeouts before they are due', () => {
    const clock = new FakeClock();
    let fired = false;
    clock.setTimeout(() => (fired = true), 100);
    clock.advance(99);
    expect(fired).toBe(false);
    clock.advance(1);
    expect(fired).toBe(true);
  });

  test('fires timeouts scheduled by other timeouts within the same advance', () => {
    const clock = new FakeClock();
    const fired: number[] = [];
    const start = clock.now();
    const tick = () => {
      fired.push(clock.now() - start);
      if (fired.length < 3) clock.setTimeout(tick, 100);
    };
    clock.setTimeout(tick, 100);
    clock.advance(1000);
    expect(fired).toEqual([100, 200, 300]);
  });

  test('clearTimeout cancels a pending timeout', () => {
    const clock = new FakeClock();
    let fired = false;
    const id = clock.setTimeout(() => (fired = true), 100);
    clock.clearTimeout(id);
    clock.advance(200);
    expect(fired).toBe(false);
  });

  test('jump moves only wall time and fires nothing', () => {
    const clock = new FakeClock();
    let fired = false;
    clock.setTimeout(() => (fired = true), 100);
    const [mono, wall] = [clock.now(), clock.wallNow()];
    clock.jump(60_000);
    expect(clock.now()).toBe(mono);
    expect(clock.wallNow() - wall).toBe(60_000);
    expect(fired).toBe(false);
  });
});
