import { describe, expect, test } from 'vitest';
import { buildProgram } from '../test/helpers';
import { displaySeconds, snapshot } from './snapshot';

describe('snapshot', () => {
  // Tabata defaults: lead-in 0–10s, work 10–30s, rest 30–40s, …
  const program = buildProgram('tabata');

  test.each([
    [9_999, 'leadIn', 0],
    [10_000, 'work', 1],
    [10_001, 'work', 1],
    [29_999, 'work', 1],
    [30_000, 'rest', 2],
    [30_001, 'rest', 2],
  ])('at %ims the current segment is %s', (ms, kind, index) => {
    const snap = snapshot(program, ms);
    expect(snap.segment.kind).toBe(kind);
    expect(snap.segmentIndex).toBe(index);
  });

  test('works when time moves backwards (cached cursor resets)', () => {
    snapshot(program, 200_000);
    expect(snapshot(program, 5_000).segment.kind).toBe('leadIn');
  });

  test('reports segment and work progress', () => {
    const snap = snapshot(program, 15_000);
    expect(snap).toMatchObject({
      segmentElapsedMs: 5_000,
      segmentRemainingMs: 15_000,
      workElapsedMs: 5_000,
      workTotalMs: 230_000,
      done: false,
    });
  });

  test('clamps work elapsed to zero during the lead-in', () => {
    expect(snapshot(program, 4_000).workElapsedMs).toBe(0);
  });

  test.each([
    [program.totalMs - 1, false],
    [program.totalMs, true],
    [program.totalMs + 1, true],
  ])('at %ims done is %s', (ms, done) => {
    expect(snapshot(program, ms).done).toBe(done);
  });

  test('clamps to the last segment when past the end', () => {
    const snap = snapshot(program, program.totalMs + 5_000);
    expect(snap.segmentIndex).toBe(program.segments.length - 1);
    expect(snap.segmentRemainingMs).toBe(0);
  });

  test('counts completed AMRAP pace reps, capped at the goal', () => {
    // 12 minutes / 60 reps = one every 12s, after a 10s lead-in.
    const amrap = buildProgram('amrap', { repGoalEnabled: true, repGoal: 60 });
    expect(snapshot(amrap, 10_000 + 11_999).completedPaceReps).toBe(0);
    expect(snapshot(amrap, 10_000 + 12_000).completedPaceReps).toBe(1);
    expect(snapshot(amrap, amrap.totalMs).completedPaceReps).toBe(60);
    expect(
      snapshot(buildProgram('amrap'), 50_000).completedPaceReps,
    ).toBeUndefined();
  });
});

describe('displaySeconds', () => {
  const program = buildProgram('tabata');

  test.each([
    // Around the lead-in → work boundary at 10s.
    [10_000 - 1_001, 2],
    [10_000 - 1_000, 1],
    [10_000 - 999, 1],
    [10_000 - 1, 1],
    [10_000, 20],
    [10_001, 20],
    [10_999, 20],
    [11_000, 19],
    [11_001, 19],
  ])('counting down at %ims shows %i', (ms, seconds) => {
    expect(displaySeconds(snapshot(program, ms))).toBe(seconds);
  });

  const forTime = buildProgram('forTime', {}, { leadInSec: 0 });

  test.each([
    [0, 0],
    [1, 0],
    [999, 0],
    [1_000, 1],
    [1_001, 1],
    [61_000, 61],
  ])('counting up at %ims shows %i', (ms, seconds) => {
    expect(displaySeconds(snapshot(forTime, ms))).toBe(seconds);
  });
});
