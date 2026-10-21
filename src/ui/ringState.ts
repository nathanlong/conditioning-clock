import type { Snapshot } from '../core/snapshot';
import type { Program, RunState } from '../core/types';

export type Tone = 'idle' | 'work' | 'rest' | 'paused' | 'overall';

export interface Ring {
  /** 0–1, clockwise from 12 o'clock. */
  progress: number;
  tone: Tone;
}

export interface RingState {
  main: Ring;
  overall?: Ring;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** All the per-mode and per-state ring rules. */
export function ringState(
  program: Program,
  snap: Snapshot,
  state: RunState,
): RingState {
  const showOverall = program.display.overallRing;
  if (state === 'idle') {
    return {
      main: { progress: 0, tone: 'idle' },
      ...(showOverall ? { overall: { progress: 0, tone: 'idle' } } : {}),
    };
  }
  // With a goal, the overall ring fills toward it, and stays full past it.
  const overallProgress = clamp01(
    snap.workElapsedMs / (program.goalMs ?? snap.workTotalMs),
  );
  if (state === 'finished') {
    return {
      main: { progress: 1, tone: 'work' },
      ...(showOverall
        ? {
            overall: {
              // How close a run that beat its goal came to it.
              progress: program.goalMs === undefined ? 1 : overallProgress,
              tone: 'overall',
            },
          }
        : {}),
    };
  }

  const { segment } = snap;
  const wraps =
    program.display.primaryRing === 'minute' && segment.kind !== 'leadIn';
  const progress = wraps
    ? (snap.segmentElapsedMs % 60_000) / 60_000
    : snap.segmentElapsedMs / segment.durationMs;
  const tone: Tone =
    state === 'paused' ? 'paused' : segment.kind === 'work' ? 'work' : 'rest';
  return {
    main: { progress: clamp01(progress), tone },
    ...(showOverall
      ? {
          overall: { progress: overallProgress, tone: 'overall' },
        }
      : {}),
  };
}
