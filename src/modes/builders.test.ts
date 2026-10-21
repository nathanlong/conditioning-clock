import { describe, expect, test } from 'vitest';
import type { Cue } from '../core/types';
import {
  boundaryCues,
  intervals,
  leadIn,
  mergeCues,
  segmentCues,
} from './builders';

describe('leadIn', () => {
  test('is a single count-down segment from 0', () => {
    expect(leadIn(10)).toEqual([
      { kind: 'leadIn', startMs: 0, durationMs: 10_000, direction: 'down' },
    ]);
  });

  test('is empty when disabled', () => {
    expect(leadIn(0)).toEqual([]);
  });
});

describe('intervals', () => {
  test('alternates work and rest with round numbers and no trailing rest', () => {
    const segments = intervals({
      count: 2,
      workMs: 20_000,
      restMs: 10_000,
      startMs: 5_000,
    });
    expect(segments).toEqual([
      {
        kind: 'work',
        startMs: 5_000,
        durationMs: 20_000,
        direction: 'down',
        round: 1,
        totalRounds: 2,
      },
      {
        kind: 'rest',
        startMs: 25_000,
        durationMs: 10_000,
        direction: 'down',
        round: 1,
        totalRounds: 2,
      },
      {
        kind: 'work',
        startMs: 35_000,
        durationMs: 20_000,
        direction: 'down',
        round: 2,
        totalRounds: 2,
      },
    ]);
  });

  test('without rest, is back-to-back work', () => {
    const segments = intervals({ count: 3, workMs: 60_000 });
    expect(segments.map((s) => [s.kind, s.startMs])).toEqual([
      ['work', 0],
      ['work', 60_000],
      ['work', 120_000],
    ]);
  });
});

describe('boundaryCues', () => {
  test('ticks at -3s, -2s, -1s, then the sound at the boundary', () => {
    expect(boundaryCues(60_000, 'go', 0)).toEqual([
      { atMs: 57_000, sound: 'tick' },
      { atMs: 58_000, sound: 'tick' },
      { atMs: 59_000, sound: 'tick' },
      { atMs: 60_000, sound: 'go' },
    ]);
  });

  test('drops ticks within 1s of the previous segment start', () => {
    // Previous segment started at 56.5s: the 57s tick is too close.
    expect(boundaryCues(60_000, 'rest', 56_500).map((c) => c.atMs)).toEqual([
      58_000, 59_000, 60_000,
    ]);
  });

  test('keeps a tick exactly 1s after the previous segment start', () => {
    expect(boundaryCues(4_000, 'go', 0).map((c) => c.atMs)).toEqual([
      1_000, 2_000, 3_000, 4_000,
    ]);
  });

  test('counts down from a longer countdown', () => {
    expect(boundaryCues(60_000, 'go', 0, 5).map((c) => c.atMs)).toEqual([
      55_000, 56_000, 57_000, 58_000, 59_000, 60_000,
    ]);
  });

  test('drops ticks before time zero', () => {
    expect(boundaryCues(0, 'go', 0)).toEqual([{ atMs: 0, sound: 'go' }]);
  });
});

describe('segmentCues', () => {
  const ticksBefore = (cues: Cue[], boundaryMs: number) =>
    cues.filter(
      (c) =>
        c.sound === 'tick' &&
        c.atMs < boundaryMs &&
        c.atMs >= boundaryMs - 5_000,
    ).length;

  test('counts down 5s out of the lead-in, and 3s elsewhere by default', () => {
    const cues = segmentCues([
      ...leadIn(10),
      ...intervals({ count: 2, workMs: 20_000, startMs: 10_000 }),
    ]);
    expect(ticksBefore(cues, 10_000)).toBe(5);
    expect(ticksBefore(cues, 30_000)).toBe(3);
    expect(ticksBefore(cues, 50_000)).toBe(3);
  });

  test('uses the given countdown after the lead-in, finish included', () => {
    const cues = segmentCues(intervals({ count: 2, workMs: 30_000 }), 5);
    expect(ticksBefore(cues, 30_000)).toBe(5);
    expect(ticksBefore(cues, 60_000)).toBe(5);
  });

  test('uses finish for the last boundary', () => {
    const cues = segmentCues(intervals({ count: 1, workMs: 10_000 }));
    expect(cues.at(-1)).toEqual({ atMs: 10_000, sound: 'finish' });
  });

  test('has no finish for an open-ended program', () => {
    const cues = segmentCues([
      { kind: 'work', startMs: 0, durationMs: Infinity, direction: 'up' },
    ]);
    expect(cues).toEqual([{ atMs: 0, sound: 'go' }]);
  });
});

describe('mergeCues', () => {
  test('sorts across lists', () => {
    expect(
      mergeCues(
        [{ atMs: 2_000, sound: 'tick' }],
        [{ atMs: 1_000, sound: 'pace' }],
      ),
    ).toEqual([
      { atMs: 1_000, sound: 'pace' },
      { atMs: 2_000, sound: 'tick' },
    ]);
  });

  test.each([
    ['finish', 'go'],
    ['go', 'tick'],
    ['rest', 'tick'],
    ['tick', 'pace'],
  ] as const)('%s wins a collision with %s', (winner, loser) => {
    const merged = mergeCues([
      { atMs: 1_000, sound: loser },
      { atMs: 1_100, sound: winner },
    ]);
    expect(merged).toEqual([{ atMs: 1_100, sound: winner }]);
  });

  test('keeps cues exactly 250ms apart', () => {
    expect(
      mergeCues([
        { atMs: 1_000, sound: 'pace' },
        { atMs: 1_250, sound: 'tick' },
      ]),
    ).toHaveLength(2);
  });

  test('deduplicates identical cues', () => {
    expect(
      mergeCues([{ atMs: 0, sound: 'go' }], [{ atMs: 0, sound: 'go' }]),
    ).toEqual([{ atMs: 0, sound: 'go' }]);
  });
});
