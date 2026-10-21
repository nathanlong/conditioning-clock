import { format } from '../core/format';
import { displaySeconds, type Snapshot } from '../core/snapshot';
import type { Program, RunState, Segment } from '../core/types';
import { LONG_COUNTDOWN_SEC } from '../modes/builders';

export const APP_TITLE = 'Conditioning Clock';

export function segmentLabel(segment: Segment): string {
  switch (segment.kind) {
    case 'leadIn':
      return 'Get Ready';
    case 'work':
      return 'Work';
    case 'rest':
      return 'Rest';
  }
}

export function statusLabel(state: RunState, segment: Segment): string {
  switch (state) {
    case 'idle':
      return 'Ready';
    case 'paused':
      return 'Paused';
    case 'finished':
      return 'Done';
    case 'running':
      return segmentLabel(segment);
  }
}

export function roundCounter(segment: Segment): string {
  return segment.round ? `Round ${segment.round} / ${segment.totalRounds}` : '';
}

/** "Target 24 / 60" for AMRAP with a rep goal. */
export function paceCounter(program: Program, snap: Snapshot): string {
  if (!program.pace) return '';
  return `Target ${snap.completedPaceReps ?? 0} / ${program.pace.repGoal}`;
}

/** The first work segment, which idle shows instead of the lead-in. */
export function firstWork(program: Program): Segment {
  return program.segments.find((s) => s.kind !== 'leadIn')!;
}

/** True when the main display counts up (For Time). */
export function countsUp(program: Program): boolean {
  return firstWork(program).direction === 'up';
}

/** The center digits for any run state. */
export function digitsText(
  program: Program,
  snap: Snapshot,
  state: RunState,
): string {
  switch (state) {
    case 'idle': {
      const work = firstWork(program);
      return work.direction === 'up'
        ? format(0)
        : format(work.durationMs / 1000);
    }
    case 'finished':
      return countsUp(program) ? format(snap.workElapsedMs / 1000) : format(0);
    default:
      return format(displaySeconds(snap));
  }
}

/**
 * From the first countdown tick before a segment's end, when the digits get
 * heavier. Matches the audio: 5 seconds where it ticks 5, 3 where it ticks 3.
 */
export function isFinalCountdown(
  program: Program,
  snap: Snapshot,
  state: RunState,
): boolean {
  const { segment, segmentRemainingMs } = snap;
  if (state !== 'running' || !Number.isFinite(segmentRemainingMs)) return false;
  const endMs = segment.startMs + segment.durationMs;
  const firstTick = program.cues.find(
    (c) =>
      c.sound === 'tick' &&
      c.atMs >= Math.max(segment.startMs, endMs - LONG_COUNTDOWN_SEC * 1000) &&
      c.atMs < endMs,
  );
  return (
    firstTick !== undefined &&
    segmentRemainingMs > 0 &&
    segmentRemainingMs <= endMs - firstTick.atMs
  );
}

function spokenDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/** What the screen reader hears when a segment starts; null to stay quiet. */
export function segmentAnnouncement(segment: Segment): string | null {
  if (segment.durationMs < 1000) return null;
  const length = Number.isFinite(segment.durationMs)
    ? `, ${spokenDuration(segment.durationMs)}`
    : '';
  switch (segment.kind) {
    case 'leadIn':
      return `Get ready${length}`;
    case 'rest':
      return `Rest${length}`;
    case 'work':
      return segment.round
        ? `Round ${segment.round} of ${segment.totalRounds}, work`
        : `Work${length}`;
  }
}

export function pausedAnnouncement(digits: string): string {
  return `Paused at ${digits}`;
}

export function finishedAnnouncement(program: Program, snap: Snapshot): string {
  return countsUp(program)
    ? `Workout complete. Final time ${format(snap.workElapsedMs / 1000)}`
    : 'Workout complete';
}

/** "0:42 Work · Conditioning Clock" while running or paused. */
export function documentTitle(
  state: RunState,
  digits: string,
  label: string,
): string {
  return state === 'running' || state === 'paused'
    ? `${digits} ${label} · ${APP_TITLE}`
    : APP_TITLE;
}

/** "10:00 (+0:10 get ready)" for the setup form. */
export function workoutLength(program: Program): string {
  const work = Number.isFinite(program.totalMs)
    ? format((program.totalMs - program.leadInMs) / 1000)
    : 'Open-ended';
  return program.leadInMs > 0
    ? `${work} (+${format(program.leadInMs / 1000)} get ready)`
    : work;
}
