export type ModeId = 'emom' | 'etot' | 'amrap' | 'forTime' | 'tabata';
export type SegmentKind = 'leadIn' | 'work' | 'rest';
/** Countdown vs. count-up display. */
export type Direction = 'down' | 'up';
export type RunState = 'idle' | 'running' | 'paused' | 'finished';

export interface Segment {
  /** The UI derives the label: "Get Ready" / "Work" / "Rest". */
  kind: SegmentKind;
  /** Offset from program start. */
  startMs: number;
  /** Infinity for open-ended segments (For Time). */
  durationMs: number;
  direction: Direction;
  /** 1-based; absent for leadIn and single-segment modes. */
  round?: number;
  totalRounds?: number;
}

export type SoundId = 'tick' | 'go' | 'rest' | 'pace' | 'finish';

export interface Cue {
  /** Offset from program start. */
  atMs: number;
  sound: SoundId;
}

export interface Program {
  modeId: ModeId;
  /** Contiguous, sorted, no gaps. */
  segments: Segment[];
  /** Sorted by atMs, deduplicated. */
  cues: Cue[];
  /** 0 if disabled. */
  leadInMs: number;
  /** Includes lead-in; Infinity if open-ended. */
  totalMs: number;
  /** AMRAP only. */
  pace?: { intervalMs: number; repGoal: number };
  /** For Time only: a time to beat, in ms after the lead-in. Not an end. */
  goalMs?: number;
  display: {
    /** Fill per segment, or wrap every 60s (For Time). */
    primaryRing: 'segment' | 'minute';
    /** Show the outer overall-progress ring. */
    overallRing: boolean;
    /** Tick marks on a ring's outer edge, as 0–1 fractions of its circle. */
    ticks?: { ring: 'main' | 'overall'; at: number[] };
  };
}

export interface CommonConfig {
  /** Default 10, range 0–30, 0 disables. */
  leadInSec: number;
  /** 0–1. */
  volume: number;
  muted: boolean;
}

export type ConfigValue = number | boolean;
export type ModeConfig = Record<string, ConfigValue>;

export interface FieldSpec<C> {
  key: keyof C & string;
  /** Visible label, without the unit: "Work". */
  label: string;
  /** Appended to the label: "Work (seconds)". */
  unit?: string;
  kind: 'number' | 'toggle' | 'range';
  min?: number;
  max?: number;
  step?: number;
  /** A toggle field that reveals this one when on. */
  enabledBy?: keyof C & string;
}

export interface ValidationError<C> {
  field: keyof C & string;
  message: string;
}

export interface ModeDefinition<C extends ModeConfig> {
  id: ModeId;
  /** "EMOM" */
  name: string;
  /** One line, shown under the mode picker. */
  description: string;
  /** Drives the generic settings form. */
  fields: FieldSpec<C>[];
  defaults: C;
  /** Empty = valid. */
  validate(config: C): ValidationError<C>[];
  build(config: C, common: CommonConfig): Program;
}
