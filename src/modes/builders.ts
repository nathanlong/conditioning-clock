import type {
  CommonConfig,
  Cue,
  FieldSpec,
  ModeConfig,
  ModeDefinition,
  ModeId,
  Program,
  Segment,
  SoundId,
  ValidationError,
} from '../core/types';

/** Cues closer together than this collide; the higher priority one wins. */
export const CUE_COLLISION_MS = 250;

/** Seconds of ticks before most boundaries. */
export const COUNTDOWN_SEC = 3;
/** Seconds of ticks out of the lead-in, and before EMOM/ETOT/Tabata boundaries. */
export const LONG_COUNTDOWN_SEC = 5;

const PRIORITY: Record<SoundId, number> = {
  finish: 3,
  go: 2,
  rest: 2,
  tick: 1,
  pace: 0,
};

/** The prepended lead-in segment, or nothing when disabled. */
export function leadIn(sec: number): Segment[] {
  if (sec <= 0) return [];
  return [
    { kind: 'leadIn', startMs: 0, durationMs: sec * 1000, direction: 'down' },
  ];
}

/** Alternating work/rest segments with round numbers, and no trailing rest. */
export function intervals({
  count,
  workMs,
  restMs = 0,
  startMs = 0,
}: {
  count: number;
  workMs: number;
  restMs?: number;
  startMs?: number;
}): Segment[] {
  const segments: Segment[] = [];
  let at = startMs;
  for (let round = 1; round <= count; round++) {
    const base = { direction: 'down', round, totalRounds: count } as const;
    segments.push({ kind: 'work', startMs: at, durationMs: workMs, ...base });
    at += workMs;
    if (restMs > 0 && round < count) {
      segments.push({ kind: 'rest', startMs: at, durationMs: restMs, ...base });
      at += restMs;
    }
  }
  return segments;
}

/**
 * `countdownSec` ticks (3-2-1 by default), then `sound` at the boundary. Ticks
 * within 1s of the previous segment's start are dropped, so short segments
 * don't overlap countdowns.
 */
export function boundaryCues(
  boundaryMs: number,
  sound: SoundId,
  prevSegmentStartMs: number,
  countdownSec = COUNTDOWN_SEC,
): Cue[] {
  const cues: Cue[] = [];
  for (let before = countdownSec; before >= 1; before--) {
    const atMs = boundaryMs - before * 1000;
    if (atMs >= 0 && atMs - prevSegmentStartMs >= 1000) {
      cues.push({ atMs, sound: 'tick' });
    }
  }
  cues.push({ atMs: boundaryMs, sound });
  return cues;
}

/**
 * Boundary cues for every segment start after the lead-in (`go` into work,
 * `rest` into rest), and `finish` at the end of a finite program. The
 * countdown out of the lead-in is always the long one.
 */
export function segmentCues(
  segments: Segment[],
  countdownSec = COUNTDOWN_SEC,
): Cue[] {
  const cues: Cue[] = [];
  segments.forEach((segment, i) => {
    if (segment.kind === 'leadIn') return;
    const prev = segments[i - 1];
    const prevStart = prev?.startMs ?? segment.startMs;
    const sound = segment.kind === 'work' ? 'go' : 'rest';
    const sec = prev?.kind === 'leadIn' ? LONG_COUNTDOWN_SEC : countdownSec;
    cues.push(...boundaryCues(segment.startMs, sound, prevStart, sec));
  });
  const last = segments.at(-1);
  if (last && Number.isFinite(last.durationMs)) {
    cues.push(
      ...boundaryCues(
        last.startMs + last.durationMs,
        'finish',
        last.startMs,
        countdownSec,
      ),
    );
  }
  return cues;
}

/**
 * Sorts cues and resolves collisions: of two cues within 250ms, the higher
 * priority one wins (finish > go/rest > tick > pace), then the earlier one.
 */
export function mergeCues(...lists: Cue[][]): Cue[] {
  const byPriority = lists
    .flat()
    .sort((a, b) => PRIORITY[b.sound] - PRIORITY[a.sound] || a.atMs - b.atMs);
  const kept: Cue[] = [];
  for (const cue of byPriority) {
    const collides = kept.some(
      (k) => Math.abs(k.atMs - cue.atMs) < CUE_COLLISION_MS,
    );
    if (!collides) kept.push(cue);
  }
  return kept.sort((a, b) => a.atMs - b.atMs);
}

