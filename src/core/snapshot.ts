import type { Program, Segment } from './types';

export interface Snapshot {
  segment: Segment;
  segmentIndex: number;
  segmentElapsedMs: number;
  segmentRemainingMs: number;
  /** Elapsed excluding lead-in, clamped ≥ 0. */
  workElapsedMs: number;
  /** totalMs - leadInMs; Infinity if open-ended. */
  workTotalMs: number;
  /** AMRAP only: target reps whose pace interval has passed. */
  completedPaceReps?: number;
  done: boolean;
}

const cursors = new WeakMap<Program, number>();

function segmentIndexAt(program: Program, elapsedMs: number): number {
  const segments = program.segments;
  let i = cursors.get(program) ?? 0;
  if (i >= segments.length || elapsedMs < segments[i]!.startMs) i = 0;
  while (i < segments.length - 1) {
    const s = segments[i]!;
    // Exactly at a boundary, the next segment is current.
    if (elapsedMs < s.startMs + s.durationMs) break;
    i++;
  }
  cursors.set(program, i);
  return i;
}

export function snapshot(program: Program, elapsedMs: number): Snapshot {
  const elapsed = Math.min(Math.max(elapsedMs, 0), program.totalMs);
  const segmentIndex = segmentIndexAt(program, elapsed);
  const segment = program.segments[segmentIndex]!;
  const segmentElapsedMs = elapsed - segment.startMs;
  const workElapsedMs = Math.max(0, elapsed - program.leadInMs);
  const snap: Snapshot = {
    segment,
    segmentIndex,
    segmentElapsedMs,
    segmentRemainingMs: segment.durationMs - segmentElapsedMs,
    workElapsedMs,
    workTotalMs: program.totalMs - program.leadInMs,
    done: elapsedMs >= program.totalMs,
  };
  if (program.pace) {
    snap.completedPaceReps = Math.min(
      program.pace.repGoal,
      Math.floor(workElapsedMs / program.pace.intervalMs),
    );
  }
  return snap;
}

/**
 * The whole seconds the center digits show for the current segment: rounded
 * up when counting down (so "0:01" stays for the full final second), down
 * when counting up.
 */
export function displaySeconds(snap: Snapshot): number {
  return snap.segment.direction === 'down'
    ? Math.ceil(snap.segmentRemainingMs / 1000)
    : Math.floor(snap.segmentElapsedMs / 1000);
}
