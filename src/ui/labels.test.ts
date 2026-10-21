import { describe, expect, test } from 'vitest';
import { snapshot } from '../core/snapshot';
import type { ModeId, RunState, Segment } from '../core/types';
import { buildProgram } from '../test/helpers';
import {
  digitsText,
  documentTitle,
  finishedAnnouncement,
  isFinalCountdown,
  paceCounter,
  roundCounter,
  segmentAnnouncement,
  segmentLabel,
  statusLabel,
  workoutLength,
} from './labels';

const seg = (s: Partial<Segment>): Segment => ({
  kind: 'work',
  startMs: 0,
  durationMs: 20_000,
  direction: 'down',
  ...s,
});

test.each([
  ['leadIn', 'Get Ready'],
  ['work', 'Work'],
  ['rest', 'Rest'],
] as const)('segment label for %s is %s', (kind, label) => {
  expect(segmentLabel(seg({ kind }))).toBe(label);
});

test.each<[RunState, string]>([
  ['idle', 'Ready'],
  ['running', 'Rest'],
  ['paused', 'Paused'],
  ['finished', 'Done'],
])('status label while %s is %s', (state, label) => {
  expect(statusLabel(state, seg({ kind: 'rest' }))).toBe(label);
});

test('round counter', () => {
  expect(roundCounter(seg({ round: 3, totalRounds: 10 }))).toBe('Round 3 / 10');
  expect(roundCounter(seg({ kind: 'leadIn' }))).toBe('');
});

test('pace counter', () => {
  const amrap = buildProgram('amrap', { repGoalEnabled: true, repGoal: 60 });
  expect(paceCounter(amrap, snapshot(amrap, 10_000 + 24 * 12_000))).toBe(
    'Target 24 / 60',
  );
  expect(
    paceCounter(buildProgram('amrap'), snapshot(buildProgram('amrap'), 0)),
  ).toBe('');
});

describe('digits', () => {
  const tabata = buildProgram('tabata');
  const forTime = buildProgram('forTime');

  test('idle shows the first work segment, not the lead-in', () => {
    expect(digitsText(tabata, snapshot(tabata, 0), 'idle')).toBe('0:20');
    expect(
      digitsText(
        buildProgram('amrap'),
        snapshot(buildProgram('amrap'), 0),
        'idle',
      ),
    ).toBe('12:00');
    expect(digitsText(forTime, snapshot(forTime, 0), 'idle')).toBe('0:00');
  });

  test('running shows the current segment', () => {
    expect(digitsText(tabata, snapshot(tabata, 2_500), 'running')).toBe('0:08');
    expect(
      digitsText(forTime, snapshot(forTime, 10_000 + 75_400), 'running'),
    ).toBe('1:15');
  });

  test('finished shows 0:00, or the final time for For Time', () => {
    expect(
      digitsText(tabata, snapshot(tabata, tabata.totalMs), 'finished'),
    ).toBe('0:00');
    expect(
      digitsText(forTime, snapshot(forTime, 10_000 + 754_999), 'finished'),
    ).toBe('12:34');
  });
});

test.each<[ModeId, number, RunState, boolean]>([
  // Tabata: the lead-in runs 0–10s, the first work segment 10–30s.
  ['tabata', 4_999, 'running', false],
  ['tabata', 5_000, 'running', true],
  ['tabata', 9_999, 'running', true],
  ['tabata', 26_999, 'running', false],
  ['tabata', 27_000, 'running', true],
  ['tabata', 29_999, 'running', true],
  ['tabata', 30_000, 'running', false],
  ['tabata', 27_000, 'paused', false],
  // EMOM: the first minute runs 10–70s.
  ['emom', 64_999, 'running', false],
  ['emom', 65_000, 'running', true],
  // For Time without a cap never ends on its own.
  ['forTime', 3_600_000, 'running', false],
])('%s final countdown at %ims while %s: %s', (modeId, ms, state, final) => {
  const program = buildProgram(modeId);
  expect(isFinalCountdown(program, snapshot(program, ms), state)).toBe(final);
});

describe('announcements', () => {
  test.each<[Partial<Segment>, string | null]>([
    [{ kind: 'leadIn', durationMs: 10_000 }, 'Get ready, 10 seconds'],
    [
      { kind: 'work', round: 3, totalRounds: 10, durationMs: 60_000 },
      'Round 3 of 10, work',
    ],
    [
      { kind: 'rest', round: 1, totalRounds: 8, durationMs: 10_000 },
      'Rest, 10 seconds',
    ],
    [{ kind: 'work', durationMs: 720_000 }, 'Work, 12 minutes'],
    [{ kind: 'work', durationMs: 60_000 }, 'Work, 1 minute'],
    [{ kind: 'work', durationMs: Infinity, direction: 'up' }, 'Work'],
    [{ kind: 'rest', durationMs: 999 }, null],
  ])('%o → %s', (segment, text) => {
    expect(segmentAnnouncement(seg(segment))).toBe(text);
  });

  test('finished', () => {
    const tabata = buildProgram('tabata');
    const forTime = buildProgram('forTime');
    expect(finishedAnnouncement(tabata, snapshot(tabata, tabata.totalMs))).toBe(
      'Workout complete',
    );
    expect(
      finishedAnnouncement(forTime, snapshot(forTime, 10_000 + 754_000)),
    ).toBe('Workout complete. Final time 12:34');
  });
});

test.each<[RunState, string]>([
  ['running', '0:42 Work · Conditioning Clock'],
  ['paused', '0:42 Work · Conditioning Clock'],
  ['idle', 'Conditioning Clock'],
  ['finished', 'Conditioning Clock'],
])('document title while %s', (state, title) => {
  expect(documentTitle(state, '0:42', 'Work')).toBe(title);
});

test.each([
  [buildProgram('emom'), '10:00 (+0:10 get ready)'],
  [buildProgram('etot', {}, { leadInSec: 0 }), '10:00'],
  [buildProgram('forTime'), 'Open-ended (+0:10 get ready)'],
  [buildProgram('emom', { rounds: 90 }), '1:30:00 (+0:10 get ready)'],
])('workout length', (program, text) => {
  expect(workoutLength(program)).toBe(text);
});