/** Prepends the lead-in, offsets the body, and derives boundary cues. */
export function assemble({
  modeId,
  common,
  body,
  countdownSec = COUNTDOWN_SEC,
  extraCues = () => [],
  pace,
  display,
}: {
  modeId: ModeId;
  common: CommonConfig;
  /** Builds the body segments, starting at `startMs`. */
  body: (startMs: number) => Segment[];
  /** Ticks before each boundary after the lead-in. */
  countdownSec?: number;
  /** Mode-specific cues, given the boundary cues they must not crowd. */
  extraCues?: (boundary: Cue[], leadInMs: number) => Cue[];
  pace?: Program['pace'];
  /** Display options; `ticks` are given in ms after the lead-in. */
  display: Omit<Program['display'], 'ticks'> & {
    ticks?: { ring: 'main' | 'overall'; atMs: number[] };
  };
}): Program {
  const lead = leadIn(common.leadInSec);
  const leadInMs = lead[0]?.durationMs ?? 0;
  const segments = [...lead, ...body(leadInMs)];
  const boundary = segmentCues(segments, countdownSec);
  const last = segments.at(-1)!;
  const totalMs = last.startMs + last.durationMs;
  const { ticks, ...rest } = display;
  return {
    modeId,
    segments,
    cues: mergeCues(boundary, extraCues(boundary, leadInMs)),
    leadInMs,
    totalMs,
    ...(pace ? { pace } : {}),
    display: {
      ...rest,
      ...(ticks?.atMs.length
        ? {
            ticks: {
              ring: ticks.ring,
              at: ticks.atMs.map((ms) => ms / (totalMs - leadInMs)),
            },
          }
        : {}),
    },
  };
}

/** Past this many divisions, ticks would blur into a solid band. */
export const MAX_TICK_DIVISIONS = 60;

/**
 * Ticks at the start of each of `count` equal parts of `everyMs`, in ms after
 * the lead-in, so the first sits at 12 o'clock. None for one part, or too
 * many to read.
 */
export function divisionTicks(
  ring: 'main' | 'overall',
  count: number,
  everyMs: number,
): { ring: 'main' | 'overall'; atMs: number[] } | undefined {
  if (count < 2 || count > MAX_TICK_DIVISIONS) return undefined;
  return {
    ring,
    atMs: Array.from({ length: count }, (_, i) => i * everyMs),
  };
}

/** True when the field is shown (its enabling toggle, if any, is on). */
export function isFieldEnabled<C extends ModeConfig>(
  field: FieldSpec<C>,
  config: C,
): boolean {
  return !field.enabledBy || config[field.enabledBy] === true;
}

/** Range and whole-number checks for every enabled number field. */
export function validateFields<C extends ModeConfig>(
  fields: FieldSpec<C>[],
  config: C,
): ValidationError<C>[] {
  const errors: ValidationError<C>[] = [];
  for (const field of fields) {
    if (field.kind !== 'number' || !isFieldEnabled(field, config)) continue;
    const value = config[field.key];
    const { min = -Infinity, max = Infinity } = field;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        field: field.key,
        message: `${field.label} must be a whole number.`,
      });
    } else if (value < min || value > max) {
      errors.push({
        field: field.key,
        message: `${field.label} must be between ${min} and ${max}.`,
      });
    }
  }
  return errors;
}

/** Fixed-interval modes (EMOM, ETOT): `rounds` × `intervalSec` work segments. */
export function intervalMode({
  id,
  name,
  description,
  intervalSec,
  defaultRounds,
  maxRounds,
}: {
  id: ModeId;
  name: string;
  description: string;
  intervalSec: number;
  defaultRounds: number;
  maxRounds: number;
}): ModeDefinition<{ rounds: number }> {
  const fields: FieldSpec<{ rounds: number }>[] = [
    {
      key: 'rounds',
      label: 'Rounds',
      kind: 'number',
      min: 1,
      max: maxRounds,
      step: 1,
    },
  ];
  return {
    id,
    name,
    description,
    fields,
    defaults: { rounds: defaultRounds },
    validate: (config) => validateFields(fields, config),
    build: (config, common) =>
      assemble({
        modeId: id,
        common,
        body: (startMs) =>
          intervals({
            count: config.rounds,
            workMs: intervalSec * 1000,
            startMs,
          }),
        countdownSec: LONG_COUNTDOWN_SEC,
        display: {
          primaryRing: 'segment',
          overallRing: true,
          // Each new round's start on the overall ring.
          ticks: divisionTicks('overall', config.rounds, intervalSec * 1000),
        },
      }),
  };
}
